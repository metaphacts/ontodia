import * as React from 'react';

import { DiagramView } from '../diagram/view';
import { formatLocalizedLabel, chooseLocalizedText } from '../diagram/model';
import { ElementModel, ElementTypeIri, LocalizedString, PropertyTypeIri } from '../data/model';

const CLASS_NAME = 'ontodia-edit-form';

export interface Props {
    view: DiagramView;
    entity: ElementModel;
    onApply: (entity: ElementModel) => void;
    onCancel: () => void;
}

export interface State {
    elementModel?: ElementModel;
}

export class EditEntityForm extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);

        this.state = {elementModel: props.entity};
    }

    private renderProperty = (key: PropertyTypeIri, values: LocalizedString[]) => {
        const {view} = this.props;
        const property = view.model.getProperty(key);
        const label = formatLocalizedLabel(key, property.label, view.getLanguage());

        return (
            <div key={key} className={`${CLASS_NAME}__form-row`}>
                <label>
                    {label}
                    {
                        values.map((value, index) => (
                            <input key={index} className='ontodia-form-control' defaultValue={value.text} />
                        ))
                    }
                </label>
            </div>
        );
    }

    private renderProperties() {
        const {properties} = this.props.entity;
        const propertyIris = Object.keys(properties) as PropertyTypeIri[];
        return (
            <div>
                {propertyIris.map(iri => {
                    const {values} = properties[iri];
                    return this.renderProperty(iri, values);
                })}
            </div>
        );
    }

    private renderType() {
        const {view} = this.props;
        const {elementModel} = this.state;
        const label = view.getElementTypeString(elementModel);
        return (
            <label>
                Type
                <input className='ontodia-form-control' value={label} disabled={true} />
            </label>
        );
    }

    private onChangeLabel = (e: React.FormEvent<HTMLInputElement>) => {
        const target = (e.target as HTMLInputElement);

        const labels = target.value.length > 0 ? [{text: target.value, lang: ''}] : [];

        this.setState({elementModel: {
            ...this.state.elementModel,
            label: {values: labels},
        }});
    }

    private renderLabel() {
        const {view} = this.props;
        const labels = this.state.elementModel.label.values;
        const label = labels.length > 0 ? chooseLocalizedText(labels, view.getLanguage()).text : '';
        return (
            <label>
                Label
                <input className='ontodia-form-control' value={label} onChange={this.onChangeLabel} />
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
                    <div className={`${CLASS_NAME}__form-row`}>
                        {this.renderLabel()}
                    </div>
                    {this.renderProperties()}
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
