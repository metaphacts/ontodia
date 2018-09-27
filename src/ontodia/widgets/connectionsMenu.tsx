import * as React from 'react';

import { Dictionary, LocalizedString, ElementModel, ElementIri, LinkTypeIri, LinkCount } from '../data/model';

import { FatLinkType, Element } from '../diagram/elements';
import { DiagramView } from '../diagram/view';
import { formatLocalizedLabel } from '../diagram/model';

import { EditorController } from '../editor/editorController';
import { EventObserver } from '../viewUtils/events';
import { highlightSubstring } from './listElementView';
import { SearchResults } from './searchResults';

import { WorkspaceContextTypes, WorkspaceContextWrapper, WorkspaceEventKey } from '../workspace/workspaceContext';

interface Label { values: LocalizedString[]; }
interface ConnectionCount { inCount: number; outCount: number; }

export interface ReactElementModel {
    model: ElementModel;
    presentOnDiagram: boolean;
}

const MAX_LINK_COUNT = 100;
const ALL_RELATED_ELEMENTS_LINK: FatLinkType = new FatLinkType({
    id: 'allRelatedElements' as LinkTypeIri,
    label: [{lang: '', text: 'All'}],
});

export interface PropertySuggestionParams {
    elementId: string;
    token: string;
    properties: string[];
    lang: string;
}
export type PropertySuggestionHandler = (params: PropertySuggestionParams) => Promise<Dictionary<PropertyScore>>;

type SortMode = 'alphabet' | 'smart';

export interface PropertyScore {
    propertyIri: string;
    score: number;
}

export interface LinkDataChunk {
    link: FatLinkType;
    direction?: 'in' | 'out';
    expectedCount: number;
    offset?: number;
}

export interface ObjectsData {
    linkDataChunk: LinkDataChunk;
    objects: ReactElementModel[];
}

export interface ConnectionsMenuProps {
    view: DiagramView;
    editor: EditorController;
    target: Element;
    onClose: () => void;
    onAddElements: (elementIris: ElementIri[], linkType: FatLinkType | undefined) => void;
    suggestProperties?: PropertySuggestionHandler;
}

export class ConnectionsMenu extends React.Component<ConnectionsMenuProps, {}> {
    static contextTypes = WorkspaceContextTypes;
    readonly context: WorkspaceContextWrapper;

    private container: HTMLElement;
    private readonly handler = new EventObserver();
    private readonly linkTypesListener = new EventObserver();
    private loadingState: 'loading' | 'error' | 'completed';

    private links: FatLinkType[];
    private countMap: { [linkTypeId: string]: ConnectionCount };

    private linkDataChunk: LinkDataChunk;
    private objects: ReactElementModel[];

    private updateAll = () => this.forceUpdate();

    componentDidMount() {
        const {view} = this.props;
        this.handler.listen(view.events, 'changeLanguage', this.updateAll);

        this.loadLinks();
    }

    componentWillUnmount() {
        this.handler.stopListening();
        this.linkTypesListener.stopListening();
    }

    private resubscribeOnLinkTypeEvents(linkTypesOfElement: ReadonlyArray<FatLinkType>) {
        this.linkTypesListener.stopListening();
        for (const linkType of linkTypesOfElement) {
            this.linkTypesListener.listen(linkType.events, 'changeLabel', this.updateAll);
            this.linkTypesListener.listen(linkType.events, 'changeVisibility', this.updateAll);
        }
    }

    private loadLinks() {
        const {view, editor, target} = this.props;

        this.loadingState = 'loading';
        this.links = [];
        this.countMap = {};
        editor.model.dataProvider.linkTypesOf({elementId: target.iri})
            .then(linkTypes => {
                this.loadingState = 'completed';

                const countMap: Dictionary<ConnectionCount> = {};
                const links: FatLinkType[] = [];
                for (const {id: linkTypeId, inCount, outCount} of linkTypes) {
                    countMap[linkTypeId] = {inCount, outCount};
                    links.push(view.model.createLinkType(linkTypeId));
                }

                countMap[ALL_RELATED_ELEMENTS_LINK.id] = Object.keys(countMap)
                    .map(key => countMap[key])
                    .reduce((a, b) => {
                        return {inCount: a.inCount + b.inCount, outCount: a.outCount + b.outCount};
                    }, {inCount: 0, outCount: 0});

                this.countMap = countMap;
                this.links = links;
                this.resubscribeOnLinkTypeEvents(this.links);

                this.updateAll();

                this.context.ontodiaWorkspace.triggerWorkspaceEvent(WorkspaceEventKey.connectionsLoadLinks);
            })
            .catch(err => {
                // tslint:disable-next-line:no-console
                console.error(err);
                this.loadingState = 'error';
                this.updateAll();
            });
        this.updateAll();
    }

