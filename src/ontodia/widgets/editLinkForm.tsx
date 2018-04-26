import * as React from 'react';

import { DiagramView } from '../diagram/view';
import { LinkModel } from '../data/model';

const CLASS_NAME = 'ontodia-edit-form';

export interface Props {
    view: DiagramView;
    link: LinkModel;
    onApply: (entity: LinkModel) => void;
    onCancel: () => void;
}

export class EditLinkForm extends React.Component<Props, {}> {

    render() {
        const {view, link} = this.props;
        const label = view.getLinkLabel(link.linkTypeId).text;

        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <div className={`${CLASS_NAME}__form-row`}>
                        <label>
                            Label
                            <input className='ontodia-form-control' defaultValue={label} />
                        </label>
                    </div>
                </div>
                <div className={`${CLASS_NAME}__controls`}>
                    <button className={`ontodia-btn ontodia-btn-success ${CLASS_NAME}__apply-button`}
                        onClick={() => this.props.onApply(this.props.link)}>
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
