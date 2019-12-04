import * as React from 'react';

import { Link } from '../diagram/elements';
import { DiagramView } from '../diagram/view';

const CLASS_NAME = 'ontodia-edit-form';

export interface Props {
    view: DiagramView;
    link: Link;
    onApply: (label: string) => void;
    onCancel: () => void;
}

export interface State {
    label?: string;
}

export class EditLinkLabelForm extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        const label = this.computeLabel();
        this.state = {label};
    }

    componentDidUpdate(prevProps: Props) {
        if (this.props.link.typeId !== prevProps.link.typeId) {
            const label = this.computeLabel();
            this.setState({label});
        }
    }

    private computeLabel(): string {
        const {view, link} = this.props;

        const linkType = view.model.getLinkType(link.typeId);
        const template = view.createLinkTemplate(linkType);
        const {label = {}} = template.renderLink(link);

        const labelTexts = label.attrs && label.attrs.text ? label.attrs.text.text : undefined;
        return (labelTexts && labelTexts.length > 0)
            ? view.selectLabel(labelTexts).value
            : view.formatLabel(linkType.label, linkType.id);
    }

    render() {
        const {onApply, onCancel} = this.props;
        const {label} = this.state;
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <div className={`${CLASS_NAME}__form-row`}>
                        <label>Link Label</label>
                        <input className='ontodia-form-control' value={label}
                            onChange={e => this.setState({label: (e.target as HTMLInputElement).value})} />
                    </div>
                </div>
                <div className={`${CLASS_NAME}__controls`}>
                    <button className={`ontodia-btn ontodia-btn-success ${CLASS_NAME}__apply-button`}
                        onClick={() => onApply(label)}>
                        Apply
                    </button>
                    <button className='ontodia-btn ontodia-btn-danger' onClick={() => onCancel()}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }
}
