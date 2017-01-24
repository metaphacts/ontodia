import * as Backbone from 'backbone';
import * as joint from 'jointjs';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { FatLinkType, Element } from '../diagram/elements';
import DiagramView from '../diagram/view';
import { chooseLocalizedText } from '../diagram/model';

import { Dictionary, LocalizedString, ElementModel } from '../data/model';

type Label = { values: LocalizedString[] };
export interface ReactElementModel {
    model: ElementModel;
    presentOnDiagram: boolean;
}

const MENU_OFFSET = 40;
const ALL_RELATED_ELEMENTS_LINK: FatLinkType = new FatLinkType({
    id: 'allRelatedElements',
    index: -1,
    label: { values: [{lang: '', text: 'All'}] },
    diagram: null,
});

export interface ConnectionsMenuOptions {
    paper: joint.dia.Paper;
    view: DiagramView;
    cellView: joint.dia.CellView;
    onClose: () => void;
}

export class ConnectionsMenu {
    private container: HTMLElement;
    private handler: Backbone.Model;
    private view: DiagramView;
    private state: 'loading' | 'error' | 'completed';

    private links: FatLinkType[];
    private countMap: { [linkTypeId: string]: number };

    private selectedLink: FatLinkType;
    private objects: ReactElementModel[];

    public cellView: joint.dia.CellView;

    constructor(private options: ConnectionsMenuOptions) {
        this.container = document.createElement('div');
        this.options.paper.el.appendChild(this.container);

        this.cellView = this.options.cellView;
        this.view = this.options.view;

        this.handler = new Backbone.Model();
        this.handler.listenTo(this.options.cellView.model,
            'change:isExpanded change:position change:size', this.render);
        this.handler.listenTo(this.options.paper, 'scale', this.render);
        this.handler.listenTo(this.view, 'change:language', this.render);

        this.loadLinks();
        this.render();
    }

    private subscribeOnLinksEevents(linksOfElement: FatLinkType[]) {
        for (const link of linksOfElement) {
            this.handler.listenTo(link, 'change:label', this.render);
            this.handler.listenTo(link, 'change:visible', this.render);
            this.handler.listenTo(link, 'change:showLabel', this.render);
        };
    }

    private unsubscribeOnLinksEevents(linksOfElement: FatLinkType[]) {
        for (const link of linksOfElement) {
            this.handler.stopListening(link);
        };
    }

    private loadLinks() {
        this.state = 'loading';
        this.links = [];
        this.countMap = {};
        this.view.model.dataProvider.linkTypesOf({elementId: this.cellView.model.id})
            .then(linkTypes => {
                this.state = 'completed';

                const countMap: Dictionary<number> = {};
                const links: FatLinkType[] = [];
                for (const linkCount of linkTypes) {
                    countMap[linkCount.id] = linkCount.count;
                    links.push(this.view.model.getLinkType(linkCount.id));
                }

                let totalCount = 0;
                Object.keys(countMap).forEach(key => totalCount += countMap[key]);
                countMap['allRelatedElements'] = totalCount;

                this.countMap = countMap;

                this.unsubscribeOnLinksEevents(this.links);
                this.links = links;
                this.subscribeOnLinksEevents(this.links);

                this.render();
            })
            .catch(err => {
                console.error(err);
                this.state = 'error';
                this.render();
            });
    }

    private loadObjects(link: FatLinkType) {
        this.state = 'loading';
        this.selectedLink = link;
        this.objects = [];
        const requestsCount = Math.ceil(this.countMap[link.id] / 100);

        const requests: Promise<Dictionary<ElementModel>>[] = [];
        for (let i = 0; i < requestsCount; i++) {
            requests.push(
                this.view.model.dataProvider.filter({
                    refElementLinkId: (link === ALL_RELATED_ELEMENTS_LINK ? undefined : this.selectedLink.id),
                    refElementId: this.cellView.model.id,
                    limit: 100,
                    offset: i * 100,
                    languageCode: this.view.getLanguage(),
                })
            );
        }

        Promise.all(requests).then(results => {
            this.state = 'completed';
            this.objects = [];
            results.forEach(elements => {
                Object.keys(elements).forEach(key => this.objects.push({
                    model: elements[key],
                    presentOnDiagram: Boolean(this.view.model.getElement(key)),
                }));
            });
            this.render();
        }).catch(err => {
            console.error(err);
            this.state = 'error';
            this.render();
        });
    }

    private addSelectedElements = (selectedObjects: ReactElementModel[]) => {
        const positionBoxSide = Math.round(Math.sqrt(selectedObjects.length)) + 1;
        const GRID_STEP = 100;
        let pos;
        if (this.cellView.model instanceof joint.dia.Element) {
            pos = this.cellView.model.position(); // the position() is more stable than getBBox
        } else {
            pos = this.cellView.getBBox();
        }
        const startX = pos.x - positionBoxSide * GRID_STEP / 2;
        const startY = pos.y - positionBoxSide * GRID_STEP / 2;
        let xi = 0;
        let yi = 0;

        const addedElements: Element[] = [];
        selectedObjects.forEach(el => {
            let element = this.view.model.getElement(el.model.id);
            if (!element) { element = this.view.model.createElement(el.model); }
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
            element.position(startX + (xi++) * GRID_STEP, startY + (yi) * GRID_STEP);
        });

        this.view.model.requestElementData(addedElements);
        this.options.view.adjustPaper();
        this.options.onClose();
    };

