import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';
import { LinkModel, LinkTypeIri } from '../data/model';

import { Link } from '../diagram/elements';
import { DiagramView } from '../diagram/view';
import { EditorController } from '../editor/editorController';
import { Cancellation } from '../viewUtils/async';

const CLASS_NAME = 'ontodia-edit-form';

export interface Props {
    view: DiagramView;
    metadataApi: MetadataApi | undefined;
    link: Link;
    onApply: (entity: LinkModel) => void;
    onCancel: () => void;
}

export interface State {
    linkModel?: LinkModel;
    linkTypes?: LinkTypeIri[];
}

export class EditLinkForm extends React.Component<Props, State> {
    private readonly cancellation = new Cancellation();

    constructor(props: Props) {
        super(props);

        this.state = {
            linkModel: props.link.data,
            linkTypes: [],
        };
    }

    componentDidMount() {
        const {view, metadataApi, link} = this.props;

        if (metadataApi) {
            const source = view.model.getElement(link.sourceId);
            const target = view.model.getElement(link.targetId);
            metadataApi.possibleLinkTypes(source.data, target.data, this.cancellation.signal).then(linkTypes => {
                this.setState({linkTypes});
            });
        }
    }

    componentWillUnmount() {
        this.cancellation.abort();
    }

    private onChangeType = (e: React.FormEvent<HTMLSelectElement>) => {
        const linkTypeId = e.currentTarget.value as LinkTypeIri;
        this.setState((state): State => ({
            linkModel: {...state.linkModel, linkTypeId},
        }));
    }

    renderType() {
        const {linkModel, linkTypes} = this.state;

        return (
            <label>
                Type
                <select className='ontodia-form-control' value={linkModel.linkTypeId} onChange={this.onChangeType}>
                    <option value='' disabled={true}>Select link type</option>
                    {
                        linkTypes.map(linkType => {
                            const label = this.props.view.getLinkLabel(linkType).text;
                            return <option key={linkType} value={linkType}>{label}</option>;
                        })
                    }
                </select>
            </label>
        );
    }

    render() {
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <div className={`${CLASS_NAME}__form-row`}>
                        {this.renderType()}
                    </div>
                </div>
                <div className={`${CLASS_NAME}__controls`}>
                    <button className={`ontodia-btn ontodia-btn-success ${CLASS_NAME}__apply-button`}
                        onClick={() => this.props.onApply(this.state.linkModel)}>
                        Apply
                    </button>
                    <button className='ontodia-btn ontodia-btn-danger'
                        onClick={this.props.onCancel}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }
}
