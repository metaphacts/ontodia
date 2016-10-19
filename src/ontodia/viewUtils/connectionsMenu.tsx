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
    onNavigate: () => void;
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
        this.view.model.dataProvider.filter({
            refElementLinkId: this.selectedLink.id,
            refElementId: this.cellView.model.id,
            limit: 100,
            offset: 0,
            languageCode: this.view.getLanguage(),
        }).then(elements => {
            this.state = 'completed';
            this.objects = Object.keys(elements).map(key => elements[key]);
            this.render();
        }).catch(err => {
            console.error(err);
            this.state = 'error';
            this.render();
        });
    }

    private onExpandLink = (link: FatLinkType) => {
        if (this.selectedLink !== link || !this.objects) {
            this.loadObjects(link);
        }
        this.render();
    }

    private onCollapseLink = () => {
        this.selectedLink = null;
        this.objects = null;
        this.render();
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
            onCollapseLink: this.onCollapseLink,
            onClose: this.options.onClose,
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
    onCollapseLink?: () => void;
    onClose?: () => void;
}

export class ConnectionsMenuMarkup
    extends React.Component<ConnectionsMenuMarkupProps, {filterKey: string}> {

    constructor (props: ConnectionsMenuMarkupProps) {
        super(props);
        this.state = { filterKey: '' };
    }

    private onChangeFilter = (e) => {
        this.state.filterKey = e.target.value;
        this.setState(this.state);
    };

    private getTitle = () => {
        if (this.props.objectsData) {
            return 'Objects';
        } else if (this.props.connectionsData) {
            return 'Connections';
        }
        return 'Errror';
    }

    private getBreadCrumbs = () => {
        return (this.props.objectsData ?
            <span className='ontodia-connections-menu_bread-crumbs'>
                <a onClick={this.props.onCollapseLink}>Connections</a>{'\u00A0' + '/' + '\u00A0'}
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
        if (this.props.objectsData) {
            return <ObjectsPanel
                data={this.props.objectsData}
                lang={this.props.lang}
                filterKey={this.state.filterKey}
                loading={this.props.state === 'loading'}
            />;
        } else  if (this.props.connectionsData) {
            if (this.props.state === 'loading') {
                return <label className='ontodia-connections-menu__loading'>Loading...</label>;
            }
            return <ConnectionsList
                data={this.props.connectionsData}
                lange={this.props.lang}
                filterKey={this.state.filterKey}
                onExpandLink={this.props.onExpandLink}/>;
        }
        return <label className='ontodia-connections-menu__error'>Errror</label>;
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
    onExpandLink?: (FatLinkType) => void;
    filterKey?: string;
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
        fullText = this.props.link.label.values[0].text;
        if (this.props.filterKey) {
            const leftIndex =  fullText.indexOf(this.props.filterKey);
            const rightIndex = leftIndex + this.props.filterKey.length;
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

    render() {
        const countIcon = (this.props.count > 0 ?
            <span className='badge link-in-popup-menu__count'>{this.props.count}</span> : '');

        return (
            <li data-linkTypeId={this.props.link.id} className='link-in-popup-menu'>
                <div className='link-in-popup-menu__link-title'>{this.getText()}</div>
                {countIcon}
                <div className='link-in-popup-menu__navigate-button' onClick={this.onExpandLink}/>
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
}

export class ObjectsPanel extends React.Component<ObjectsPanelProps, {}> {
    constructor(props: ObjectsPanelProps) {
        super(props);
    }

    private getObjects = () => {
        return this.props.data.objects.filter(element => {
            const label: Label = element.label;
            const text = (label ? chooseLocalizedText(label.values, this.props.lang).text.toLowerCase() : null);
            return (!this.props.filterKey) || (text && text.indexOf(this.props.filterKey.toLowerCase()) !== -1);
        }).map(obj => {
            return <ElementInPopupMenu
                element={obj}
                lang={this.props.lang}
                filterKey={this.props.filterKey}
            />;
        });
    }

    render() {
        return <div className='ontodia-connections-menu_objects-panel'>
            {(
                this.props.loading ?
                <label className='ontodia-connections-menu__loading-objects'>Loading...</label>
                : <div className='ontodia-connections-menu_objects-panel_objects-list'>
                    {this.getObjects()}
                </div>
            )}
            <div className='ontodia-connections-menu_objects-panel_add-button-container'>
                <button className={'btn btn-primary ' +
                    'pull-right ' +
                    'ontodia-connections-menu_objects-panel_add-button-container__add-button ' +
                    (this.props.loading ? 'disabled' : '')
                }>
                    Add selected
                </button>
            </div>
        </div>;
    }
}

export interface ElementInPopupMenuProps {
    element: ElementModel;
    lang?: string;
    filterKey?: string;
}

export class ElementInPopupMenu extends React.Component<ElementInPopupMenuProps, {}> {
    constructor(props: ElementInPopupMenuProps) {
        super(props);
    }

    private getText = () => {
        let fullText;
        for (const value of this.props.element.label.values){
            if (value.lang === this.props.lang) {
                fullText = value.text;
                break;
            }
        }
        fullText = this.props.element.label.values[0].text;
        if (this.props.filterKey) {
            const leftIndex =  fullText.indexOf(this.props.filterKey);
            const rightIndex = leftIndex + this.props.filterKey.length;
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
            <li data-linkTypeId={this.props.element.id} className='element-in-popup-menu'>
                <input type='checkbox'/>
                <div className='element-in-popup-menu__link-label'>{this.getText()}</div>
            </li>
        );
    }
}