    private onExpandLink = (link: FatLinkType) => {
        if (this.selectedLink !== link || !this.objects) {
            this.loadObjects(link);
        }
        this.render();
    };

    private onMoveToFilter = (link: FatLinkType) => {
        if (link === ALL_RELATED_ELEMENTS_LINK) {
            const element = this.cellView.model as Element;
            element.addToFilter();
            // this.options.onClose();
        } else {
            let selectedElement = this.view.model.elements[this.cellView.model.id];
            selectedElement.addToFilter(link);
            // this.options.onClose();
        }
    };

    private render = () => {
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

        ReactDOM.render(React.createElement(ConnectionsMenuMarkup, {
            cellView: this.options.cellView,
            connectionsData: connectionsData,
            objectsData: objectsData,
            state: this.state,
            lang: this.view.getLanguage(),
            onExpandLink: this.onExpandLink,
            onPressAddSelected: this.addSelectedElements,
            onMoveToFilter: this.onMoveToFilter,
        }), this.container);
    };

    remove() {
        this.handler.stopListening();
        ReactDOM.unmountComponentAtNode(this.container);
        this.options.paper.el.removeChild(this.container);
    }
}

export interface ConnectionsMenuMarkupProps {
    cellView: joint.dia.CellView;

    connectionsData: {
        links: FatLinkType[];
        countMap: { [linkTypeId: string]: number };
    };

    objectsData?: {
        selectedLink?: FatLinkType;
        objects: ReactElementModel[];
    };

    lang: string;
    state: 'loading' | 'error' | 'completed';

    onExpandLink?: (link: FatLinkType) => void;
    onPressAddSelected?: (selectedObjects: ReactElementModel[]) => void;
    onMoveToFilter?: (link: FatLinkType) => void;
}

