import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';
import { LinkModel, LinkTypeIri, ElementModel } from '../data/model';
import { formatLocalizedLabel } from '../diagram/model';

import { FatLinkType, Link } from '../diagram/elements';
import { DiagramView } from '../diagram/view';
import { EventObserver } from '../viewUtils/events';
import { Cancellation } from '../viewUtils/async';

/** @hidden */
export interface Props {
    view: DiagramView;
    metadataApi: MetadataApi | undefined;
    link: LinkModel;
    source: ElementModel;
    target: ElementModel;
    onChange: (data: LinkModel) => void;
}

/** @hidden */
export interface State {
    fatLinkTypes?: {[id: string]: FatLinkType};
}

/** @hidden */
export class SelectLinkType extends React.Component<Props, State> {
    private readonly listener = new EventObserver();
    private readonly cancellation = new Cancellation();

    constructor(props: Props) {
        super(props);

        this.state = {fatLinkTypes: {}};
    }

    private updateAll = () => this.forceUpdate();

    componentDidMount() {
        const {source, target} = this.props;
        this.fetchPossibleLinkTypes(source, target);
    }

    componentWillReceiveProps(nextProps: Props) {
        if (nextProps.source !== this.props.source || nextProps.target !== this.props.target) {
            this.fetchPossibleLinkTypes(nextProps.source, nextProps.target);
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.cancellation.abort();
    }

    private fetchPossibleLinkTypes(source: ElementModel, target: ElementModel) {
        const {view, metadataApi} = this.props;
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

    render() {
        const {view, link} = this.props;
        const {fatLinkTypes} = this.state;

        return (
            <label>
                Type
                <select className='ontodia-form-control' value={link.linkTypeId} onChange={this.onChangeType}>
                    <option value='' disabled={true}>Select link type</option>
                    {
                        Object.keys(fatLinkTypes).map(linkType => {
                            const fatLinkType = fatLinkTypes[linkType];
                            const label = formatLocalizedLabel(fatLinkType.id, fatLinkType.label, view.getLanguage());
                            return <option key={linkType} value={linkType}>{label}</option>;
                        })
                    }
                </select>
            </label>
        );
    }
}