    private loadObjects(linkDataChunk: LinkDataChunk) {
        const {view, editor, target} = this.props;
        const {link, direction, expectedCount } = linkDataChunk;
        const offset = (linkDataChunk.offset || 0);

        this.loadingState = 'loading';
        this.linkDataChunk = linkDataChunk;
        this.objects = [];

        editor.model.dataProvider.linkElements({
            elementId: target.iri,
            linkId: (link === ALL_RELATED_ELEMENTS_LINK ? undefined : link.id),
            limit: offset + MAX_LINK_COUNT,
            offset: offset,
            direction,
        }).then(elements => {
            this.loadingState = 'completed';
            this.objects = Object.keys(elements).map(iri => ({
                model: elements[iri],
                presentOnDiagram: view.model.elements.findIndex(
                    element => element.iri === iri && element.group === undefined
                ) >= 0,
            }));
            this.updateAll();

            this.context.ontodiaWorkspace.triggerWorkspaceEvent(WorkspaceEventKey.connectionsLoadElements);
        }).catch(err => {
            // tslint:disable-next-line:no-console
            console.error(err);
            this.loadingState = 'error';
            this.updateAll();
        });
    }

    private addSelectedElements = (selectedObjects: ReactElementModel[]) => {
        const {onClose, onAddElements} = this.props;

        const addedElementsIris = selectedObjects.map(item => item.model.id);
        const linkType = this.linkDataChunk ? this.linkDataChunk.link : undefined;
        const hasChosenLinkType = this.linkDataChunk && linkType !== ALL_RELATED_ELEMENTS_LINK;

        onAddElements(addedElementsIris, hasChosenLinkType ? linkType : undefined);
        onClose();
    }

    private onExpandLink = (linkDataChunk: LinkDataChunk) => {
        const alreadyLoaded = (
            this.objects &&
            this.linkDataChunk &&
            this.linkDataChunk.link === linkDataChunk.link &&
            this.linkDataChunk.direction === linkDataChunk.direction
        );
        if (!alreadyLoaded) {
            this.loadObjects(linkDataChunk);
        }
        this.updateAll();

        this.context.ontodiaWorkspace.triggerWorkspaceEvent(WorkspaceEventKey.connectionsExpandLink);
    }

    private onMoveToFilter = (linkDataChunk: LinkDataChunk) => {
        const {view, target} = this.props;
        const {link, direction} = linkDataChunk;

        if (link === ALL_RELATED_ELEMENTS_LINK) {
            target.addToFilter();
        } else {
            const selectedElement = view.model.getElement(target.id);
            selectedElement.addToFilter(link, direction);
        }
    }

    render() {
        const connectionsData = {
            links: this.links || [],
            countMap: this.countMap || {},
        };

        let objectsData: ObjectsData = null;

        if (this.linkDataChunk && this.objects) {
            objectsData = {
                linkDataChunk: this.linkDataChunk,
                objects: this.objects,
            };
        }

        const {view, target, suggestProperties} = this.props;
        return (
            <ConnectionsMenuMarkup
                target={target}
                connectionsData={connectionsData}
                objectsData={objectsData}
                state={this.loadingState}
                view={view}
                onExpandLink={this.onExpandLink}
                onPressAddSelected={this.addSelectedElements}
                onMoveToFilter={this.onMoveToFilter}
                propertySuggestionCall={suggestProperties}
            />
        );
    }
}

interface ConnectionsMenuMarkupProps {
    target: Element;

