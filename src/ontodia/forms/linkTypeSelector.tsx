import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';
import { LinkModel, LinkTypeIri, ElementModel } from '../data/model';
import { formatLocalizedLabel } from '../diagram/model';
import { PLACEHOLDER_LINK_TYPE } from '../data/schema';

import { EditorController } from '../editor/editorController';
import { FatLinkType } from '../diagram/elements';
import { DiagramView } from '../diagram/view';
import { EventObserver } from '../viewUtils/events';
import { Cancellation } from '../viewUtils/async';
import { HtmlSpinner } from '../viewUtils/spinner';

export interface LinkValue {
    value: LinkModel;
    error?: string;
}

export interface Props {
    editor: EditorController;
    view: DiagramView;
    metadataApi: MetadataApi | undefined;
    linkValue: LinkValue;
    source: ElementModel;
    target: ElementModel;
    onChange: (data: LinkValue) => void;
    disabled?: boolean;
}

export interface State {
    fatLinkTypes?: {[id: string]: FatLinkType};
}

export class LinkTypeSelector extends React.Component<Props, State> {
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
        const {linkValue, onChange} = this.props;
        const linkTypeId = e.currentTarget.value as LinkTypeIri;
        onChange({value: {...linkValue.value, linkTypeId}, error: linkValue.error});
    }

    private renderPossibleLinkType(fatLinkType: FatLinkType) {
        const {view} = this.props;
        const label = formatLocalizedLabel(fatLinkType.id, fatLinkType.label, view.getLanguage());
        return <option key={fatLinkType.id} value={fatLinkType.id}>{label}</option>;
    }

    render() {
        const {linkValue, disabled} = this.props;
        const {fatLinkTypes} = this.state;
        return (
            <div>
                <label>Link Type</label>
                {
                    fatLinkTypes ? (
                        <select className='ontodia-form-control'
                             value={linkValue.value.linkTypeId}
                             onChange={this.onChangeType}
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
                {linkValue.error ? <span style={{color: 'red'}}>{linkValue.error}</span> : ''}
            </div>
        );
    }
}

export function validateLinkType(editor: EditorController, link: LinkModel): Promise<string | undefined> {
    if (link.linkTypeId === PLACEHOLDER_LINK_TYPE) {
        return Promise.resolve('Required!');
    }
    const alreadyOnDiagram = editor.model.links.find(({data: {linkTypeId, sourceId, targetId}}) =>
        linkTypeId === link.linkTypeId && sourceId === link.sourceId && targetId === link.targetId
    );
    if (alreadyOnDiagram) {
        return Promise.resolve('The link already exists!');
    }
    return editor.model.dataProvider.linksInfo({
        elementIds: [link.sourceId, link.targetId],
        linkTypeIds: [link.linkTypeId],
    }).then(links => {
        const alreadyExists = links.find(({linkTypeId}) => linkTypeId === link.linkTypeId);
        return alreadyExists ? 'The link already exists!' : undefined;
    });
}
