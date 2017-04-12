import * as _ from 'lodash';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as Backbone from 'backbone';

import LinkTypesToolboxModel from './linksToolboxModel';
import { Element, FatLinkType } from '../diagram/elements';
import DiagramView from '../diagram/view';
import { chooseLocalizedText } from '../diagram/model';

export { LinkTypesToolboxModel };
export interface LinkInToolBoxProps {
    link: FatLinkType;
    count: number;
    language?: string;
    onPressFilter?: (type: FatLinkType) => void;
    filterKey?: string;
}

import { LocalizedString } from '../data/model';
type Label = { values: LocalizedString[] };

type LinkTypeVisibility = 'invisible' | 'withoutLabels' | 'allVisible';

/**
 * Events:
 *     filter-click(link: FatLinkType) - when filter button clicked
 */
export class LinkInToolBox extends React.Component<LinkInToolBoxProps, {}> {
    constructor(props: LinkInToolBoxProps) {
        super(props);
    }

    private onPressFilter = () => {
        if (this.props.onPressFilter) {
            this.props.onPressFilter(this.props.link);
        }
    };

    private changeState = (state: LinkTypeVisibility) => {
        if (state === 'invisible') {
            this.props.link.setVisibility({visible: false, showLabel: false});
        } else if (state === 'withoutLabels') {
            this.props.link.setVisibility({visible: true, showLabel: false});
        } else if (state === 'allVisible') {
            this.props.link.setVisibility({visible: true, showLabel: true});
        }
    };

    private isChecked = (stateName: LinkTypeVisibility): boolean => {
        let curState: LinkTypeVisibility;
        if (!this.props.link.get('visible')) {
            curState = 'invisible';
        } else if (!this.props.link.get('showLabel')) {
            curState = 'withoutLabels';
        } else {
            curState = 'allVisible';
        }
        return stateName === curState;
    };