    connectionsData: {
        links: FatLinkType[];
        countMap: { [linkTypeId: string]: ConnectionCount };
    };

    objectsData?: ObjectsData;

    view: DiagramView;
    state: 'loading' | 'error' | 'completed';

    onExpandLink?: (linkDataChunk: LinkDataChunk) => void;
    onPressAddSelected?: (selectedObjects: ReactElementModel[]) => void;
    onMoveToFilter?: (linkDataChunk: LinkDataChunk) => void;

    propertySuggestionCall?: PropertySuggestionHandler;
}

interface ConnectionsMenuMarkupState {
    filterKey?: string;
    panel?: string;
    sortMode?: SortMode;
}

class ConnectionsMenuMarkup extends React.Component<ConnectionsMenuMarkupProps, ConnectionsMenuMarkupState> {
    constructor(props: ConnectionsMenuMarkupProps) {
        super(props);
        this.state = {
            filterKey: '',
            panel: 'connections',
            sortMode: 'alphabet',
        };
    }

    private onChangeFilter = (e: React.FormEvent<HTMLInputElement>) => {
        const filterKey = e.currentTarget.value;
        this.setState({filterKey});
    }

    private getTitle = () => {
        if (this.props.objectsData && this.state.panel === 'objects') {
            return 'Objects';
        } else if (this.props.connectionsData && this.state.panel === 'connections') {
            return 'Connections';
        }
        return 'Error';
    }

    private onExpandLink = (linkDataChunk: LinkDataChunk) => {
        this.setState({ filterKey: '',  panel: 'objects' });
        this.props.onExpandLink(linkDataChunk);
    }

    private onCollapseLink = () => {
        this.setState({ filterKey: '',  panel: 'connections' });
    }

    private getBreadCrumbs = () => {
        if (this.props.objectsData && this.state.panel === 'objects') {
            const {link, direction} = this.props.objectsData.linkDataChunk;
            const lang = this.props.view.getLanguage();
            const localizedText = formatLocalizedLabel(link.id, link.label, lang).toLowerCase();

            return <span className='ontodia-connections-menu_bread-crumbs'>
                <a className='ontodia-connections-menu__link' onClick={this.onCollapseLink}>Connections</a>
                {'\u00A0' + '/' + '\u00A0'}
                {localizedText} {direction ? `(${direction})` : null}
            </span>;
        } else {
            return null;
        }
    }

    private getBody = () => {
        if (this.props.state === 'error') {
            return <label className='ontodia-label ontodia-connections-menu__error'>Error</label>;
        } else if (this.props.objectsData && this.state.panel === 'objects') {
            return <ObjectsPanel
                data={this.props.objectsData}
                onMoveToFilter={this.props.onMoveToFilter}
                view={this.props.view}
                filterKey={this.state.filterKey}
                loading={this.props.state === 'loading'}
                onPressAddSelected={this.props.onPressAddSelected}
            />;
        } else if (this.props.connectionsData && this.state.panel === 'connections') {
            if (this.props.state === 'loading') {
                return <label className='ontodia-label ontodia-connections-menu__loading'>Loading...</label>;
            }

            return <ConnectionsList
                id={this.props.target.id}
                data={this.props.connectionsData}
                view={this.props.view}
                filterKey={this.state.filterKey}
                onExpandLink={this.onExpandLink}
                onMoveToFilter={this.props.onMoveToFilter}
                propertySuggestionCall={this.props.propertySuggestionCall}
                sortMode={this.state.sortMode}/>;
        } else {
            return <div/>;
        }
    }

    private onSortChange = (e: React.FormEvent<HTMLInputElement>) => {
        const value = (e.target as HTMLInputElement).value as SortMode;

        if (this.state.sortMode === value) { return; }

        this.setState({sortMode: value});
    }

    private renderSortSwitch = (id: string, icon: string, title: string) => {
        return (
            <div>
                <input
                    type='radio'
                    name='sort'
                    id={id}
                    value={id}
                    className='ontodia-connections-menu__sort-switch'
                    onChange={this.onSortChange}
                    checked={this.state.sortMode === id}
                />
                <label htmlFor={id} className='ontodia-connections-menu__sort-switch-label' title={title}>
                    <i className={`fa ${icon}`}/>
                </label>
            </div>
        );
    }

