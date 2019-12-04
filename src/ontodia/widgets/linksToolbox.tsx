import * as React from 'react';

import { LinkCount } from '../data/model';
import { changeLinkTypeVisibility } from '../diagram/commands';
import { Element, FatLinkType } from '../diagram/elements';
import { CommandHistory } from '../diagram/history';
import { DiagramView } from '../diagram/view';

import { EditorController } from '../editor/editorController';

import { Debouncer } from '../viewUtils/async';
import { EventObserver } from '../viewUtils/events';
import { highlightSubstring } from '../widgets/listElementView';
import { ProgressBar, ProgressState } from '../widgets/progressBar';

interface LinkInToolBoxProps {
    view: DiagramView;
    link: FatLinkType;
    count: number;
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
        const history = this.props.view.model.history;
        changeLinkTypeState(history, state, [this.props.link]);
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
        const {link: linkType, view, filterKey} = this.props;
        const fullText = view.formatLabel(linkType.label, linkType.id);
        return highlightSubstring(fullText, filterKey);
    }

    render() {
        const newIcon = (this.props.link.isNew ? <span className='linkInToolBox__new-tag'>new</span> : '');
        const countIcon = (this.props.count > 0 ? <span className='ontodia-badge'>{this.props.count}</span> : '');
        const badgeContainer = (newIcon || countIcon ? <div>{newIcon}{countIcon}</div> : '');

        return (
            <li data-linktypeid={this.props.link.id} className='ontodia-list-group-item linkInToolBox clearfix'>
                <span className='ontodia-btn-group ontodia-btn-group-xs' data-toggle='buttons'>
                    <label className={
                            'ontodia-btn ontodia-btn-default' + (this.isChecked('invisible') ? ' active' : '')}
                        id='invisible' title='Hide links and labels'
                        onClick={() => this.changeState('invisible')}>
                        <span className='fa fa-times' aria-hidden='true' />
                    </label>
                    <label className={
                            'ontodia-btn ontodia-btn-default' + (this.isChecked('withoutLabels') ? ' active' : '')}
                        id='withoutLabels' title='Show links without labels'
                        onClick={() => this.changeState('withoutLabels')}>
                        <span className='fa fa-arrows-h' aria-hidden='true' />
                    </label>
                    <label className={
                            'ontodia-btn ontodia-btn-default' + (this.isChecked('allVisible') ? ' active' : '')}
                        id='allVisible' title='Show links with labels'
                        onClick={() => this.changeState('allVisible')}>
                        <span className='fa fa-text-width' aria-hidden='true' />
                    </label>
                </span>
                <div className='link-title'>{this.getText()}</div>
                {badgeContainer}
                <div className='linkInToolBox__filter-button' onClick={this.onPressFilter} />
            </li>
        );
    }
}

interface LinkTypesToolboxViewProps {
    view: DiagramView;
    links: ReadonlyArray<FatLinkType>;
    countMap: { readonly [linkTypeId: string]: number };
    selectedElement: Element;
    dataState: ProgressState;
    filterCallback: (type: FatLinkType) => void;
}

class LinkTypesToolboxView extends React.Component<LinkTypesToolboxViewProps, { filterKey: string }> {
    constructor(props: LinkTypesToolboxViewProps) {
        super(props);
        this.state = {filterKey: ''};
    }

    private compareLinks = (a: FatLinkType, b: FatLinkType) => {
        const {view} = this.props;
        const aText = view.formatLabel(a.label, a.id);
        const bText = view.formatLabel(b.label, b.id);
        return aText.localeCompare(bText);
    }

    private onChangeInput = (e: React.SyntheticEvent<HTMLInputElement>) => {
        this.setState({filterKey: e.currentTarget.value});
    }

    private onDropFilter = () => {
        this.setState({filterKey: ''});
    }

    private getLinks = () => {
        const {view, links = []} = this.props;
        return links.filter(linkType => {
            const text = view.formatLabel(linkType.label, linkType.id).toLowerCase();
            return !this.state.filterKey || text.indexOf(this.state.filterKey.toLowerCase()) >= 0;
        })
        .sort(this.compareLinks);
    }

    private getViews = (links: FatLinkType[]) => {
        const countMap = this.props.countMap || {};
        const views: React.ReactElement<any>[] = [];
        for (const link of links) {
            views.push(
                <LinkInToolBox key={link.id}
                    view={this.props.view}
                    link={link}
                    onPressFilter={this.props.filterCallback}
                    count={countMap[link.id] || 0}
                    filterKey={this.state.filterKey}
                />
            );
        }
        return views;
    }

