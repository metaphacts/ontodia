import * as Backbone from 'backbone';
import * as joint from 'jointjs';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { FatLinkType } from '../diagram/elements';
import DiagramView from '../diagram/view';
import { chooseLocalizedText } from '../diagram/model';

import { LocalizedString } from '../data/model';
type Label = { values: LocalizedString[] };

const MENU_OFFSET = 20;

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

    private render = () => {
        ReactDOM.render(React.createElement(ConnectionsMenuMarkup, {
            cellView: this.options.cellView,
            onClose: this.options.onClose,
            links: this.links || [],
            countMap: this.countMap || {},
            state: this.state,
            lang: this.view.getLanguage(),
        }), this.container);
    };

    remove() {
        this.handler.stopListening();
        ReactDOM.unmountComponentAtNode(this.container);
        this.options.paper.el.removeChild(this.container);
    }
}

export interface Props {
    cellView: joint.dia.CellView;
    links: FatLinkType[];
    countMap: { [linkTypeId: string]: number };
    onClose: () => void;
    state: string;
    lang: string;
}

export class ConnectionsMenuMarkup extends React.Component<Props, { filterKey: string }> {

    constructor (props: Props) {
        super(props);
        this.state = { filterKey: '' };
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
        return (this.props.links || []).filter(link => {
            const label: Label = link.label;
            const text = (label ? chooseLocalizedText(label.values, this.props.lang).text.toLowerCase() : null);
            return (!this.state.filterKey) || (text && text.indexOf(this.state.filterKey.toLowerCase()) !== -1);
        })
        .sort(this.compareLinks);
    }

    private onExpandLink = () => {
        // 123
    }

    private getViews = (links: FatLinkType[]) => {
        const countMap = this.props.countMap || {};
        const views = [];
        for (const link of links) {
            views.push(
                <LinkInPopupMenu
                    key={link.id}
                    link={link}
                    onNavigateTo={this.onExpandLink}
                    lang={this.props.lang}
                    count={countMap[link.id] || 0}
                    filterKey={this.state.filterKey}
                />
                );
        }
        return views;
    }

    private onChangeFilter = (e) => {
        this.setState({filterKey: e.target.value});
    };

    render() {
        const bBox = this.props.cellView.getBBox();
        const style = {
            top: (bBox.y + bBox.height / 2 - 150),
            left: (bBox.x + bBox.width + MENU_OFFSET),
            backgroundColor: 'white',
            border: '1px solid black',
        };

        const links = this.getLinks();
        const views = this.getViews(links);

        return (
            <div className='ontodia-connections-menu' style={style}>
                <label className='ontodia-connections-menu__title-label'>Connections</label>
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
                    'ontodia-connections-menu_progress__progress-bar '
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
                <div className='ontodia-connections-menu_links-list'>{views}</div>
            </div>
        );
    }
}

export interface LinkInPopupMenuProps {
    link: FatLinkType;
    count: number;
    lang?: string;
    onNavigateTo?: (FatLinkType) => void;
    filterKey?: string;
}

/**
 * Events:
 *     filter-click(link: FatLinkType) - when filter button clicked
 */
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

    render() {
        const countIcon = (this.props.count > 0 ?
            <span className='badge link-in-popup-menu__count'>{this.props.count}</span> : '');

        return (
            <li data-linkTypeId={this.props.link.id} className='link-in-popup-menu'>
                <div className='link-in-popup-menu__link-title'>{this.getText()}</div>
                {countIcon}
                <div className='link-in-popup-menu__navigate-button'/>
                <a className='filter-button' onClick={this.props.onNavigateTo}><img/></a>
            </li>
        );
    }
}