    private renderSortSwitches = () => {
        if (this.state.panel !== 'connections' || !this.props.propertySuggestionCall) { return null; }

        return (
            <div className='ontodia-connections-menu_search-line-sort-switches'>
                {this.renderSortSwitch('alphabet', 'fa-sort-alpha-asc', 'Sort alphabetically')}
                {this.renderSortSwitch('smart', 'fa-lightbulb-o', 'Smart sort')}
            </div>
        );
    }

    render() {
        return (
            <div className='ontodia-connections-menu'>
                <label className='ontodia-label ontodia-connections-menu__title-label'>{this.getTitle()}</label>
                {this.getBreadCrumbs()}
                <div className='ontodia-connections-menu_search-line'>
                    <input
                        type='text'
                        className='search-input ontodia-form-control ontodia-connections-menu__search-line-input'
                        value={this.state.filterKey}
                        onChange={this.onChangeFilter}
                        placeholder='Search for...'
                    />
                    {this.renderSortSwitches()}
                </div>
                <div className={`ontodia-connections-menu__progress-bar ` +
                    `ontodia-connections-menu__progress-bar--${this.props.state}`}>
                    <div className='ontodia-progress-bar ontodia-progress-bar-striped active'
                        role='progressbar'
                        aria-valuemin={0} aria-valuemax={100} aria-valuenow={100}
                        style={{width: '100%'}}>
                    </div>
                </div>
                {this.getBody()}
            </div>
        );
    }
}

interface ConnectionsListProps {
    id: string;
    data: {
        links: FatLinkType[];
        countMap: { [linkTypeId: string]: ConnectionCount };
    };
    view: DiagramView;
    filterKey: string;

    onExpandLink?: (linkDataChunk: LinkDataChunk) => void;
    onMoveToFilter?: (linkDataChunk: LinkDataChunk) => void;

    propertySuggestionCall?: PropertySuggestionHandler;
    sortMode: SortMode;
}

class ConnectionsList extends React.Component<ConnectionsListProps, { scores: Dictionary<PropertyScore> }> {
    constructor(props: ConnectionsListProps) {
        super(props);
        this.state = { scores: {} };
        this.updateScores(props);
    }

    componentWillReceiveProps(newProps: ConnectionsListProps) {
        this.updateScores(newProps);
    }

    private updateScores = (props: ConnectionsListProps) => {
        if (props.propertySuggestionCall && (props.filterKey || props.sortMode === 'smart')) {
            const {id, data, view, filterKey} = props;
            const lang = view.getLanguage();
            const token = filterKey.trim();
            const properties = data.links.map(l => l.id);
            props.propertySuggestionCall({elementId: id, token, properties, lang}).then(scores =>
                this.setState({scores})
            );
        }
    }

    private isSmartMode(): boolean {
        return this.props.sortMode === 'smart' && !this.props.filterKey;
    }

    private compareLinks = (a: FatLinkType, b: FatLinkType) => {
        const lang = this.props.view.getLanguage();
        const aText = formatLocalizedLabel(a.id, a.label, lang).toLowerCase();
        const bText = formatLocalizedLabel(b.id, b.label, lang).toLowerCase();
        return (
            aText < bText ? -1 :
            aText > bText ? 1 :
            0
        );
    }

    private compareLinksByWeight = (a: FatLinkType, b: FatLinkType) => {
        const lang = this.props.view.getLanguage();
        const aText = formatLocalizedLabel(a.id, a.label, lang).toLowerCase();
        const bText = formatLocalizedLabel(b.id, b.label, lang).toLowerCase();

        const aWeight = this.state.scores[a.id] ? this.state.scores[a.id].score : 0;
        const bWeight = this.state.scores[b.id] ? this.state.scores[b.id].score : 0;

        return (
            aWeight > bWeight ? -1 :
            aWeight < bWeight ? 1 :
            aText.localeCompare(bText)
        );
    }