    render() {
        const className = 'link-types-toolbox';
        const {view, dataState, selectedElement} = this.props;
        const history = view.model.history;

        const links = this.getLinks();
        const views = this.getViews(links);

        let connectedTo: JSX.Element | null = null;
        if (selectedElement) {
            const selectedElementLabel = view.formatLabel(
                selectedElement.data.label.values,
                selectedElement.iri
            );
            connectedTo = (
                <h4 className='links-heading' style={{display: 'block'}}>
                    Connected to{'\u00A0'}
                    <span>{selectedElementLabel}</span>
                </h4>
            );
        }

        let dropButton: JSX.Element | null = null;
        if (this.state.filterKey) {
            dropButton = <button type='button' className={`${className}__clearSearch`}
                onClick={this.onDropFilter}>
                <span className='fa fa-times' aria-hidden='true'></span>
            </button>;
        }

        return (
            <div className={className}>
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
                                onClick={() => changeLinkTypeState(history, 'invisible', links)}>
                                <span className='fa fa-times' aria-hidden='true' />
                            </label>
                            <label className='ontodia-btn ontodia-btn-default'
                                title='Show links without labels'
                                onClick={() => changeLinkTypeState(history, 'withoutLabels', links)}>
                                <span className='fa fa-arrows-h' aria-hidden='true' />
                            </label>
                            <label className='ontodia-btn ontodia-btn-default'
                                title='Show links with labels'
                                onClick={() => changeLinkTypeState(history, 'allVisible', links)}>
                                <span className='fa fa-text-width' aria-hidden='true' />
                            </label>
                        </div>
                        <span>&nbsp;Switch all</span>
                    </div>
                </div>
                <ProgressBar state={dataState} />
                <div className={`${className}__rest`}>
                    {connectedTo}
                    <div className='ontodia-scrollable'>
                        <ul className='ontodia-list-group connected-links'>{views}</ul>
                    </div>
                </div>
            </div>
        );
    }
}

export interface LinkTypesToolboxProps {
    view: DiagramView;
    editor: EditorController;
}

export interface LinkTypesToolboxState {
    readonly dataState?: ProgressState;
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

        const {view, editor} = this.props;

        this.listener.listen(view.events, 'changeLanguage', () => this.updateOnCurrentSelection());
        this.listener.listen(editor.model.events, 'loadingSuccess', () => this.updateOnCurrentSelection());
        this.listener.listen(editor.events, 'changeSelection', () => {
            this.debounceSelection.call(this.updateOnCurrentSelection);
        });

        this.state = {dataState: ProgressState.none};
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
        const {editor} = this.props;
        const single = editor.selection.length === 1 ? editor.selection[0] : null;
        if (single !== this.state.selectedElement && single instanceof Element) {
            this.requestLinksOf(single);
        }
    }

    private requestLinksOf(selectedElement: Element) {
        if (selectedElement) {
            const request = {elementId: selectedElement.iri};
            this.currentRequest = request;
            this.setState({dataState: ProgressState.loading, selectedElement});
            this.props.editor.model.dataProvider.linkTypesOf(request).then(linkTypes => {
                if (this.currentRequest !== request) { return; }
                const {linksOfElement, countMap} = this.computeStateFromRequestResult(linkTypes);
                this.subscribeOnLinksEvents(linksOfElement);
                this.setState({dataState: ProgressState.completed, linksOfElement, countMap});
            }).catch(error => {
                if (this.currentRequest !== request) { return; }
                // tslint:disable-next-line:no-console
                console.error(error);
                this.setState({dataState: ProgressState.error, linksOfElement: undefined, countMap: {}});
            });
        } else {
            this.currentRequest = null;
            this.setState({
                dataState: ProgressState.completed,
                selectedElement,
                linksOfElement: undefined,
                countMap: {},
            });
        }
    }

    private computeStateFromRequestResult(linkTypes: ReadonlyArray<LinkCount>) {
        const linksOfElement: FatLinkType[] = [];
        const countMap: { [linkTypeId: string]: number } = {};

        const model = this.props.editor.model;
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
        return <LinkTypesToolboxView view={view}
            dataState={dataState}
            links={linksOfElement}
            countMap={countMap}
            filterCallback={this.onAddToFilter}
            selectedElement={selectedElement}
        />;
    }

    private onAddToFilter = (linkType: FatLinkType) => {
        const {selectedElement} = this.state;
        selectedElement.addToFilter(linkType);
    }
}

function changeLinkTypeState(history: CommandHistory, state: LinkTypeVisibility, links: ReadonlyArray<FatLinkType>) {
    const batch = history.startBatch();
    const {visible, showLabel} = (
        state === 'invisible' ? {visible: false, showLabel: false} :
        state === 'withoutLabels' ? {visible: true, showLabel: false} :
        state === 'allVisible' ? {visible: true, showLabel: true} :
        undefined
    );
    for (const linkType of links) {
        history.execute(changeLinkTypeVisibility({linkType, visible, showLabel}));
    }
    batch.store();
}
