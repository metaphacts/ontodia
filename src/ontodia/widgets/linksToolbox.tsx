import * as React from 'react';
import * as _ from 'lodash';

import { LocalizedString, LinkCount } from '../data/model';
import { Element, FatLinkType } from '../diagram/elements';
import { DiagramView } from '../diagram/view';
import { chooseLocalizedText } from '../diagram/model';

import { Debouncer } from '../viewUtils/async';
import { EventObserver } from '../viewUtils/events';

interface LinkInToolBoxProps {
    link: FatLinkType;
    count: number;
    language?: string;
    onPressFilter?: (type: FatLinkType) => void;
    filterKey?: string;
}

type LinkTypeVisibility = 'invisible' | 'withoutLabels' | 'allVisible';

class LinkInToolBox extends React.Component<LinkInToolBoxProps, {}> {
    private onPressFilter = () => {
        if (this.props.onPressFilter) {
            this.props.onPressFilter(this.props.link);
        }
    }

    private changeState = (state: LinkTypeVisibility) => {
        if (state === 'invisible') {
            this.props.link.setVisibility({visible: false, showLabel: false});
        } else if (state === 'withoutLabels') {
            this.props.link.setVisibility({visible: true, showLabel: false});
        } else if (state === 'allVisible') {
            this.props.link.setVisibility({visible: true, showLabel: true});
        }
    }

    private isChecked = (stateName: LinkTypeVisibility): boolean => {
        let curState: LinkTypeVisibility;
        if (!this.props.link.visible) {
            curState = 'invisible';
        } else if (!this.props.link.showLabel) {
            curState = 'withoutLabels';
        } else {
            curState = 'allVisible';
        }
        return stateName === curState;
    }

