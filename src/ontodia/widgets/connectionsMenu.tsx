import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { changeLinkTypeVisibility } from '../diagram/commands';
import { FatLinkType, Element } from '../diagram/elements';
import { boundsOf } from '../diagram/geometry';
import { Command } from '../diagram/history';
import { PaperArea, PaperWidgetProps } from '../diagram/paperArea';
import { DiagramView } from '../diagram/view';
import { restoreLinksBetweenElements, formatLocalizedLabel } from '../diagram/model';

import { Dictionary, LocalizedString, ElementModel, ElementIri, LinkTypeIri } from '../data/model';
import { EventObserver } from '../viewUtils/events';

type Label = { values: LocalizedString[] };
type ConnectionCount = { inCount: number; outCount: number };

export interface ReactElementModel {
    model: ElementModel;
    presentOnDiagram: boolean;
}

const MENU_OFFSET = 40;
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

export interface ConnectionsMenuProps extends PaperWidgetProps {
    view: DiagramView;
    target: Element;
    onClose: () => void;
    suggestProperties?: PropertySuggestionHandler;
}

export class ConnectionsMenu extends React.Component<ConnectionsMenuProps, {}> {
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
        const {view, target} = this.props;
        this.handler.listen(target.events, 'changePosition', this.updateAll);
        this.handler.listen(target.events, 'changeSize', this.updateAll);
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
        const {view, target} = this.props;