    private getText = () => {
        const label: Label = this.props.link.get('label');
        const fullText = chooseLocalizedText(label.values, this.props.language).text.toLowerCase();
        if (this.props.filterKey) {
            const filterKey = this.props.filterKey.toLowerCase();
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

    render() {
        const newIcon = (this.props.link.get('isNew') ? <span className='label label-warning'>new</span> : '');
        const countIcon = (this.props.count > 0 ? <span className='badge'>{this.props.count}</span> : '');
        const badgeContainer = (newIcon || countIcon ? <div>{newIcon}{countIcon}</div> : '');

        return (
            <li data-linkTypeId={this.props.link.id} className='list-group-item linkInToolBox clearfix'>
                <span className='btn-group btn-group-xs' data-toggle='buttons'>
                    <label className={'btn btn-default' + (this.isChecked('invisible') ? ' active' : '')}
                        id='invisible' title='Hide links and labels'
                        onClick={() => this.changeState('invisible')}>
                        <span className='fa fa-times' aria-hidden='true' />
                    </label>
                    <label className={'btn btn-default' + (this.isChecked('withoutLabels') ? ' active' : '')}
                        id='withoutLabels' title='Show links without labels'
                        onClick={() => this.changeState('withoutLabels')}>
                        <span className='fa fa-arrows-h' aria-hidden='true' />
                    </label>
                    <label className={'btn btn-default' + (this.isChecked('allVisible') ? ' active' : '')}
                        id='allVisible' title='Show links with labels'
                        onClick={() => this.changeState('allVisible')}>
                        <span className='fa fa-text-width' aria-hidden='true' />
                    </label>
                </span>
                <div className='link-title'>{this.getText()}</div>
                {badgeContainer}
                <a className='filter-button' onClick={this.onPressFilter}><img/></a>
            </li>
        );
    }
}

export interface LinkTypesToolboxProps extends Backbone.ViewOptions<LinkTypesToolboxModel> {
    links: FatLinkType[];
    countMap?: { [linkTypeId: string]: number };
    label?: { values: LocalizedString[] };
    language?: string;
    dataState?: string;
    filterCallback?: (type: FatLinkType) => void;
}

export class LinkTypesToolbox extends React.Component<LinkTypesToolboxProps, { filterKey: string }> {
    constructor(props: LinkTypesToolboxProps) {
        super(props);
        this.state = {filterKey: ''};
    }

    private compareLinks = (a: FatLinkType, b: FatLinkType) => {
        const aLabel: Label = a.get('label');
        const bLabel: Label = b.get('label');
        const aText = (aLabel ? chooseLocalizedText(aLabel.values, this.props.language).text.toLowerCase() : null);
        const bText = (bLabel ? chooseLocalizedText(bLabel.values, this.props.language).text.toLowerCase() : null);

        if (aText < bText) {
            return -1;
        }

        if (aText > bText) {
            return 1;
        }

        return 0;
    }

    private onChangeInput = (e: React.SyntheticEvent<HTMLInputElement>) => {
        this.setState({filterKey: e.currentTarget.value});
    }

    private onDropFilter = () => {
        this.setState({filterKey: ''});
    }

    private changeState = (state: LinkTypeVisibility, links: FatLinkType[]) => {
        if (state === 'invisible') {
            for (const link of links) {
                link.setVisibility({visible: false, showLabel: false});
            }
        } else if (state === 'withoutLabels') {
            for (const link of links) {
                link.setVisibility({visible: true, showLabel: false});
            }
        } else if (state === 'allVisible') {
            for (const link of links) {
                link.setVisibility({visible: true, showLabel: true});
            }
        }
    };

    private getLinks = () => {
        return (this.props.links || []).filter(link => {
            const label: Label = link.get('label');
            const text = (label ? chooseLocalizedText(label.values, this.props.language).text.toLowerCase() : null);
            return (!this.state.filterKey) || (text && text.indexOf(this.state.filterKey.toLowerCase()) !== -1);
        })
        .sort(this.compareLinks);
    }

    private getViews = (links: FatLinkType[]) => {
        const countMap = this.props.countMap || {};
        const views: React.ReactElement<any>[] = [];
        for (const link of links) {
            views.push(
                <LinkInToolBox
                    key={link.id}
                    link={link}
                    onPressFilter={this.props.filterCallback}
                    language={this.props.language}
                    count={countMap[link.id] || 0}
                    filterKey={this.state.filterKey}
                />
            );
        }
        return views;
    }

    render() {
        const className = 'link-types-toolbox';

        const dataState = this.props.dataState || null;
        const links = this.getLinks();
        const views = this.getViews(links);

        let connectedTo: React.ReactElement<any> = null;
        if (this.props.label) {
            const selectedElementLabel = chooseLocalizedText(
                this.props.label.values, this.props.language).text.toLowerCase();
            connectedTo = (
                <h4 className='links-heading' style={{display: 'block'}}>
                    Connected to{'\u00A0'}
                    <span>{selectedElementLabel}</span>
                </h4>
            );
        }

        let dropButton: React.ReactElement<any> = null;
        if (this.state.filterKey) {
            dropButton = <button type='button' className={`${className}__clearSearch`}
                onClick={this.onDropFilter}>
                <span className='fa fa-times' aria-hidden='true'></span>
            </button>;
        }

        return (
            <div className={`${className} stateBasedProgress`} data-state={dataState}>
                <div className={`${className}__heading`}>
                    <div className={`${className}__searching-box`}>
                        <input className='search-input form-control'
                            type='text'
                            value={this.state.filterKey}
                            onChange={this.onChangeInput}
                            placeholder='Search for...' />
                        {dropButton}
                    </div>
                    <div className={`${className}__switch-all`}>
                        <div className='btn-group btn-group-xs'>
                            <label className='btn btn-default'
                                title='Hide links and labels'
                                onClick={() => this.changeState('invisible', links)}>
                                <span className='fa fa-times' aria-hidden='true' />
                            </label>
                            <label className='btn btn-default'
                                title='Show links without labels'
                                onClick={() => this.changeState('withoutLabels', links)}>
                                <span className='fa fa-arrows-h' aria-hidden='true' />
                            </label>
                            <label className='btn btn-default'
                                title='Show links with labels'
                                onClick={() => this.changeState('allVisible', links)}>
                                <span className='fa fa-text-width' aria-hidden='true' />
                            </label>
                        </div>
                        <span>&nbsp;Switch all</span>
                    </div>
                </div>
                <div className='progress'>
                    <div className='progress-bar progress-bar-striped active'
                        role='progressbar'
                        aria-valuemin='0'
                        aria-valuemax='100'
                        aria-valuenow='100'
                        style={ {width: '100%'} }>
                    </div>
                </div>
                <div className={`${className}__rest`}>
                    {connectedTo}
                    <div className='link-lists'>
                        <ul className='list-group connected-links'>{views}</ul>
                    </div>
                </div>
            </div>
        );
    }
}

export interface LinkTypesToolboxShellProps extends Backbone.ViewOptions<LinkTypesToolboxModel> {
    view: DiagramView;
}

export class LinkTypesToolboxShell extends Backbone.View<LinkTypesToolboxModel> {
    private view: DiagramView;
    private dataState: string;
    private filterCallback: (type: FatLinkType) => void;
    private linksOfElement: FatLinkType[] = [];
    private countMap: { [linkTypeId: string]: number };

    constructor(public props: LinkTypesToolboxShellProps) {
        super(_.extend({ tagName: 'div' }, props));

        this.view = props.view;

        this.listenTo(this.view, 'change:language', this.render);
        this.listenTo(this.view.model, 'state:dataLoaded', this.render);
        this.listenTo(this.view, 'change:language', this.updateLinks);

        this.listenTo(this.view.selection, 'add remove reset', _.debounce(() => {
            const single = this.view.selection.length === 1
                ? this.view.selection.first() : null;
            if (single !== this.model.get('selectedElement')) {
                this.model.set('selectedElement', single);
            }
            this.updateLinks();
        }, 50));

        this.listenTo(this.model, 'state:beginQuery', () => { this.setDataState('querying'); });
        this.listenTo(this.model, 'state:queryError', () => this.setDataState('error'));
        this.listenTo(this.model, 'state:endQuery', () => {
            this.setDataState(this.model.connectionsOfSelectedElement ? 'finished' : null);
            this.updateLinks();
        });

        this.filterCallback = (linkType: FatLinkType) => {
            let selectedElement: Element = this.model.get('selectedElement');
            selectedElement.addToFilter(linkType);
        };
        this.render();
    }

    private setDataState(dataState: string) {
        this.dataState = dataState;
        this.render();
    }

    private updateLinks() {
        this.unsubscribeOnLinksEevents();

        if (this.model.connectionsOfSelectedElement) {
            this.countMap = this.model.connectionsOfSelectedElement;
            const linkTypeIds = _.keys(this.model.connectionsOfSelectedElement);
            this.linksOfElement = linkTypeIds.map(id => {
                return this.view.model.createLinkType(id);
            });
            this.subscribeOnLinksEevents(this.linksOfElement);
        } else {
           this.linksOfElement = null;
           this.countMap = {};
        }
        this.render();
    }

    private subscribeOnLinksEevents(linksOfElement: FatLinkType[]) {
        for (const link of linksOfElement) {
            this.listenTo(link, 'change:label', this.render);
            this.listenTo(link, 'change:visible', this.render);
            this.listenTo(link, 'change:showLabel', this.render);
        };
    }

    private unsubscribeOnLinksEevents() {
        if (!this.linksOfElement) { return; }
        for (const link of this.linksOfElement) {
            this.stopListening(link);
        }
    }

    public getReactComponent() {
        let selectedElement: Element = this.model.get('selectedElement');

        return (<LinkTypesToolbox links={this.linksOfElement} countMap={this.countMap}
            filterCallback={this.filterCallback} dataState={this.dataState}
            language={this.view.getLanguage()}
            label={selectedElement ? selectedElement.template.label : null}
        />);
    }

    render(): LinkTypesToolboxShell {
        ReactDOM.render(this.getReactComponent(), this.el);
        return this;
    }

    remove() {
        this.unsubscribeOnLinksEevents();
        return this;
    }
}

export default LinkTypesToolboxShell;
