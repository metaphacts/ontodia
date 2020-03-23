import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';
import { LinkModel, ElementModel, sameLink } from '../data/model';
import { PLACEHOLDER_LINK_TYPE } from '../data/schema';

import { EditorController } from '../editor/editorController';
import { FatLinkType, LinkDirection } from '../diagram/elements';
import { DiagramView } from '../diagram/view';
import { EventObserver } from '../viewUtils/events';
import { Cancellation, CancellationToken } from '../viewUtils/async';
import { HtmlSpinner } from '../viewUtils/spinner';

const CLASS_NAME = 'ontodia-edit-form';

export interface Value {
    link: LinkModel;
    direction: LinkDirection;
}

export interface LinkValue {
    value: Value;
    error?: string;
    validated: boolean;
    allowChange: boolean;
}

interface DirectedFatLinkType {
    fatLinkType: FatLinkType;
    direction: LinkDirection;
}

export interface Props {
    editor: EditorController;
    view: DiagramView;
    metadataApi: MetadataApi | undefined;
    linkValue: LinkValue;
    source: ElementModel;
    target: ElementModel;
    onChange: (value: Value) => void;
    disabled?: boolean;
}

export interface State {
    fatLinkTypes?: Array<DirectedFatLinkType>;
}

export class LinkTypeSelector extends React.Component<Props, State> {
    private readonly listener = new EventObserver();
    private readonly cancellation = new Cancellation();

    constructor(props: Props) {
        super(props);
        this.state = {
            fatLinkTypes: [],
        };
    }

    private updateAll = () => this.forceUpdate();

    componentDidMount() {
        this.fetchPossibleLinkTypes();
    }

    componentDidUpdate(prevProps: Props) {
        const {source, target} = this.props;
        if (prevProps.source !== source || prevProps.target !== target) {
            this.setState({fatLinkTypes: undefined});
            this.fetchPossibleLinkTypes();
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.cancellation.abort();
    }

    private async fetchPossibleLinkTypes() {
        const {view, metadataApi, source, target} = this.props;
        if (!metadataApi) { return; }
        const linkTypes = await CancellationToken.mapCancelledToNull(
            this.cancellation.signal,
            metadataApi.possibleLinkTypes(source, target, this.cancellation.signal)
        );
        if (linkTypes === null) { return; }
        const fatLinkTypes: Array<DirectedFatLinkType> = [];
        linkTypes.forEach(({linkTypeIri, direction}) => {
            const fatLinkType = view.model.createLinkType(linkTypeIri);
            fatLinkTypes.push({fatLinkType, direction});
        });
        fatLinkTypes.sort(makeLinkTypeComparatorByLabelAndDirection(view));
        this.setState({fatLinkTypes});
        this.listenToLinkLabels(fatLinkTypes);
    }

    private listenToLinkLabels(fatLinkTypes: Array<{ fatLinkType: FatLinkType; direction: LinkDirection }>) {
        fatLinkTypes.forEach(({fatLinkType}) =>
            this.listener.listen(fatLinkType.events, 'changeLabel', this.updateAll)
        );
    }

    private onChangeType = (e: React.FormEvent<HTMLSelectElement>) => {
        const {link: originalLink, direction: originalDirection} = this.props.linkValue.value;
        const index = parseInt(e.currentTarget.value, 10);
        const {fatLinkType, direction} = this.state.fatLinkTypes[index];
        const link: LinkModel = {...originalLink, linkTypeId: fatLinkType.id};
        // switches source and target if the direction has changed
        if (originalDirection !== direction) {
            link.sourceId = originalLink.targetId;
            link.targetId = originalLink.sourceId;
        }
        this.props.onChange({link, direction});
    }

    private renderPossibleLinkType = (
        {fatLinkType, direction}: { fatLinkType: FatLinkType; direction: LinkDirection }, index: number
    ) => {
        const {view, linkValue, source, target} = this.props;
        const label = view.formatLabel(fatLinkType.label, fatLinkType.id);
        let [sourceLabel, targetLabel] = [source, target].map(element =>
            view.formatLabel(element.label.values, element.id)
        );
        if (direction === LinkDirection.in) {
            [sourceLabel, targetLabel] = [targetLabel, sourceLabel];
        }
        return <option key={index} value={index}>{label} [{sourceLabel} &rarr; {targetLabel}]</option>;
    }

    render() {
        const {linkValue, disabled} = this.props;
        const {fatLinkTypes} = this.state;
        const value = (fatLinkTypes || []).findIndex(({fatLinkType, direction}) =>
            fatLinkType.id === linkValue.value.link.linkTypeId && direction === linkValue.value.direction
        );
        return (
            <div className={`${CLASS_NAME}__control-row`}>
                <label>Link Type</label>
                {
                    fatLinkTypes ? (
                        <select className='ontodia-form-control'
                             value={value}
                             onChange={this.onChangeType}
                             disabled={disabled}>
                            <option value={-1} disabled={true}>Select link type</option>
                            {
                                fatLinkTypes.map(this.renderPossibleLinkType)
                            }
                        </select>
                    ) : <div><HtmlSpinner width={20} height={20} /></div>
                }
                {linkValue.error ? <span className={`${CLASS_NAME}__control-error`}>{linkValue.error}</span> : ''}
            </div>
        );
    }
}

function makeLinkTypeComparatorByLabelAndDirection(view: DiagramView) {
    return (a: DirectedFatLinkType, b: DirectedFatLinkType) => {
        const labelA = view.formatLabel(a.fatLinkType.label, a.fatLinkType.id);
        const labelB = view.formatLabel(b.fatLinkType.label, b.fatLinkType.id);
        const labelCompareResult = labelA.localeCompare(labelB);
        if (labelCompareResult !== 0) {
            return labelCompareResult;
        }
        if (a.direction === LinkDirection.out && b.direction === LinkDirection.in) {
            return -1;
        }
        if (a.direction === LinkDirection.in && b.direction === LinkDirection.out) {
            return 1;
        }
        return 0;
    };
}

export function validateLinkType(
    editor: EditorController, currentLink: LinkModel, originalLink: LinkModel
): Promise<Pick<LinkValue, 'error' | 'allowChange'>> {
    if (currentLink.linkTypeId === PLACEHOLDER_LINK_TYPE) {
        return Promise.resolve({error: 'Required.', allowChange: true});
    }
    if (sameLink(currentLink, originalLink)) {
        return Promise.resolve({error: undefined, allowChange: true});
    }
    const alreadyOnDiagram = editor.model.links.find(({data: {linkTypeId, sourceId, targetId}}) =>
        linkTypeId === currentLink.linkTypeId &&
        sourceId === currentLink.sourceId &&
        targetId === currentLink.targetId &&
        !editor.temporaryState.links.has(currentLink)
    );
    if (alreadyOnDiagram) {
        return Promise.resolve({error: 'The link already exists.', allowChange: false});
    }
    return editor.model.dataProvider.linksInfo({
        elementIds: [currentLink.sourceId, currentLink.targetId],
        linkTypeIds: [currentLink.linkTypeId],
    }).then((links): Pick<LinkValue, 'error' | 'allowChange'> => {
        const alreadyExists = links.some(link => sameLink(link, currentLink));
        return alreadyExists
            ? {error: 'The link already exists.', allowChange: false}
            : {error: undefined, allowChange: true};
    });
}
