import * as React from 'react';

import { DiagramView } from '../diagram/view';
import { ElementModel, ElementTypeIri } from '../data/model';

const CLASS_NAME = 'ontodia-edit-form';

export interface Props {
    view: DiagramView;
    entity: ElementModel;
    elementTypes: ReadonlyArray<ElementTypeIri>;
    onApply: (entity: ElementModel) => void;
    onCancel: () => void;
}

export interface State {
    elementModel?: ElementModel;
}

export class EditElementTypeForm extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);

        this.state = {elementModel: props.entity};
    }

    onChangeType = (e: React.FormEvent<HTMLSelectElement>) => {
        const target = (e.target as HTMLSelectElement);
        const {elementModel} = this.state;
        this.setState({elementModel: {...elementModel, types: [target.value as ElementTypeIri]}});
    }

    private renderType() {
        const {view, elementTypes} = this.props;
        const {elementModel} = this.state;

        let control: React.ReactElement<HTMLSelectElement | HTMLInputElement>;

        if (elementTypes) {
            control = (
                <select className='ontodia-form-control' value={elementModel.types[0]} onChange={this.onChangeType}>
                    <option value='' disabled={true}>Select element type</option>
                    {
                        elementTypes.map(elementType => {
                            const type = view.model.createClass(elementType);
                            const label = view.getElementTypeLabel(type).text;
                            return <option key={elementType} value={elementType}>{label}</option>;
                        })
                    }
                </select>
            );
        } else {
            const label = view.getElementTypeString(elementModel);
            control = (
                <input className='ontodia-form-control' value={label} disabled={true} />
            );
        }

        return (
            <label>
                Type
                {control}
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
                        onClick={() => this.props.onApply(this.state.elementModel)}>
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
