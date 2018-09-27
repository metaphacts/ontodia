import * as React from 'react';

import { ElementModel, ElementIri, Dictionary } from '../data/model';
import { FilterParams } from '../data/provider';

import { Element as DiagramElement, FatLinkType, FatClassModel } from '../diagram/elements';
import { formatLocalizedLabel } from '../diagram/model';
import { DiagramView } from '../diagram/view';

import { AsyncModel } from '../editor/asyncModel';
import { EventObserver } from '../viewUtils/events';
import { SearchResults } from './searchResults';

import { WorkspaceContextTypes, WorkspaceContextWrapper, WorkspaceEventKey } from '../workspace/workspaceContext';

const DirectionInImage = require<string>('../../../images/direction-in.png');
const DirectionOutImage = require<string>('../../../images/direction-out.png');

export interface InstancesSearchProps {
    className?: string;
    model: AsyncModel;
    view: DiagramView;
    criteria: SearchCriteria;
    onCriteriaChanged: (criteria: SearchCriteria) => void;
}

export interface SearchCriteria {
    readonly text?: string;
    readonly elementType?: FatClassModel;
    readonly refElement?: DiagramElement;
    readonly refElementLink?: FatLinkType;
    readonly linkDirection?: 'in' | 'out';
}

export interface State {
    readonly inputText?: string;
    readonly quering?: boolean;
    readonly resultId?: number;
    readonly error?: any;
    readonly items?: ReadonlyArray<ElementModel>;
    readonly selection?: ReadonlySet<ElementIri>;
    readonly moreItemsAvailable?: boolean;
}

const CLASS_NAME = 'ontodia-instances-search';

export class InstancesSearch extends React.Component<InstancesSearchProps, State> {
    static contextTypes = WorkspaceContextTypes;
    readonly context: WorkspaceContextWrapper;

    private readonly listener = new EventObserver();

    private currentRequest: FilterParams;

    constructor(props: InstancesSearchProps, context: any) {
        super(props, context);
        this.state = {
            resultId: 0,
            selection: new Set<ElementIri>(),
        };
    }

    render() {
        const ENTER_KEY_CODE = 13;

        const className = `${CLASS_NAME} stateBasedProgress ${this.props.className || ''}`;
        const progressState =
            this.state.quering ? 'querying' :
            this.state.error ? 'error' :
            this.state.items ? 'finished' : undefined;

        const searchTerm = this.state.inputText === undefined
            ? this.props.criteria.text : this.state.inputText;

        return <div className={className} data-state={progressState}>
            <div className='ontodia-progress'>
                <div className='ontodia-progress-bar ontodia-progress-bar-striped active'
                    role='progressbar'
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={100}
                    style={{width: '100%'}}>
                </div>
            </div>
            <div className={`${CLASS_NAME}__criteria`}>
                {this.renderCriteria()}
                <div className={`${CLASS_NAME}__text-criteria ontodia-input-group`}>
                    <input type='text' className='ontodia-form-control' placeholder='Search for...'
                        value={searchTerm || ''}
                        onChange={e => this.setState({inputText: e.currentTarget.value})}
                        onKeyUp={e => {
                            if (e.keyCode === ENTER_KEY_CODE) {
                               this.submitCriteriaUpdate();
                            }
                        }} />
                    <span className='ontodia-input-group-btn'>
                        <button className='ontodia-btn ontodia-btn-default' type='button' title='Search'
                            onClick={() => this.submitCriteriaUpdate()}>
                            <span className='fa fa-search' aria-hidden='true'/>
                        </button>
                    </span>
                </div>
            </div>
            {/* specify resultId as key to reset scroll position when loaded new search results */}
            <div className={`${CLASS_NAME}__rest`} key={this.state.resultId}>
                <SearchResults
                    view={this.props.view}
                    items={this.state.items}
                    selection={this.state.selection}
                    onSelectionChanged={this.onSelectionChanged}
                />
                <div className={`${CLASS_NAME}__rest-end`}>
                    <button type='button'
                        className={`${CLASS_NAME}__load-more ontodia-btn ontodia-btn-primary`}
                        disabled={this.state.quering}
                        style={{display: this.state.moreItemsAvailable ? undefined : 'none'}}
                        onClick={() => this.queryItems(true)}>
                        <span className='fa fa-chevron-down' aria-hidden='true' />
                        &nbsp;Show more
                    </button>
                </div>
            </div>
        </div>;
    }

    private onSelectionChanged = (newSelection: ReadonlySet<ElementIri>) => {
        this.setState({selection: newSelection});
    }