    private getLinks = () => {
        const lang = this.props.view.getLanguage();
        return (this.props.data.links || []).filter(link => {
            const text = formatLocalizedLabel(link.id, link.label, lang).toLowerCase();
            return !this.props.filterKey || (text && text.indexOf(this.props.filterKey.toLowerCase()) !== -1);
        })
        .sort(this.compareLinks);
    }

    private getProbableLinks = () => {
        const isSmartMode = this.isSmartMode();
        return (this.props.data.links || []).filter(link => {
            return this.state.scores[link.id] && (this.state.scores[link.id].score > 0 || isSmartMode);
        }).sort(this.compareLinksByWeight);
    }

    private getViews = (links: FatLinkType[], notSure?: boolean) => {
        const {view} = this.props;
        const countMap = this.props.data.countMap || {};

        const views: JSX.Element[] = [];
        const addView = (link: FatLinkType, direction: 'in' | 'out') => {
            const count = direction === 'in'
                ? countMap[link.id].inCount
                : countMap[link.id].outCount;
            if (count === 0) {
                return;
            }
            const postfix = notSure ? '-probable' : '';
            views.push(
                <LinkInPopupMenu
                    key={`${direction}-${link.id}-${postfix}`}
                    link={link}
                    onExpandLink={this.props.onExpandLink}
                    view={view}
                    count={count}
                    direction={direction}
                    filterKey={notSure ? '' : this.props.filterKey}
                    onMoveToFilter={this.props.onMoveToFilter}
                    probability={
                        (this.state.scores[link.id] && notSure ? this.state.scores[link.id].score : 0)
                    }
                />,
            );
        };

        for (const link of links) {
            addView(link, 'in');
            addView(link, 'out');
        }

        return views;
    }

    render() {
        const {view} = this.props;
        const isSmartMode = this.isSmartMode();

        const links = isSmartMode ? [] : this.getLinks();
        const probableLinks = this.getProbableLinks().filter(link => links.indexOf(link) === -1);
        const views = this.getViews(links);
        const probableViews = this.getViews(probableLinks, true);

        let viewList: React.ReactElement<any> | React.ReactElement<any>[];
        if (views.length === 0 && probableViews.length === 0) {
            viewList = <label className='ontodia-label ontodia-connections-menu_links-list__empty'>List empty</label>;
        } else {
            viewList = views;
            if (views.length > 1 || (isSmartMode && probableViews.length > 1)) {
                const countMap = this.props.data.countMap || {};
                const allRelatedElements = countMap[ALL_RELATED_ELEMENTS_LINK.id];
                viewList = [
                    <LinkInPopupMenu
                        key={ALL_RELATED_ELEMENTS_LINK.id}
                        link={ALL_RELATED_ELEMENTS_LINK}
                        onExpandLink={this.props.onExpandLink}
                        view={view}
                        count={allRelatedElements.inCount + allRelatedElements.outCount}
                        onMoveToFilter={this.props.onMoveToFilter}
                    />,
                <hr key='ontodia-hr-line' className='ontodia-connections-menu_links-list__hr'/>,
                ].concat(viewList);
            }
        }
        let probablePart = null;
        if (probableViews.length !== 0) {
            probablePart = [
                isSmartMode ? null : (
                    <li key='probable-links'><span className='ontodia-label'>Probably, you're looking for..</span></li>
                ),
                probableViews,
            ];
        }
        return <ul className={
            'ontodia-connections-menu_links-list '
                + (views.length === 0 && probableViews.length === 0 ? 'ocm_links-list-empty' : '')
        }>{viewList}{probablePart}</ul>;
    }
}

interface LinkInPopupMenuProps {
    link: FatLinkType;
    count: number;
    direction?: 'in' | 'out';
    view: DiagramView;
    filterKey?: string;
    onExpandLink?: (linkDataChunk: LinkDataChunk) => void;
    onMoveToFilter?: (linkDataChunk: LinkDataChunk) => void;
    probability?: number;
}

class LinkInPopupMenu extends React.Component<LinkInPopupMenuProps, {}> {
    constructor(props: LinkInPopupMenuProps) {
        super(props);
    }