export class ConnectionsMenuMarkup
    extends React.Component<ConnectionsMenuMarkupProps, {filterKey: string, panel: string}> {

    constructor (props: ConnectionsMenuMarkupProps) {
        super(props);
        this.state = { filterKey: '',  panel: 'connections' };
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

    private onExpandLink = (link: FatLinkType) => {
        this.setState({ filterKey: '',  panel: 'objects' });
        this.props.onExpandLink(link);
    };

    private onCollapseLink = () => {
        this.setState({ filterKey: '',  panel: 'connections' });
    };

    private getBreadCrumbs = () => {
        return (this.props.objectsData && this.state.panel === 'objects' ?
            <span className='ontodia-connections-menu_bread-crumbs'>
                <a onClick={this.onCollapseLink}>Connections</a>{'\u00A0' + '/' + '\u00A0'}
                {
                    chooseLocalizedText(
                        this.props.objectsData.selectedLink.get('label').values,
                        this.props.lang
                    ).text.toLowerCase()
                }
            </span>
            : ''
        );
    };

    private getBody = () => {
        if (this.props.state === 'error') {
            return <label className='ontodia-connections-menu__error'>Error</label>;
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
                return <label className='ontodia-connections-menu__loading'>Loading...</label>;
            }
            return <ConnectionsList
                data={this.props.connectionsData}
                lang={this.props.lang}
                filterKey={this.state.filterKey}
                onExpandLink={this.onExpandLink}
                onMoveToFilter={this.props.onMoveToFilter}/>;
        } else {
            return <div/>;
        }
    };

    render() {
        const bBox = this.props.cellView.getBBox();
        const style = {
            top: (bBox.y + bBox.height / 2 - 150),
            left: (bBox.x + bBox.width + MENU_OFFSET),
            backgroundColor: 'white',
            border: '1px solid black',
        };

        return (
            <div className='ontodia-connections-menu' style={style}>
                <label className='ontodia-connections-menu__title-label'>{this.getTitle()}</label>
                {this.getBreadCrumbs()}
                <div className='ontodia-connections-menu_search-line'>
                    <input
                        type='text'
                        className='search-input form-control'
                        value={this.state.filterKey}
                        onChange={this.onChangeFilter}
                        placeholder='Search for...'
                    />
                </div>
                <div className={`ontodia-connections-menu__progress-bar ` +
                    `ontodia-connections-menu__progress-bar--${this.props.state}`}>
                    <div className='progress-bar progress-bar-striped active'
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

export interface ConnectionsListProps {
    data: {
        links: FatLinkType[];
        countMap: { [linkTypeId: string]: number };
    };
    lang: string;
    filterKey: string;

    onExpandLink?: (link: FatLinkType) => void;
    onMoveToFilter?: (link: FatLinkType) => void;
}

export class ConnectionsList extends React.Component<ConnectionsListProps, {}> {

    constructor (props: ConnectionsListProps) {
        super(props);
    }

    private compareLinks = (a: FatLinkType, b: FatLinkType) => {
        const aLabel: Label = a.get('label');
        const bLabel: Label = b.get('label');
        const aText = (aLabel ? chooseLocalizedText(aLabel.values, this.props.lang).text.toLowerCase() : null);
        const bText = (bLabel ? chooseLocalizedText(bLabel.values, this.props.lang).text.toLowerCase() : null);

        if (aText < bText) {
            return -1;
        }

        if (aText > bText) {
            return 1;
        }

        return 0;
    };

    private getLinks = () => {
        return (this.props.data.links || []).filter(link => {
            const label: Label = link.get('label');
            const text = (label ? chooseLocalizedText(label.values, this.props.lang).text.toLowerCase() : null);
            return (!this.props.filterKey) || (text && text.indexOf(this.props.filterKey.toLowerCase()) !== -1);
        })
        .sort(this.compareLinks);
    };

    private getViews = (links: FatLinkType[]) => {
        const countMap = this.props.data.countMap || {};
        const views: React.ReactElement<any>[] = [];
        for (const link of links) {
            views.push(
                <LinkInPopupMenu
                    key={link.id}
                    link={link}
                    onExpandLink={this.props.onExpandLink}
                    lang={this.props.lang}
                    count={countMap[link.id] || 0}
                    filterKey={this.props.filterKey}
                    onMoveToFilter={this.props.onMoveToFilter}
                />
            );
        }
        return views;
    };

    render() {
        const links = this.getLinks();
        const views = this.getViews(links);

        let viewList: React.ReactElement<any> | React.ReactElement<any>[];
        if (views.length === 0) {
            viewList = <label className='ontodia-connections-menu_links-list__empty'>List empty</label>;
        } else {
            viewList = views;
            if (links.length > 1) {
                const countMap = this.props.data.countMap || {};
                viewList = [
                    <LinkInPopupMenu
                        key={'allRelatedElements'}
                        link={ALL_RELATED_ELEMENTS_LINK}
                        onExpandLink={this.props.onExpandLink}
                        lang={this.props.lang}
                        count={countMap['allRelatedElements']}
                        onMoveToFilter={this.props.onMoveToFilter}
                    />,
                <hr key='ontodia-hr-line' className='ontodia-connections-menu_links-list__hr'/>,
                ].concat(viewList);
            }
        }

        return <ul className={
            'ontodia-connections-menu_links-list '
                + (views.length === 0 ? 'ocm_links-list-empty' : '')
        }>{viewList}</ul>;
    }
}

export interface LinkInPopupMenuProps {
    link: FatLinkType;
    count: number;
    lang?: string;
    filterKey?: string;
    onExpandLink?: (link: FatLinkType) => void;
    onMoveToFilter?: (link: FatLinkType) => void;
}

export class LinkInPopupMenu extends React.Component<LinkInPopupMenuProps, {}> {
    constructor(props: LinkInPopupMenuProps) {
        super(props);
    }

    private onExpandLink = () => {
        this.props.onExpandLink(this.props.link);
    };

    private onMoveToFilter = (evt: React.MouseEvent<any>) => {
        evt.stopPropagation();
        this.props.onMoveToFilter(this.props.link);
    };

    render() {
        const countIcon = (this.props.count > 0 ?
            <span className='badge link-in-popup-menu__count'>{this.props.count}</span> : '');

        const fullText = chooseLocalizedText(this.props.link.get('label').values, this.props.lang).text;
        const textLine = getColoredText(fullText, this.props.filterKey);

        return (
            <li data-linkTypeId={this.props.link.id} className='link-in-popup-menu' onClick={this.onExpandLink}>
                <div className='link-in-popup-menu__link-title'
                    title={'Naviagte to connected by link \'' + fullText + '\' elements'}
                >
                    {textLine}
                </div>
                {countIcon}
                <a className='filter-button' title='Move to filter panel' onClick={this.onMoveToFilter}><img/></a>
                <div className='link-in-popup-menu__navigate-button'
                    title={'Naviagte to connected by link \'' + fullText + '\' elements'}/>
            </li>
        );
    }
}

export interface ObjectsPanelProps {
    data: {
        selectedLink?: FatLinkType;
        objects: ReactElementModel[]
    };
    loading?: boolean;
    lang?: string;
    filterKey?: string;
    onPressAddSelected?: (selectedObjects: ReactElementModel[]) => void;
}

export class ObjectsPanel extends React.Component<ObjectsPanelProps, {
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
                <label className='ontodia-connections-menu__loading-objects'>Loading...</label>
                : <div className='ontodia-connections-menu_objects-panel_objects-list'>
                    {objectViews}
                </div>
            )}
            <div className='ontodia-connections-menu_objects-panel_bottom-panel'>
                <label className='ontodia-connections-menu_objects-panel_bottom-panel__count-label'>
                    <span>{countString}</span>
                </label>
                <button className={
                        'btn btn-primary pull-right ' +
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

export interface ElementInPopupMenuProps {
    element: ReactElementModel;
    onCheckboxChanged?: (object: ReactElementModel, value: boolean) => void;
    lang?: string;
    checked?: boolean;
    filterKey?: string;
}

export class ElementInPopupMenu extends React.Component<ElementInPopupMenuProps, { checked: boolean }> {
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
