import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { FatLinkType, Element } from '../diagram/elements';
import { boundsOf } from '../diagram/geometry';
import { PaperArea, PaperWidgetProps } from '../diagram/paperArea';
import { DiagramView } from '../diagram/view';
import { chooseLocalizedText } from '../diagram/model';

import { Dictionary, LocalizedString, ElementModel } from '../data/model';

import { EventObserver } from './events';

type Label = { values: LocalizedString[] };
type ConnectionCount = { inCount: number; outCount: number };

export interface ReactElementModel {
    model: ElementModel;
    presentOnDiagram: boolean;
}

const MENU_OFFSET = 40;
const ALL_RELATED_ELEMENTS_LINK: FatLinkType = new FatLinkType({
    id: 'allRelatedElements',
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

export interface ConnectionsMenuProps extends PaperWidgetProps {
    view: DiagramView;
    target: Element;
    onClose: () => void;
    suggestProperties?: PropertySuggestionHandler;
}

export class ConnectionsMenu extends React.Component<ConnectionsMenuProps, void> {
    private container: HTMLElement;
    private readonly handler = new EventObserver();
    private readonly linkTypesListener = new EventObserver();
    private loadingState: 'loading' | 'error' | 'completed';

    private links: FatLinkType[];
    private countMap: { [linkTypeId: string]: ConnectionCount };

    private selectedLink: FatLinkType;
    private objects: ReactElementModel[];
    private direction: 'in' | 'out';

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
        view.model.dataProvider.linkTypesOf({elementId: target.data.id})
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
    }

    private loadObjects(link: FatLinkType, direction?: 'in' | 'out') {
        const {view, target} = this.props;

        this.loadingState = 'loading';
        this.selectedLink = link;
        this.objects = [];
        this.direction = direction;

        const {inCount, outCount} = this.countMap[link.id];
        const count =
            direction === 'in' ? inCount :
            direction === 'out' ? outCount :
            (inCount + outCount);

        const requestsCount = Math.ceil(count / 100);

        const requests: Promise<Dictionary<ElementModel>>[] = [];
        for (let i = 0; i < requestsCount; i++) {
            requests.push(
                view.model.dataProvider.linkElements({
                    elementId: target.data.id,
                    linkId: (link === ALL_RELATED_ELEMENTS_LINK ? undefined : this.selectedLink.id),
                    limit: 100,
                    offset: i * 100,
                    direction,
                })
            );
        }

        Promise.all(requests).then(results => {
            this.loadingState = 'completed';
            this.objects = [];
            results.forEach(elements => {
                Object.keys(elements).forEach(key => this.objects.push({
                    model: elements[key],
                    presentOnDiagram: Boolean(view.model.getElement(key)),
                }));
            });
            this.updateAll();
        }).catch(err => {
            console.error(err);
            this.loadingState = 'error';
            this.updateAll();
        });
    }

    private addSelectedElements = (selectedObjects: ReactElementModel[]) => {
        const {view, target, onClose} = this.props;

        const positionBoxSide = Math.round(Math.sqrt(selectedObjects.length)) + 1;
        const GRID_STEP = 100;
        const {x: targetX, y: targetY} = boundsOf(target);
        const startX = targetX - positionBoxSide * GRID_STEP / 2;
        const startY = targetY - positionBoxSide * GRID_STEP / 2;
        let xi = 0;
        let yi = 0;

        const addedElements: Element[] = [];
        selectedObjects.forEach(el => {
            let element = view.model.getElement(el.model.id);
            if (!element) { element = view.model.createElement(el.model); }
            addedElements.push(element);

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

        const hasChosenLinkType = this.selectedLink && this.selectedLink !== ALL_RELATED_ELEMENTS_LINK;
        if (hasChosenLinkType && !this.selectedLink.visible) {
            // prevent loading here because of .requestLinksOfType() call
            this.selectedLink.setVisibility({visible: true, showLabel: true, preventLoading: true});
        }

        view.model.requestElementData(addedElements);
        view.model.requestLinksOfType();

        onClose();
    }

    private onExpandLink = (link: FatLinkType, direction?: 'in' | 'out') => {
        if (this.selectedLink !== link || !this.objects || this.direction !== direction) {
            this.loadObjects(link, direction);
        }
        this.updateAll();
    }

    private onMoveToFilter = (link: FatLinkType, direction?: 'in' | 'out') => {
        const {view, target} = this.props;
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

        let objectsData: {
            selectedLink: FatLinkType;
            objects: ReactElementModel[];
        } = null;

        if (this.selectedLink && this.objects) {
            objectsData = {
                selectedLink: this.selectedLink,
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

    objectsData?: {
        selectedLink?: FatLinkType;
        objects: ReactElementModel[];
    };

    lang: string;
    state: 'loading' | 'error' | 'completed';

    onExpandLink?: (link: FatLinkType, direction?: 'in' | 'out') => void;
    onPressAddSelected?: (selectedObjects: ReactElementModel[]) => void;
    onMoveToFilter?: (link: FatLinkType, direction?: 'in' | 'out') => void;

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
        this.state.filterKey = e.currentTarget.value;
        this.setState(this.state);
    };

    private getTitle = () => {
        if (this.props.objectsData && this.state.panel === 'objects') {
            return 'Objects';
        } else if (this.props.connectionsData && this.state.panel === 'connections') {
            return 'Connections';
        }
        return 'Error';
    };

    private onExpandLink = (link: FatLinkType, direction?: 'in' | 'out') => {
        this.setState({ filterKey: '',  panel: 'objects' });
        this.props.onExpandLink(link, direction);
    };

    private onCollapseLink = () => {
        this.setState({ filterKey: '',  panel: 'connections' });
    };

    private getBreadCrumbs = () => {
        return (this.props.objectsData && this.state.panel === 'objects' ?
            <span className='ontodia-connections-menu_bread-crumbs'>
                <a className='ontodia-link' onClick={this.onCollapseLink}>Connections</a>{'\u00A0' + '/' + '\u00A0'}
                {
                    chooseLocalizedText(
                        this.props.objectsData.selectedLink.label,
                        this.props.lang
                    ).text.toLowerCase()
                }
            </span>
            : ''
        );
    };

    private getBody = () => {
        if (this.props.state === 'error') {
            return <label className='ontodia-label ontodia-connections-menu__error'>Error</label>;
        } else if (this.props.objectsData && this.state.panel === 'objects') {
            return <ObjectsPanel
                data={this.props.objectsData}
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
                        aria-valuemin='0'
                        aria-valuemax='100'
                        aria-valuenow='100'
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

    onExpandLink?: (link: FatLinkType, direction?: 'in' | 'out') => void;
    onMoveToFilter?: (link: FatLinkType, direction?: 'in' | 'out') => void;

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
        const aText = chooseLocalizedText(a.label, this.props.lang).text.toLowerCase();
        const bText = chooseLocalizedText(b.label, this.props.lang).text.toLowerCase();
        return (
            aText < bText ? -1 :
            aText > bText ? 1 :
            0
        );
    }

    private compareLinksByWeight = (a: FatLinkType, b: FatLinkType) => {
        const aText = chooseLocalizedText(a.label, this.props.lang).text.toLowerCase();
        const bText = chooseLocalizedText(b.label, this.props.lang).text.toLowerCase();

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
            const text = chooseLocalizedText(link.label, this.props.lang).text.toLowerCase();
            return !this.props.filterKey || (text && text.indexOf(this.props.filterKey.toLowerCase()) !== -1);
        })
        .sort(this.compareLinks);
    }

    private getProbableLinks = () => {
        const isSmartMode = this.isSmartMode();
        return (this.props.data.links || []).filter(link => {
            const text = chooseLocalizedText(link.label, this.props.lang).text.toLowerCase();
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
            if (links.length > 1 || (isSmartMode && probableViews.length > 1)) {
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
    onExpandLink?: (link: FatLinkType, direction?: 'in' | 'out') => void;
    onMoveToFilter?: (link: FatLinkType, direction?: 'in' | 'out') => void;
    probability?: number;
}

class LinkInPopupMenu extends React.Component<LinkInPopupMenuProps, {}> {
    constructor(props: LinkInPopupMenuProps) {
        super(props);
    }

    private onExpandLink = (direction?: 'in' | 'out') => {
        this.props.onExpandLink(this.props.link, direction);
    }

    private onMoveToFilter = (evt: React.MouseEvent<any>) => {
        evt.stopPropagation();
        this.props.onMoveToFilter(this.props.link, this.props.direction);
    }

    render() {
        const fullText = chooseLocalizedText(this.props.link.label, this.props.lang).text;
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
                onClick={() => this.onExpandLink(this.props.direction)}>
                {this.props.direction === 'in' || this.props.direction === 'out' ?
                <div className='link-in-popup-menu_direction'>
                    {this.props.direction === 'in' && <div className='link-in-popup-menu_direction__in-direction' />}
                    {this.props.direction === 'out' && <div className='link-in-popup-menu_direction__out-direction' />}
                </div>
                : null}
                <div className='link-in-popup-menu__link-title'>{textLine}</div>
                <span className='ontodia-badge link-in-popup-menu__count'>{this.props.count}</span>
                <a className='filter-button' onClick={this.onMoveToFilter}
                    title='Set as filter in the Instances panel'><img/></a>
                <div className='link-in-popup-menu__navigate-button' title={navigationTitle} />
            </li>
        );
    }
}

interface ObjectsPanelProps {
    data: {
        selectedLink?: FatLinkType;
        objects: ReactElementModel[]
    };
    loading?: boolean;
    lang?: string;
    filterKey?: string;
    onPressAddSelected?: (selectedObjects: ReactElementModel[]) => void;
}

class ObjectsPanel extends React.Component<ObjectsPanelProps, {
    checkMap: { [id: string]: boolean },
    selectAll: string,
}> {

    constructor(props: ObjectsPanelProps) {
        super(props);
        this.state  = { checkMap: {}, selectAll: 'checked' };
        this.updateCheckMap();
    }

    private updateCheckMap = () => {
        this.props.data.objects.forEach(element => {
            if (this.state.checkMap[element.model.id] === undefined) {
                this.state.checkMap[element.model.id] = true;
            }
        });
    };

    private onCheckboxChanged = (object: ReactElementModel, value: boolean) => {
        if (this.state.checkMap[object.model.id] === value) {
            return;
        }
        this.state.checkMap[object.model.id] = value;

        const filtered = this.getFilteredObjects().map(o => o.model.id);
        const keys = Object.keys(this.state.checkMap).filter(key => filtered.indexOf(key) !== -1);

        const unchekedListElementLength = keys.filter(key => !this.state.checkMap[key]).length;
        if (!value && unchekedListElementLength === keys.length) {
            this.state.selectAll = 'unchecked';
        } else if (unchekedListElementLength === 0) {
            this.state.selectAll = 'checked';
        } else {
            this.state.selectAll = 'undefined';
        }
        this.setState(this.state);
    };

    private onSelectAll = () => {
        let checked = !this.selectAllValue();
        if (checked) {
            this.state.selectAll = 'checked';
        } else {
            this.state.selectAll = 'unchecked';
        }
        const filtered = this.getFilteredObjects().filter(o => !o.presentOnDiagram).map(o => o.model.id);
        const keys = Object.keys(this.state.checkMap).filter(key => filtered.indexOf(key) !== -1);
        keys.forEach(key => {
            this.state.checkMap[key] = checked;
        });
        this.setState(this.state);
    };

    private selectAllValue = () => {
        if (this.state.selectAll === 'undefined' || this.state.selectAll === 'checked') {
            return true;
        } else {
            return false;
        }
    };

    private getFilteredObjects = (): ReactElementModel[] => {
        return this.props.data.objects
        .filter(element => {
            const label: Label = element.model.label;
            const text = (label ? chooseLocalizedText(label.values, this.props.lang).text.toLowerCase() : null);
            return (!this.props.filterKey) || (text && text.indexOf(this.props.filterKey.toLowerCase()) !== -1);
        });
    };

    private getObjects = (list: ReactElementModel[]) => {
        const keyMap: Dictionary<boolean> = {};
        return list.filter(obj => {
            if (keyMap[obj.model.id]) {
                return false;
            } else {
               keyMap[obj.model.id] = true;
               return true;
            }
        }).map(obj => {
            return <ElementInPopupMenu
                key={obj.model.id}
                element={obj}
                lang={this.props.lang}
                filterKey={this.props.filterKey}
                checked={this.state.checkMap[obj.model.id]}
                onCheckboxChanged={this.onCheckboxChanged}
            />;
        });
    };

    private addSelected = () => {
        this.props.onPressAddSelected(
            this.getFilteredObjects().filter(el => this.state.checkMap[el.model.id] && !el.presentOnDiagram)
        );
    };

    render() {
        this.updateCheckMap();
        const objects = this.getFilteredObjects();
        const objectViews = this.getObjects(objects);
        const activeObjCount = objects.filter(el => this.state.checkMap[el.model.id]  && !el.presentOnDiagram).length;
        const countString = activeObjCount.toString() + '\u00A0of\u00A0' + this.props.data.objects.length;
        return <div className='ontodia-connections-menu_objects-panel'>
            <div className='ontodia-connections-menu_objects-panel__select-all' onClick={this.onSelectAll}>
                <input className={this.state.selectAll === 'undefined' ? 'undefined' : ''}
                    type='checkbox' checked={this.selectAllValue()} onChange={() => {/*nothing*/}}
                    disabled={this.props.data.objects.length === 0}/>
                <span>Select All</span>
            </div>
            {(
                this.props.loading ?
                <label className='ontodia-label ontodia-connections-menu__loading-objects'>Loading...</label>
                : <div className='ontodia-connections-menu_objects-panel_objects-list'>
                    {objectViews}
                </div>
            )}
            <div className='ontodia-connections-menu_objects-panel_bottom-panel'>
                <label className='ontodia-label ontodia-connections-menu_objects-panel_bottom-panel__count-label'>
                    <span>{countString}</span>
                </label>
                <button className={
                        'ontodia-btn ontodia-btn-primary pull-right ' +
                        'ontodia-connections-menu_objects-panel_bottom-panel__add-button'
                    }
                    disabled={this.props.loading || activeObjCount === 0}
                    onClick={this.addSelected}>
                    Add selected
                </button>
            </div>
        </div>;
    }
}

interface ElementInPopupMenuProps {
    element: ReactElementModel;
    onCheckboxChanged?: (object: ReactElementModel, value: boolean) => void;
    lang?: string;
    checked?: boolean;
    filterKey?: string;
}

class ElementInPopupMenu extends React.Component<ElementInPopupMenuProps, { checked: boolean }> {
    constructor(props: ElementInPopupMenuProps) {
        super(props);
        this.state = { checked: this.props.checked };
    }

    private onCheckboxChange = () => {
        if (this.props.element.presentOnDiagram) {
            return;
        }
        this.state.checked = !this.state.checked;
        this.setState(this.state);
        this.props.onCheckboxChanged(this.props.element, this.state.checked);
    };

    componentWillReceiveProps(props: ElementInPopupMenuProps) {
        this.setState({ checked: props.checked });
    }

    render() {
        const fullText = chooseLocalizedText(this.props.element.model.label.values, this.props.lang).text;
        const textLine = getColoredText(fullText, this.props.filterKey);
        return (
            <li data-linkTypeId={this.props.element.model.id}
                className={
                    'element-in-popup-menu'
                    + (!this.state.checked ? ' unchecked' : '')
                }
                onClick={this.onCheckboxChange}
            >
                <input type='checkbox' checked={this.state.checked}
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