    private onExpandLink = (expectedCount: number, direction?: 'in' | 'out') => {
        this.props.onExpandLink({
            link: this.props.link,
            direction,
            expectedCount,
        });
    }

    private onMoveToFilter = (evt: React.MouseEvent<any>) => {
        evt.stopPropagation();
        this.props.onMoveToFilter({
            link: this.props.link,
            direction: this.props.direction,
            expectedCount: this.props.count,
        });
    }

    render() {
        const {view, link} = this.props;
        const fullText = formatLocalizedLabel(link.id, link.label, view.getLanguage());
        const probability = Math.round(this.props.probability * 100);
        const textLine = highlightSubstring(
            fullText + (probability > 0 ? ' (' + probability + '%)' : ''),
            this.props.filterKey,
            {style: {color: 'darkred', fontWeight: 'bold'}}
        );
        const directionName =
            this.props.direction === 'in' ? 'source' :
            this.props.direction === 'out' ? 'target' :
            'all connected';

        return (
            <li data-linkTypeId={this.props.link.id}
                className='link-in-popup-menu' title={`${directionName} of "${fullText}" ${view.formatIri(link.id)}`}
                onClick={() => this.onExpandLink(this.props.count, this.props.direction)}>
                {this.props.direction === 'in' || this.props.direction === 'out' ?
                <div className='link-in-popup-menu_direction'>
                    {this.props.direction === 'in' && <div className='link-in-popup-menu_direction__in-direction' />}
                    {this.props.direction === 'out' && <div className='link-in-popup-menu_direction__out-direction' />}
                </div>
                : null}
                <div className='link-in-popup-menu__link-title'>{textLine}</div>
                <span className='ontodia-badge link-in-popup-menu__count'>
                    {this.props.count <= MAX_LINK_COUNT ? this.props.count : '100+'}
                </span>
                <div className='link-in-popup-menu__filter-button'
                    onClick={this.onMoveToFilter}
                    title='Set as filter in the Instances panel' />
                <div className='link-in-popup-menu__navigate-button'
                    title={`Navigate to ${directionName} "${fullText}" elements`} />
            </li>
        );
    }
}

interface ObjectsPanelProps {
    data: ObjectsData;
    loading?: boolean;
    view: DiagramView;
    filterKey?: string;
    onPressAddSelected?: (selectedObjects: ReactElementModel[]) => void;
    onMoveToFilter?: (linkDataChunk: LinkDataChunk) => void;
}

interface ObjectsPanelState {
    selection: ReadonlySet<ElementIri>;
}

class ObjectsPanel extends React.Component<ObjectsPanelProps, ObjectsPanelState> {
    constructor(props: ObjectsPanelProps) {
        super(props);
        this.state = {selection: new Set<ElementIri>()};
    }

    componentWillReceiveProps(nextProps: ObjectsPanelProps) {
        if (this.props.data.objects.length < nextProps.data.objects.length) {
            this.setState({selection: new Set<ElementIri>()});
        }
    }

    private onSelectAll = () => {
        const objects = this.props.data.objects;
        if (objects.length === 0) { return; }
        const allSelected = allNonPresentedAreSelected(objects, this.state.selection);
        const newSelection = allSelected ? new Set<ElementIri>() : selectNonPresented(this.props.data.objects);
        this.updateSelection(newSelection);
    }

    private getFilteredObjects(): ReactElementModel[] {
        if (!this.props.filterKey) {
            return this.props.data.objects;
        }
        const filterKey = this.props.filterKey.toLowerCase();
        const lang = this.props.view.getLanguage();
        return this.props.data.objects.filter(element => {
            const text  = formatLocalizedLabel(element.model.id, element.model.label.values, lang).toLowerCase();
            return text && text.indexOf(filterKey) >= 0;
        });
    }

    private getItems(list: ReadonlyArray<ReactElementModel>) {
        const added: { [id: string]: true } = {};
        const result: ElementModel[] = [];
        for (const obj of list) {
            if (added[obj.model.id]) { continue; }
            added[obj.model.id] = true;
            result.push(obj.model);
        }
        return result;
    }

