import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';
import { LinkModel } from '../data/model';

import { Link } from '../diagram/elements';
import { DiagramView } from '../diagram/view';

import { SelectLinkType } from './selectLinkType';

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
}

export class EditLinkForm extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {linkModel: props.link.data};
    }

    render() {
        const {view, metadataApi, link} = this.props;
        const {linkModel} = this.state;
        const source = view.model.getElement(link.sourceId).data;
        const target = view.model.getElement(link.targetId).data;
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <div className={`${CLASS_NAME}__form-row`}>
                        <SelectLinkType view={view} metadataApi={metadataApi} link={linkModel} source={source}
                            target={target} onChange={data => this.setState({linkModel: data})}/>
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