    private renderCriteria(): React.ReactElement<any> {
        const {criteria = {}, view} = this.props;
        const criterions: React.ReactElement<any>[] = [];

        if (criteria.elementType) {
            const classInfo = criteria.elementType;
            const classLabel = formatLocalizedLabel(classInfo.id, classInfo.label, view.getLanguage());
            criterions.push(<div key='hasType' className={`${CLASS_NAME}__criterion`}>
                {this.renderRemoveCriterionButtons(() => this.props.onCriteriaChanged(
                    {...this.props.criteria, elementType: undefined}))}
                Has type <span className={`${CLASS_NAME}__criterion-class`}
                    title={classInfo.id}>{classLabel}</span>
            </div>);
        } else if (criteria.refElement) {
            const element = criteria.refElement;
            const elementLabel = formatLocalizedLabel(element.iri, element.data.label.values, view.getLanguage());

            const linkType = criteria.refElementLink;
            const linkTypeLabel = linkType
                ? formatLocalizedLabel(linkType.id, linkType.label, view.getLanguage()) : undefined;

            criterions.push(<div key='hasLinkedElement' className={`${CLASS_NAME}__criterion`}>
                {this.renderRemoveCriterionButtons(() => this.props.onCriteriaChanged(
                    {...this.props.criteria, refElement: undefined, refElementLink: undefined}))}
                Connected to <span className={`${CLASS_NAME}__criterion-element`}
                    title={element ? element.iri : undefined}>{elementLabel}</span>
                {linkType && <span>
                    {' through '}
                    <span className={`${CLASS_NAME}__criterion-link-type`}
                        title={linkType && linkType.id}>{linkTypeLabel}</span>
                    {criteria.linkDirection === 'in' && <span>
                        {' as '}<img className={`${CLASS_NAME}__link-direction`} src={DirectionInImage} />&nbsp;source
                    </span>}
                    {criteria.linkDirection === 'out' && <span>
                        {' as '}<img className={`${CLASS_NAME}__link-direction`} src={DirectionOutImage} />&nbsp;target
                    </span>}
                </span>}
            </div>);
        }

        return <div className={`${CLASS_NAME}__criterions`}>{criterions}</div>;
    }

    private renderRemoveCriterionButtons(onClick: () => void) {
        return <div className={`${CLASS_NAME}__criterion-remove ontoidia-btn-group ontodia-btn-group-xs`}>
            <button type='button' className='ontodia-btn ontodia-btn-default' title='Remove criteria'
                onClick={onClick}>
                <span className='fa fa-times' aria-hidden='true'></span>
            </button>
        </div>;
    }

    private submitCriteriaUpdate() {
        let text = this.state.inputText === undefined ? this.props.criteria.text : this.state.inputText;
        text = text === '' ? undefined : text;
        this.props.onCriteriaChanged({...this.props.criteria, text});
    }

    componentDidMount() {
        this.listener.listen(this.props.view.events, 'changeLanguage', () => this.forceUpdate());
        this.queryItems(false);
    }

    componentWillReceiveProps(nextProps: InstancesSearchProps) {
        const languageChanged = this.currentRequest
            ? this.currentRequest.languageCode !== nextProps.view.getLanguage() : false;

        if (this.props.criteria !== nextProps.criteria || languageChanged) {
            this.setState({inputText: undefined}, () => this.queryItems(false));
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.currentRequest = undefined;
    }

    private queryItems(loadMoreItems: boolean) {
        let request: FilterParams;
        if (loadMoreItems) {
            if (!this.currentRequest) {
                throw new Error('Cannot request more items without initial request.');
            }
            const {offset, limit} = this.currentRequest;
            request = {...this.currentRequest, offset: offset + limit};
        } else {
            request = createRequest(this.props.criteria, this.props.view.getLanguage());
        }

        if (!(request.text || request.elementTypeId || request.refElementId || request.refElementLinkId)) {
            this.setState({
                quering: false,
                error: undefined,
                items: undefined,
                selection: new Set<ElementIri>(),
                moreItemsAvailable: false,
            });
            return;
        }

        this.currentRequest = request;
        this.setState({
            quering: true,
            error: undefined,
            moreItemsAvailable: false,
        });

        this.props.model.dataProvider.filter(request).then(elements => {
            if (this.currentRequest !== request) { return; }
            this.processFilterData(elements);
            this.context.ontodiaWorkspace.triggerWorkspaceEvent(WorkspaceEventKey.searchQueryItem);
        }).catch(error => {
            if (this.currentRequest !== request) { return; }
            // tslint:disable-next-line:no-console
            console.error(error);
            this.setState({quering: false, error});
        });
    }

    private processFilterData(elements: Dictionary<ElementModel>) {
        const requestedAdditionalItems = this.currentRequest.offset > 0;

        const existingIris: { [iri: string]: true } = {};

        if (requestedAdditionalItems) {
            this.state.items.forEach(item => existingIris[item.id] = true);
        }

        const items = requestedAdditionalItems ? [...this.state.items] : [];
        for (const iri in elements) {
            if (!elements.hasOwnProperty(iri)) { continue; }
            if (existingIris[iri]) { continue; }
            items.push(elements[iri]);
        }

        const moreItemsAvailable = Object.keys(elements).length >= this.currentRequest.limit;

        if (requestedAdditionalItems) {
            this.setState({quering: false, items, error: undefined, moreItemsAvailable});
        } else {
            this.setState({
                quering: false,
                resultId: this.state.resultId + 1,
                items,
                selection: new Set<ElementIri>(),
                error: undefined,
                moreItemsAvailable,
            });
        }
    }
}

function createRequest(criteria: SearchCriteria, language: string): FilterParams {
    const {text, elementType, refElement, refElementLink, linkDirection} = criteria;
    return {
        text,
        elementTypeId: elementType ? elementType.id : undefined,
        refElementId: refElement ? refElement.iri : undefined,
        refElementLinkId: refElementLink ? refElementLink.id : undefined,
        linkDirection,
        offset: 0,
        limit: 100,
        languageCode: language || 'en',
    };
}