    private updateSelection = (newSelection: ReadonlySet<ElementIri>) => {
        this.setState({selection: newSelection});
    }

    private counter = (activeObjCount: number) => {
        const countString = `${activeObjCount}\u00A0of\u00A0${this.props.data.objects.length}`;

        const wrongNodes =
            Math.min(MAX_LINK_COUNT, this.props.data.linkDataChunk.expectedCount) - this.props.data.objects.length;
        const wrongNodesString = Math.abs(wrongNodes) > MAX_LINK_COUNT ?
            `${MAX_LINK_COUNT}+` : Math.abs(wrongNodes).toString();
        const wrongNodesCount = wrongNodes === 0 ? '' : (wrongNodes < 0 ?
            `\u00A0(${wrongNodesString})` : `\u00A0(${wrongNodesString})`);
        const wrongNodesTitle = wrongNodes === 0 ? '' : (wrongNodes > 0 ? 'Unavailable nodes' : 'Extra nodes');

        return <div className='ontodia-label ontodia-connections-menu_objects-panel_bottom-panel__count-label'>
            <span>{countString}</span>
            <span className='ontodia-connections-menu_objects-panel_bottom-panel__extra-elements'
                  title={wrongNodesTitle}>
                {wrongNodesCount}
            </span>
        </div>;
    }

    render() {
        const {onPressAddSelected, filterKey} = this.props;
        const {selection} = this.state;
        const objects = this.getFilteredObjects();
        const isAllSelected = allNonPresentedAreSelected(objects, selection);

        const nonPresented = objects.filter(el => !el.presentOnDiagram);
        const active = nonPresented.filter(el => selection.has(el.model.id));

        return <div className='ontodia-connections-menu_objects-panel'>
            <div className='ontodia-connections-menu_objects-panel__select-all'>
                <label>
                    <input type='checkbox'
                        checked={isAllSelected && nonPresented.length > 0}
                        onChange={this.onSelectAll}
                        disabled={nonPresented.length === 0} />
                    Select All
                </label>
            </div>
            {(
                this.props.loading ?
                <label className='ontodia-label ontodia-connections-menu__loading-objects'>Loading...</label> :
                objects.length === 0 ?
                <label className='ontodia-label ontodia-connections-menu__loading-objects'>No available nodes</label> :
                <div className='ontodia-connections-menu_objects-panel_objects-list'>
                    <SearchResults
                        view={this.props.view}
                        items={this.getItems(objects)}
                        selection={this.state.selection}
                        onSelectionChanged={this.updateSelection}
                        highlightText={filterKey}
                    />
                    {this.props.data.linkDataChunk.expectedCount > MAX_LINK_COUNT ? (
                        <div className='ontodia-connections-menu__move-to-filter'
                            onClick={() => this.props.onMoveToFilter(this.props.data.linkDataChunk)}>
                            The list was truncated, for more data click here to use the filter panel
                        </div>
                    ) : null}
                </div>
            )}
            <div className='ontodia-connections-menu_objects-panel_bottom-panel'>
                {this.counter(active.length)}
                <button className={
                        'ontodia-btn ontodia-btn-primary pull-right ' +
                        'ontodia-connections-menu_objects-panel_bottom-panel__add-button'
                    }
                    disabled={this.props.loading || nonPresented.length === 0}
                    onClick={() => onPressAddSelected(active.length > 0 ? active : nonPresented)}>
                    {active.length > 0 ? 'Add selected' : 'Add all'}
                </button>
            </div>
        </div>;
    }
}

function selectNonPresented(objects: ReadonlyArray<ReactElementModel>) {
    const selection = new Set<ElementIri>();
    for (const object of objects) {
        if (object.presentOnDiagram) { continue; }
        selection.add(object.model.id);
    }
    return selection;
}

function allNonPresentedAreSelected(
    objects: ReadonlyArray<ReactElementModel>,
    selection: ReadonlySet<ElementIri>
): boolean {
    let allSelected = true;
    for (const object of objects) {
        if (object.presentOnDiagram) { continue; }
        allSelected = allSelected && selection.has(object.model.id);
    }
    return allSelected;
}
