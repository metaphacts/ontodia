import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';
import { LinkModel, LinkTypeIri, ElementModel } from '../data/model';
import { formatLocalizedLabel } from '../diagram/model';
import { PLACEHOLDER_LINK_TYPE } from '../data/schema';

import { FatLinkType } from '../diagram/elements';
import { DiagramView } from '../diagram/view';
import { EventObserver } from '../viewUtils/events';
import { Cancellation } from '../viewUtils/async';
import { HtmlSpinner } from '../viewUtils/spinner';

export interface Props {
    view: DiagramView;
    metadataApi: MetadataApi | undefined;
    link: LinkModel;
    source: ElementModel;
    target: ElementModel;
    onChange: (data: LinkModel) => void;
    disabled?: boolean;
}

export interface State {
    fatLinkTypes?: {[id: string]: FatLinkType};
}

export class SelectLinkType extends React.Component<Props, State> {
    private readonly listener = new EventObserver();
    private readonly cancellation = new Cancellation();

    constructor(props: Props) {
        super(props);
        this.state = {};
    }

    private updateAll = () => this.forceUpdate();

    componentDidMount() {
        this.fetchPossibleLinkTypes();
    }

    componentDidUpdate(prevProps: Props) {
        if (prevProps.source !== this.props.source || prevProps.target !== this.props.target) {
            this.setState({fatLinkTypes: undefined});
            this.fetchPossibleLinkTypes();
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.cancellation.abort();
    }

    private fetchPossibleLinkTypes() {
        const {view, metadataApi, source, target} = this.props;
        if (!metadataApi) { return; }
        metadataApi.possibleLinkTypes(source, target, this.cancellation.signal).then(linkTypes => {
            const fatLinkTypes: {[id: string]: FatLinkType} = {};
            linkTypes.forEach(linkTypeIri => fatLinkTypes[linkTypeIri] = view.model.createLinkType(linkTypeIri));
            this.setState({fatLinkTypes});
            this.listenToLinkLabels(fatLinkTypes);
        });
    }

    private listenToLinkLabels(fatLinkTypes: {[id: string]: FatLinkType}) {
        Object.keys(fatLinkTypes).forEach(linkType =>
            this.listener.listen(fatLinkTypes[linkType].events, 'changeLabel', this.updateAll)
        );
    }

    private onChangeType = (e: React.FormEvent<HTMLSelectElement>) => {
        const linkTypeId = e.currentTarget.value as LinkTypeIri;
        this.props.onChange({...this.props.link, linkTypeId});
    }

    private renderPossibleLinkType(fatLinkType: FatLinkType) {
        const {view} = this.props;
        const label = formatLocalizedLabel(fatLinkType.id, fatLinkType.label, view.getLanguage());
        return <option key={fatLinkType.id} value={fatLinkType.id}>{label}</option>;
    }

    render() {
        const {link, disabled} = this.props;
        const {fatLinkTypes} = this.state;
        return (
            <label>
                Type
                {
                    fatLinkTypes ? (
                        <select className='ontodia-form-control' value={link.linkTypeId} onChange={this.onChangeType}
                             disabled={disabled}>
                            <option value={PLACEHOLDER_LINK_TYPE} disabled={true}>Select link type</option>
                            {
                                Object.keys(fatLinkTypes).map(linkType =>
                                    this.renderPossibleLinkType(fatLinkTypes[linkType])
                                )
                            }
                        </select>
                    ) : <div><HtmlSpinner width={20} height={20} /></div>
                }
            </label>
        );
    }
}