        this.loadingState = 'loading';
        this.links = [];
        this.countMap = {};
        view.model.dataProvider.linkTypesOf({elementId: target.iri})
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
            })
            .catch(err => {
                console.error(err);
                this.loadingState = 'error';
                this.updateAll();
            });
        this.updateAll();
    }

    private loadObjects(linkDataChunk: LinkDataChunk) {
        const {view, target} = this.props;
        const {link, direction, expectedCount } = linkDataChunk;
        const offset = (linkDataChunk.offset || 0);

        this.loadingState = 'loading';
        this.linkDataChunk = linkDataChunk;
        this.objects = [];

        view.model.dataProvider.linkElements({
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
        }).catch(err => {
            console.error(err);
            this.loadingState = 'error';
            this.updateAll();
        });
    }

    private addSelectedElements = (selectedObjects: ReactElementModel[]) => {
        const {view, target, onClose} = this.props;
        const batch = view.model.history.startBatch();

        const positionBoxSide = Math.round(Math.sqrt(selectedObjects.length)) + 1;
        const GRID_STEP = 100;
        const {x: targetX, y: targetY} = boundsOf(target);
        const startX = targetX - positionBoxSide * GRID_STEP / 2;
        const startY = targetY - positionBoxSide * GRID_STEP / 2;
        let xi = 0;
        let yi = 0;

        const addedElementIris: ElementIri[] = [];
        selectedObjects.forEach(el => {
            const element = view.model.createElement(el.model);
            addedElementIris.push(element.iri);

            if (xi > positionBoxSide) {
                xi = 0;
                yi++;
            }
            if (xi === Math.round(positionBoxSide / 2)) {
                xi++;
            }
            if (yi === Math.round(positionBoxSide / 2)) {
                yi++;
            }
            element.setPosition({
                x: startX + (xi++) * GRID_STEP,
                y: startY + (yi) * GRID_STEP,
            });
        });

        const linkType = this.linkDataChunk ? this.linkDataChunk.link : undefined;

        const hasChosenLinkType = this.linkDataChunk && linkType !== ALL_RELATED_ELEMENTS_LINK;
        if (hasChosenLinkType && !linkType.visible) {
            batch.history.execute(changeLinkTypeVisibility({
                linkType,
                visible: true,
                showLabel: true,
                preventLoading: true,
            }));
        }

        batch.history.execute(
            restoreLinksBetweenElements(view.model, addedElementIris)
        );
        batch.store();
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

        const {paperArea, view, target, suggestProperties} = this.props;
        return (
            <ConnectionsMenuMarkup
                target={target}
                paperArea={paperArea}
                connectionsData={connectionsData}
                objectsData={objectsData}
                state={this.loadingState}
                lang={view.getLanguage()}
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
    paperArea: PaperArea;

    connectionsData: {
        links: FatLinkType[];
        countMap: { [linkTypeId: string]: ConnectionCount };
    };

    objectsData?: ObjectsData;

    lang: string;
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
    constructor (props: ConnectionsMenuMarkupProps) {
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
    };

    private getTitle = () => {
        if (this.props.objectsData && this.state.panel === 'objects') {
            return 'Objects';
        } else if (this.props.connectionsData && this.state.panel === 'connections') {
            return 'Connections';
        }
        return 'Error';
    };

    private onExpandLink = (linkDataChunk: LinkDataChunk) => {
        this.setState({ filterKey: '',  panel: 'objects' });
        this.props.onExpandLink(linkDataChunk);
    };

    private onCollapseLink = () => {
        this.setState({ filterKey: '',  panel: 'connections' });
    };

    private getBreadCrumbs = () => {
        if (this.props.objectsData && this.state.panel === 'objects') {
            const link = this.props.objectsData.linkDataChunk.link;
            const localizedText = formatLocalizedLabel(link.id, link.label, this.props.lang).toLowerCase();

            return <span className='ontodia-connections-menu_bread-crumbs'>
                <a className='ontodia-connections-menu__link' onClick={this.onCollapseLink}>Connections</a>
                {'\u00A0' + '/' + '\u00A0'}
                {`${localizedText} (${this.props.objectsData.linkDataChunk.direction})`}
            </span>;
        } else {
            return null;
        }
    };

    private getBody = () => {
        if (this.props.state === 'error') {
            return <label className='ontodia-label ontodia-connections-menu__error'>Error</label>;
        } else if (this.props.objectsData && this.state.panel === 'objects') {
            return <ObjectsPanel
                data={this.props.objectsData}
                onMoveToFilter={this.props.onMoveToFilter}
                lang={this.props.lang}
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
                lang={this.props.lang}
                filterKey={this.state.filterKey}
                onExpandLink={this.onExpandLink}
                onMoveToFilter={this.props.onMoveToFilter}
                propertySuggestionCall={this.props.propertySuggestionCall}
                sortMode={this.state.sortMode}/>;
        } else {
            return <div/>;
        }
    };

    private onSortChange = (e: React.FormEvent<HTMLInputElement>) => {
        const value = (e.target as HTMLInputElement).value as SortMode;

        if (this.state.sortMode === value) { return; }

        this.setState({sortMode: value});
    }

    private renderSortSwitch = (id: string, icon: string, title: string) => {
        return (
            <div>
                <input
                    type="radio"
                    name="sort"
                    id={id}
                    value={id}
                    className="ontodia-connections-menu__sort-switch"
                    onChange={this.onSortChange}
                    checked={this.state.sortMode === id}
                />
                <label htmlFor={id} className="ontodia-connections-menu__sort-switch-label" title={title}>
                    <i className={`fa ${icon}`}/>
                </label>
            </div>
        );
    }

    private renderSortSwitches = () => {
        if (this.state.panel !== 'connections' || !this.props.propertySuggestionCall) { return null; }

        return (
            <div className="ontodia-connections-menu_search-line-sort-switches">
                {this.renderSortSwitch('alphabet', 'fa-sort-alpha-asc', 'Sort alphabetically')}
                {this.renderSortSwitch('smart', 'fa-lightbulb-o', 'Smart sort')}
            </div>
        );
    }

    render() {
        const bbox = boundsOf(this.props.target);
        const {x: x0, y: y0} = this.props.paperArea.paperToScrollablePaneCoords(bbox.x, bbox.y);
        const {x: x1, y: y1} = this.props.paperArea.paperToScrollablePaneCoords(
            bbox.x + bbox.width,
            bbox.y + bbox.height,
        );

        const style = {
            top: (y0 + y1) / 2 - 150,
            left: x1 + MENU_OFFSET,
            backgroundColor: 'white',
            border: '1px solid black',
        };

        return (
            <div className='ontodia-connections-menu' style={style}>
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
    lang: string;
    filterKey: string;

    onExpandLink?: (linkDataChunk: LinkDataChunk) => void;
    onMoveToFilter?: (linkDataChunk: LinkDataChunk) => void;

    propertySuggestionCall?: PropertySuggestionHandler;
    sortMode: SortMode;
}

class ConnectionsList extends React.Component<ConnectionsListProps, { scores: Dictionary<PropertyScore> }> {
    constructor (props: ConnectionsListProps) {
        super(props);
        this.state = { scores: {} };
        this.updateScores(props);
    }

    componentWillReceiveProps(newProps: ConnectionsListProps) {
        this.updateScores(newProps);
    }

    private updateScores = (props: ConnectionsListProps) => {
        if (props.propertySuggestionCall && (props.filterKey || props.sortMode === 'smart')) {
            const {id, data, lang, filterKey} = props;
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
        const aText = formatLocalizedLabel(a.id, a.label, this.props.lang).toLowerCase();
        const bText = formatLocalizedLabel(b.id, b.label, this.props.lang).toLowerCase();
        return (
            aText < bText ? -1 :
            aText > bText ? 1 :
            0
        );
    }

    private compareLinksByWeight = (a: FatLinkType, b: FatLinkType) => {
        const aText = formatLocalizedLabel(a.id, a.label, this.props.lang).toLowerCase();
        const bText = formatLocalizedLabel(b.id, b.label, this.props.lang).toLowerCase();

        const aWeight = this.state.scores[a.id] ? this.state.scores[a.id].score : 0;
        const bWeight = this.state.scores[b.id] ? this.state.scores[b.id].score : 0;

        return (
            aWeight > bWeight ? -1 :
            aWeight < bWeight ? 1 :
            aText.localeCompare(bText)
        );
    }

    private getLinks = () => {
        return (this.props.data.links || []).filter(link => {
            const text = formatLocalizedLabel(link.id, link.label, this.props.lang).toLowerCase();
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
        const countMap = this.props.data.countMap || {};
        const views: React.ReactElement<any>[] = [];

        for (const link of links) {
            ['in', 'out'].forEach((direction: 'in' | 'out') => {
               let count = 0;

               if (direction === 'in') {
                   count = countMap[link.id].inCount;
               } else if (direction === 'out') {
                   count = countMap[link.id].outCount;
               }

               if (count !== 0) {
                   const postfix = notSure ? '-probable' : '';
                   views.push(
                       <LinkInPopupMenu
                           key={`${direction}-${link.id}-${postfix}`}
                           link={link}
                           onExpandLink={this.props.onExpandLink}
                           lang={this.props.lang}
                           count={count}
                           direction={direction}
                           filterKey={notSure ? '' : this.props.filterKey}
                           onMoveToFilter={this.props.onMoveToFilter}
                           probability={
                               (this.state.scores[link.id] && notSure ? this.state.scores[link.id].score : 0)
                           }
                       />,
                   );
               }
            });
        }
        return views;
    };

    render() {
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
                        lang={this.props.lang}
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
    lang?: string;
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
        const link = this.props.link;
        const fullText = formatLocalizedLabel(this.props.link.id, this.props.link.label, this.props.lang);
        const probability = Math.round(this.props.probability * 100);
        const textLine = getColoredText(
            fullText + (probability > 0 ? ' (' + probability + '%)' : ''),
            this.props.filterKey,
        );
        const directionName =
            this.props.direction === 'in' ? 'source' :
            this.props.direction === 'out' ? 'target' :
            'all connected';
        const navigationTitle = `Navigate to ${directionName} "${fullText}" elements`;

        return (
            <li data-linkTypeId={this.props.link.id}
                className='link-in-popup-menu' title={navigationTitle}
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
                <a className='filter-button' onClick={this.onMoveToFilter}
                    title='Set as filter in the Instances panel'><img/></a>
                <div className='link-in-popup-menu__navigate-button' title={navigationTitle} />
            </li>
        );
    }
}

interface ObjectsPanelProps {
    data: ObjectsData;
    loading?: boolean;
    lang?: string;
    filterKey?: string;
    onPressAddSelected?: (selectedObjects: ReactElementModel[]) => void;
    onMoveToFilter?: (linkDataChunk: LinkDataChunk) => void;
}

interface ObjectsPanelState {
    checkMap: { readonly [id: string]: boolean };
}

class ObjectsPanel extends React.Component<ObjectsPanelProps, ObjectsPanelState> {
    constructor(props: ObjectsPanelProps) {
        super(props);
        this.state = {checkMap: selectNonPreseted(this.props.data.objects)};
    }

    componentWillReceiveProps(nextProps: ObjectsPanelProps) {
        if (this.props.data.objects.length < nextProps.data.objects.length) {
            this.setState({checkMap: selectNonPreseted(nextProps.data.objects)});
        }
    }

    private onCheckboxChanged = (object: ReactElementModel, newValue: boolean) => {
        const {checkMap} = this.state;
        if (checkMap[object.model.id] === newValue) {
            return;
        }
        const nextCheckMap = {...checkMap, [object.model.id]: newValue};
        this.setState({checkMap: nextCheckMap});
    }

    private onSelectAll = () => {
        const objects = this.props.data.objects;
        if (objects.length === 0) { return; }
        const allSelected = allNonPresentedAreSelected(objects, this.state.checkMap);
        const checkMap = allSelected ? {} : selectNonPreseted(this.props.data.objects);
        this.setState({checkMap});
    }

    private getFilteredObjects(): ReactElementModel[] {
        return this.props.data.objects.filter(element => {
            const label = element.model.label;
            const text  = formatLocalizedLabel(element.model.id, element.model.label.values, this.props.lang);
            return (!this.props.filterKey) || (text && text.indexOf(this.props.filterKey.toLowerCase()) !== -1);
        });
    }

    private getObjects(list: ReadonlyArray<ReactElementModel>) {
        const {checkMap} = this.state;
        const added: { [id: string]: true } = {};
        const result: React.ReactElement<any>[] = [];
        for (const obj of list) {
            if (added[obj.model.id]) { continue; }
            added[obj.model.id] = true;
            result.push(
                <ElementInPopupMenu
                    key={obj.model.id}
                    element={obj}
                    lang={this.props.lang}
                    filterKey={this.props.filterKey}
                    checked={checkMap[obj.model.id] || false}
                    onCheckedChanged={this.onCheckboxChanged}
                />
            );
        }
        return result;
    }

    private addSelected = () => {
        this.props.onPressAddSelected(
            this.getFilteredObjects().filter(el => this.state.checkMap[el.model.id] && !el.presentOnDiagram)
        );
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
        const {checkMap} = this.state;
        const objects = this.getFilteredObjects();
        const objectViews = this.getObjects(objects);
        const nonPresentedCount = objects.filter(el => !el.presentOnDiagram).length;
        const activeCount = objects.filter(el => checkMap[el.model.id]  && !el.presentOnDiagram).length;
        const allSelected = allNonPresentedAreSelected(objects, checkMap);

        return <div className='ontodia-connections-menu_objects-panel'>
            <div className='ontodia-connections-menu_objects-panel__select-all'>
                <label>
                    <input type='checkbox'
                        checked={allSelected && nonPresentedCount > 0}
                        onChange={this.onSelectAll}
                        disabled={nonPresentedCount === 0} />
                    Select All
                </label>
            </div>
            {(
                this.props.loading ?
                <label className='ontodia-label ontodia-connections-menu__loading-objects'>Loading...</label> :
                objectViews.length === 0 ?
                <label className='ontodia-label ontodia-connections-menu__loading-objects'>No available nodes</label> :
                <div className='ontodia-connections-menu_objects-panel_objects-list'>
                    {objectViews}
                    {this.props.data.linkDataChunk.expectedCount > MAX_LINK_COUNT ?
                        <div
                            className='element-in-popup-menu move-to-filter-line'
                            onClick={() => this.props.onMoveToFilter(this.props.data.linkDataChunk)}
                        >
                            The list was truncated, for more data click here to use the filter panel.
                        </div> : ''}
                </div>
            )}
            <div className='ontodia-connections-menu_objects-panel_bottom-panel'>
                {this.counter(activeCount)}
                <button className={
                        'ontodia-btn ontodia-btn-primary pull-right ' +
                        'ontodia-connections-menu_objects-panel_bottom-panel__add-button'
                    }
                    disabled={this.props.loading || activeCount === 0}
                    onClick={this.addSelected}>
                    Add selected
                </button>
            </div>
        </div>;
    }
}

function selectNonPreseted(objects: ReadonlyArray<ReactElementModel>) {
    const checkMap: { [id: string]: boolean } = {};
    for (const object of objects) {
        if (object.presentOnDiagram) { continue; }
        checkMap[object.model.id] = true;
    }
    return checkMap;
}

function allNonPresentedAreSelected(
    objects: ReadonlyArray<ReactElementModel>,
    checkMap: { readonly [id: string]: boolean }
): boolean {
    let allSelected = true;
    for (const object of objects) {
        if (object.presentOnDiagram) { continue; }
        const selected = Boolean(checkMap[object.model.id]);
        allSelected = allSelected && selected;
    }
    return allSelected;
}

interface ElementInPopupMenuProps {
    element: ReactElementModel;
    lang?: string;
    filterKey?: string;
    checked: boolean;
    onCheckedChanged: (object: ReactElementModel, value: boolean) => void;
}

class ElementInPopupMenu extends React.Component<ElementInPopupMenuProps, {}> {
    private onToggleCheckbox = () => {
        const {element, checked, onCheckedChanged} = this.props;
        if (this.props.element.presentOnDiagram) { return; }
        onCheckedChanged(element, !checked);
    }

    render() {
        const {element, lang, filterKey, checked} = this.props;
        const {model} = element;
        const fullText = formatLocalizedLabel(model.id, model.label.values, lang);
        const textLine = getColoredText(fullText, filterKey);
        return (
            <li data-linkTypeId={model.id}
                className={'element-in-popup-menu' + (checked ? '' : ' unchecked')}
                onClick={this.onToggleCheckbox}>
                <input type='checkbox' checked={checked}
                    onChange={() => {/*nothing*/}}
                    className='element-in-popup-menu__checkbox'
                    disabled={this.props.element.presentOnDiagram}/>
                <div className='element-in-popup-menu__link-label'
                    title={this.props.element.presentOnDiagram ?
                        'Element \'' + fullText + '\' already present on diagram!' : fullText}
                    style={{fontStyle: (this.props.element.presentOnDiagram ? 'italic' : 'inherit')}}>
                    {textLine}
                </div>
            </li>
        );
    }
}

function getColoredText(fullText: string, filterKey: string) {
    if (filterKey) {
        filterKey = filterKey.toLowerCase();
        const leftIndex =  fullText.toLowerCase().indexOf(filterKey);
        const rightIndex = leftIndex + filterKey.length;
        let firstPart = '';
        let selectedPart = '';
        let lastPart = '';

        if (leftIndex === 0) {
            selectedPart = fullText.substring(0, rightIndex);
        } else {
            firstPart = fullText.substring(0, leftIndex);
            selectedPart = fullText.substring(leftIndex, rightIndex);
        }
        if (rightIndex <= fullText.length) {
            lastPart = fullText.substring(rightIndex, fullText.length);
        }
        return <span>
            {firstPart}<span style={{color: 'darkred', fontWeight: 'bold'}}>{selectedPart}</span>{lastPart}
        </span>;
    } else {
        return <span>{fullText}</span>;
    }
}