    private getText = () => {
        const label = this.props.link.label;
        const fullText = chooseLocalizedText(label, this.props.language).text.toLowerCase();
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
        const newIcon = (this.props.link.isNew ? <span className='linkInToolBox__new-tag'>new</span> : '');
        const countIcon = (this.props.count > 0 ? <span className='ontodia-badge'>{this.props.count}</span> : '');
        const badgeContainer = (newIcon || countIcon ? <div>{newIcon}{countIcon}</div> : '');

        return (
            <li data-linkTypeId={this.props.link.id} className='ontodia-list-group-item linkInToolBox clearfix'>
                <span className='ontodia-btn-group ontodia-btn-group-xs' data-toggle='buttons'>
                    <label className={'ontodia-btn ontodia-btn-default' + (this.isChecked('invisible') ? ' active' : '')}
                        id='invisible' title='Hide links and labels'
                        onClick={() => this.changeState('invisible')}>
                        <span className='fa fa-times' aria-hidden='true' />
                    </label>
                    <label className={'ontodia-btn ontodia-btn-default' + (this.isChecked('withoutLabels') ? ' active' : '')}
                        id='withoutLabels' title='Show links without labels'
                        onClick={() => this.changeState('withoutLabels')}>
                        <span className='fa fa-arrows-h' aria-hidden='true' />
                    </label>
                    <label className={'ontodia-btn ontodia-btn-default' + (this.isChecked('allVisible') ? ' active' : '')}
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

interface LinkTypesToolboxViewProps {
    links: ReadonlyArray<FatLinkType>;
    countMap?: { readonly [linkTypeId: string]: number };
    label?: ReadonlyArray<LocalizedString>;
    language?: string;
    dataState?: string;
    filterCallback?: (type: FatLinkType) => void;
}

class LinkTypesToolboxView extends React.Component<LinkTypesToolboxViewProps, { filterKey: string }> {
    constructor(props: LinkTypesToolboxViewProps) {
        super(props);
        this.state = {filterKey: ''};
    }

    private compareLinks = (a: FatLinkType, b: FatLinkType) => {
        const aLabel = a.label;
        const bLabel = b.label;
        const aText = (aLabel ? chooseLocalizedText(aLabel, this.props.language).text.toLowerCase() : null);
        const bText = (bLabel ? chooseLocalizedText(bLabel, this.props.language).text.toLowerCase() : null);

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
    }

    private getLinks = () => {
        return (this.props.links || []).filter(link => {
            const label = link.label;
            const text = (label ? chooseLocalizedText(label, this.props.language).text.toLowerCase() : null);
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
                this.props.label, this.props.language).text.toLowerCase();
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
                        <input className='search-input ontodia-form-control'
                            type='text'
                            value={this.state.filterKey}
                            onChange={this.onChangeInput}
                            placeholder='Search for...' />
                        {dropButton}
                    </div>
                    <div className={`${className}__switch-all`}>
                        <div className='ontodia-btn-group ontodia-btn-group-xs'>
                            <label className='ontodia-btn ontodia-btn-default'
                                title='Hide links and labels'
                                onClick={() => this.changeState('invisible', links)}>
                                <span className='fa fa-times' aria-hidden='true' />
                            </label>
                            <label className='ontodia-btn ontodia-btn-default'
                                title='Show links without labels'
                                onClick={() => this.changeState('withoutLabels', links)}>
                                <span className='fa fa-arrows-h' aria-hidden='true' />
                            </label>
                            <label className='ontodia-btn ontodia-btn-default'
                                title='Show links with labels'
                                onClick={() => this.changeState('allVisible', links)}>
                                <span className='fa fa-text-width' aria-hidden='true' />
                            </label>
                        </div>
                        <span>&nbsp;Switch all</span>
                    </div>
                </div>
                <div className='ontodia-progress'>
                    <div className='ontodia-progress-bar ontodia-progress-bar-striped active'
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
                        <ul className='ontodia-list-group connected-links'>{views}</ul>
                    </div>
                </div>
            </div>
        );
    }
}

export interface LinkTypesToolboxProps {
    view: DiagramView;
}

export interface LinkTypesToolboxState {
    readonly dataState?: 'querying' | 'error' | 'finished';
    readonly selectedElement?: Element;
    readonly linksOfElement?: ReadonlyArray<FatLinkType>;
    readonly countMap?: { readonly [linkTypeId: string]: number };
}

export class LinkTypesToolbox extends React.Component<LinkTypesToolboxProps, LinkTypesToolboxState> {
    private readonly listener = new EventObserver();
    private readonly linkListener = new EventObserver();
    private readonly debounceSelection = new Debouncer(50 /* ms */);

    private currentRequest: { elementId: string } | undefined;

    constructor(props: LinkTypesToolboxProps, context: any) {
        super(props, context);

        const {view} = this.props;

        this.listener.listen(view.model.events, 'loadingSuccess', () => this.updateOnCurrentSelection());
        this.listener.listen(view.events, 'changeLanguage', () => this.updateOnCurrentSelection());
        this.listener.listen(view.events, 'changeSelection', () => {
            this.debounceSelection.call(this.updateOnCurrentSelection);
        });

        this.state = {};
    }

    componentDidMount() {
        this.updateOnCurrentSelection();
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.linkListener.stopListening();
        this.debounceSelection.dispose();
    }

    private updateOnCurrentSelection = () => {
        const {view} = this.props;
        const single = view.selection.length === 1 ? view.selection[0] : null;
        if (single !== this.state.selectedElement) {
            this.requestLinksOf(single);
        }
    }

    private requestLinksOf(selectedElement: Element) {
        if (selectedElement) {
            const request = {elementId: selectedElement.id};
            this.currentRequest = request;
            this.setState({dataState: 'querying', selectedElement});
            this.props.view.model.dataProvider.linkTypesOf(request).then(linkTypes => {
                if (this.currentRequest !== request) { return; }
                const {linksOfElement, countMap} = this.computeStateFromRequestResult(linkTypes);
                this.subscribeOnLinksEvents(linksOfElement);
                this.setState({dataState: 'finished', linksOfElement, countMap});
            }).catch(error => {
                if (this.currentRequest !== request) { return; }
                console.error(error);
                this.setState({dataState: 'error', linksOfElement: undefined, countMap: {}});
            });
        } else {
            this.currentRequest = null;
            this.setState({
                dataState: 'finished',
                selectedElement,
                linksOfElement: undefined,
                countMap: {},
            });
        }
    }

    private computeStateFromRequestResult(linkTypes: ReadonlyArray<LinkCount>) {
        const linksOfElement: FatLinkType[] = [];
        const countMap: { [linkTypeId: string]: number } = {};

        const model = this.props.view.model;
        for (const linkType of linkTypes) {
            const type = model.createLinkType(linkType.id);
            linksOfElement.push(type);
            countMap[linkType.id] = linkType.inCount + linkType.outCount;
        }

        return {linksOfElement, countMap};
    }

    private subscribeOnLinksEvents(linksOfElement: FatLinkType[]) {
        this.linkListener.stopListening();

        const listener = this.linkListener;
        for (const link of linksOfElement) {
            listener.listen(link.events, 'changeLabel', this.onLinkChanged);
            listener.listen(link.events, 'changeVisibility', this.onLinkChanged);
        }
    }

    private onLinkChanged = () => {
        this.forceUpdate();
    }

    render() {
        const {view} = this.props;
        const {selectedElement, dataState, linksOfElement, countMap} = this.state;
        return <LinkTypesToolboxView dataState={dataState}
            links={linksOfElement}
            countMap={countMap}
            filterCallback={this.onAddToFilter}
            language={view.getLanguage()}
            label={selectedElement ? selectedElement.data.label.values : null}
        />;
    }

    private onAddToFilter = (linkType: FatLinkType) => {
        const {selectedElement} = this.state;
        selectedElement.addToFilter(linkType);
    }
}
