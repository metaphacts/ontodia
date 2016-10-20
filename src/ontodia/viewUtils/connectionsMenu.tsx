import * as Backbone from 'backbone';
import * as joint from 'jointjs';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { FatLinkType } from '../diagram/elements';
import DiagramView from '../diagram/view';
import { chooseLocalizedText } from '../diagram/model';

import { LocalizedString, ElementModel } from '../data/model';
type Label = { values: LocalizedString[] };

const MENU_OFFSET = 40;

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
    private state: string;

    private links: FatLinkType[];
    private countMap: { [linkTypeId: string]: number };

    private selectedLink: FatLinkType;
    private objects: ElementModel[];

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

        this.loadLinks();
        this.render();
    }

    private loadLinks() {
        this.state = 'loading';
        this.links = [];
        this.countMap = {};
        this.view.model.dataProvider.linkTypesOf({elementId: this.cellView.model.id})
            .then(linkTypes => {
                this.state = 'completed';

                const countMap = {};
                const links = [];
                for (const linkCount of linkTypes) {
                    countMap[linkCount.id] = linkCount.count;
                    links.push(this.view.model.linkTypes[linkCount.id]);
                }
                this.countMap = countMap;
                this.links = links;

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

        const requests = [];

        for (let i = 0; i < requestsCount; i++) {
            requests.push(
                this.view.model.dataProvider.filter({
                    refElementLinkId: this.selectedLink.id,
                    refElementId: this.cellView.model.id,
                    limit: 100,
                    offset: i * 100,
                    languageCode: this.view.getLanguage(),
                }).catch(err => {
                    console.error(err);
                    return {};
                })
            );
        }
        Promise.all(requests)
        .then(results => {
            this.state = 'completed';
            this.objects = [];
            results.forEach(elements => {
                Object.keys(elements).forEach(key => this.objects.push(elements[key]));
            });
            this.render();
        }).catch(err => {
            console.error(err);
            this.state = 'error';
            this.render();
        });
    }

    private addSelectedElements = (selectedObjects: ElementModel[]) => {
        const positionBoxSide = Math.round(Math.sqrt(selectedObjects.length)) + 1;
        const GRID_STEP = 100;
        const bBox = this.cellView.getBBox();
        const startX = bBox.x - positionBoxSide * GRID_STEP / 2;
        const startY = bBox.y - positionBoxSide * GRID_STEP / 2;
        let xi = 0;
        let yi = 0;
        selectedObjects.forEach(el => {
            let element = this.view.model.elements[el.id];
            if (!element) {
                element = this.view.model.createElement(el);
            }
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
            element.set('presentOnDiagram', true);
        });
        this.options.onClose();
    }

    private onExpandLink = (link: FatLinkType) => {
        if (this.selectedLink !== link || !this.objects) {
            this.loadObjects(link);
        }
        this.render();
    }

    private onMoveToFilter = (link: FatLinkType) => {
        let selectedElement = this.view.model.elements[this.cellView.model.id];
        this.view.model.graph.trigger('add-to-filter', selectedElement, link);
        this.options.onClose();
    }

    private render = () => {
        const connectionsData = {
            links: this.links || [],
            countMap: this.countMap || {},
        };

        let objectsData = null;
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
        objects: ElementModel[];
    };

    lang: string;
    state: string; // 'loading', 'completed'

    onExpandLink?: (link: FatLinkType) => void;
    onPressAddSelected?: (selectedObjects: ElementModel[]) => void;
    onMoveToFilter?: (FatLinkType) => void;
}

export class ConnectionsMenuMarkup
    extends React.Component<ConnectionsMenuMarkupProps, {filterKey: string, panel: string}> {

    constructor (props: ConnectionsMenuMarkupProps) {
        super(props);
        this.state = { filterKey: '',  panel: 'connections' };
    }

    private onChangeFilter = (e) => {
        this.state.filterKey = e.target.value;
        this.setState(this.state);
    };

    private getTitle = () => {
        if (this.props.objectsData && this.state.panel === 'objects') {
            return 'Objects';
        } else if (this.props.connectionsData && this.state.panel === 'connections') {
            return 'Connections';
        }
        return 'Error';
    }

    private onExpandLink = (link: FatLinkType) => {
        this.setState({ filterKey: '',  panel: 'objects' });
        this.props.onExpandLink(link);
    }

    private onCollapseLink = () => {
        this.setState({ filterKey: '',  panel: 'connections' });
    }

    private getBreadCrumbs = () => {
        return (this.props.objectsData && this.state.panel === 'objects' ?
            <span className='ontodia-connections-menu_bread-crumbs'>
                <a onClick={this.onCollapseLink}>Connections</a>{'\u00A0' + '/' + '\u00A0'}
                {
                    chooseLocalizedText(
                        this.props.objectsData.selectedLink.label.values,
                        this.props.lang
                    ).text.toLowerCase()
                }
            </span>
            : ''
        );
    }

    private getBody = () => {
        if (this.props.objectsData && this.state.panel === 'objects') {
            return <ObjectsPanel
                data={this.props.objectsData}
                lang={this.props.lang}
                filterKey={this.state.filterKey}
                loading={this.props.state === 'loading'}
                onPressAddSelected={this.props.onPressAddSelected}
            />;
        } else  if (this.props.connectionsData  && this.state.panel === 'connections') {
            if (this.props.state === 'loading') {
                return <label className='ontodia-connections-menu__loading'>Loading...</label>;
            }
            return <ConnectionsList
                data={this.props.connectionsData}
                lange={this.props.lang}
                filterKey={this.state.filterKey}
                onExpandLink={this.onExpandLink}
                onMoveToFilter={this.props.onMoveToFilter}/>;
        }
        return <label className='ontodia-connections-menu__error'>Error</label>;
    }

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
                <div className={
                    'ontodia-connections-menu__progress-bar '
                        + (this.props.state === 'loading' ? 'state-loading' : '')
                }>
                    <div className='progress-bar progress-bar-striped active'
                        role='progressbar'
                        aria-valuemin='0'
                        aria-valuemax='100'
                        aria-valuenow='100'
                        style={ {width: '100%'} }>
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

    onExpandLink?: (FatLinkType) => void;
    onMoveToFilter?: (FatLinkType) => void;
}

export class ConnectionsList extends React.Component<ConnectionsListProps, {}> {

    constructor (props: ConnectionsListProps) {
        super(props);
    }

    private compareLinks = (a: FatLinkType, b: FatLinkType) => {
        const aLabel: Label = a.label;
        const bLabel: Label = b.label;
        const aText = (aLabel ? chooseLocalizedText(aLabel.values, this.props.lang).text.toLowerCase() : null);
        const bText = (bLabel ? chooseLocalizedText(bLabel.values, this.props.lang).text.toLowerCase() : null);

        if (aText < bText) {
            return -1;
        }

        if (aText > bText) {
            return 1;
        }

        return 0;
    }

    private getLinks = () => {
        return (this.props.data.links || []).filter(link => {
            const label: Label = link.label;
            const text = (label ? chooseLocalizedText(label.values, this.props.lang).text.toLowerCase() : null);
            return (!this.props.filterKey) || (text && text.indexOf(this.props.filterKey.toLowerCase()) !== -1);
        })
        .sort(this.compareLinks);
    }

    private getViews = (links: FatLinkType[]) => {
        const countMap = this.props.data.countMap || {};
        const views = [];
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
    }

    render() {
        const links = this.getLinks();
        const views = this.getViews(links);

        return <ul className={
            'ontodia-connections-menu_links-list '
                + (views.length === 0 ? 'ocm_links-list-empty' : '')
        }>{
            views.length === 0 ?
                <label className='ontodia-connections-menu_links-list__empty'>List empty</label>
                : views
        }</ul>;
    }
}

export interface LinkInPopupMenuProps {
    link: FatLinkType;
    count: number;
    lang?: string;
    filterKey?: string;
    onExpandLink?: (FatLinkType) => void;
    onMoveToFilter?: (FatLinkType) => void;
}

export class LinkInPopupMenu extends React.Component<LinkInPopupMenuProps, {}> {
    constructor(props: LinkInPopupMenuProps) {
        super(props);
    }

    private getText = () => {
        let fullText;
        for (const value of this.props.link.label.values){
            if (value.lang === this.props.lang) {
                fullText = value.text;
                break;
            }
        }
        fullText = this.props.link.label.values[0].text.toLowerCase();
        if (this.props.filterKey) {
            const filterKey = this.props.filterKey.toLowerCase();
            const leftIndex =  fullText.indexOf(filterKey);
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

    private onExpandLink = () => {
        this.props.onExpandLink(this.props.link);
    }

    private onMoveToFilter = (evt: Event) => {
        evt.stopPropagation();
        this.props.onMoveToFilter(this.props.link);
    }

    render() {
        const countIcon = (this.props.count > 0 ?
            <span className='badge link-in-popup-menu__count'>{this.props.count}</span> : '');

        return (
            <li data-linkTypeId={this.props.link.id} className='link-in-popup-menu' onClick={this.onExpandLink}>
                <div className='link-in-popup-menu__link-title'>{this.getText()}</div>
                {countIcon}
                <a className='filter-button' title='Move to filter panel' onClick={this.onMoveToFilter}><img/></a>
                <div className='link-in-popup-menu__navigate-button'/>
            </li>
        );
    }
}

export interface ObjectsPanelProps {
    data: {
        selectedLink: FatLinkType;
        objects: ElementModel[]
    };
    loading?: boolean;
    lang?: string;
    filterKey?: string;
    onPressAddSelected?: (selectedObjects: ElementModel[]) => void;
}

export class ObjectsPanel extends React.Component<ObjectsPanelProps, {}> {
    private checkMap: { [id: string]: boolean } = {};

    constructor(props: ObjectsPanelProps) {
        super(props);
        this.updateCheckMap();
    }

    private updateCheckMap = () => {
        this.props.data.objects.forEach(element => {
            if (this.checkMap[element.id] === undefined) {
                this.checkMap[element.id] = true;
            }
        });
    }

    private onChackboxChanged = (object: ElementModel, value: boolean) => {
        this.checkMap[object.id] = value;
    }

    private getObjects = () => {
        const keyMap = {};
        return this.props.data.objects.filter(element => {
            const label: Label = element.label;
            const text = (label ? chooseLocalizedText(label.values, this.props.lang).text.toLowerCase() : null);
            return (!this.props.filterKey) || (text && text.indexOf(this.props.filterKey.toLowerCase()) !== -1);
        }).map(obj => {
            if (!keyMap[obj.id]) {
                keyMap[obj.id] = 0;
            }
            return <ElementInPopupMenu
                key={obj.id + '_' + keyMap[obj.id]++}
                element={obj}
                lang={this.props.lang}
                filterKey={this.props.filterKey}
                checked={this.checkMap[obj.id]}
                onCheckboxChanged={this.onChackboxChanged}
            />;
        });
    }

    private addSelected = () => {
        this.props.onPressAddSelected(
            this.props.data.objects
                .filter(element => {
                    const label: Label = element.label;
                    const text = (label ? chooseLocalizedText(label.values, this.props.lang).text.toLowerCase() : null);
                    return (!this.props.filterKey) || (text && text.indexOf(this.props.filterKey.toLowerCase()) !== -1);
                })
                .filter(el => this.checkMap[el.id])
        );
    }

    render() {
        this.updateCheckMap();
        const objects = this.getObjects();
        return <div className='ontodia-connections-menu_objects-panel'>
            {(
                this.props.loading ?
                <label className='ontodia-connections-menu__loading-objects'>Loading...</label>
                : <div className='ontodia-connections-menu_objects-panel_objects-list'>
                    {objects}
                </div>
            )}
            <div className='ontodia-connections-menu_objects-panel_bottom-panel'>
                <label className='ontodia-connections-menu_objects-panel_bottom-panel__count-label'>
                    {objects.length} of {this.props.data.objects.length}
                </label>
                <button className={'btn btn-primary pull-right ' +
                    'ontodia-connections-menu_objects-panel_bottom-panel__add-button ' +
                    (this.props.loading ? 'disabled' : '')
                } onClick={this.addSelected}>
                    Add selected
                </button>
            </div>
        </div>;
    }
}

export interface ElementInPopupMenuProps {
    element: ElementModel;
    onCheckboxChanged?: (object: ElementModel, value: boolean) => void;
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
        this.state.checked = !this.state.checked;
        this.setState(this.state);
        this.props.onCheckboxChanged(this.props.element, this.state.checked);
    }

    componentWillReceiveProps(props: ElementInPopupMenuProps) {
        this.state = { checked: this.props.checked };
    }

    private getText = () => {
        let fullText;
        for (const value of this.props.element.label.values){
            if (value.lang === this.props.lang) {
                fullText = value.text;
                break;
            }
        }
        fullText = this.props.element.label.values[0].text.toLowerCase();
        if (this.props.filterKey) {
            const filterKey = this.props.filterKey.toLowerCase();
            const leftIndex =  fullText.indexOf(filterKey);
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

    render() {
        return (
            <li data-linkTypeId={this.props.element.id} className={
                'element-in-popup-menu' + (!this.state.checked ? ' unchecked' : '')
            }>
                <input type='checkbox' checked={this.state.checked}
                    onChange={this.onCheckboxChange}/>
                <div className='element-in-popup-menu__link-label'>{this.getText()}</div>
            </li>
        );
    }
}
