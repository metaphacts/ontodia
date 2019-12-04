import * as React from 'react';

import { DiagramView } from '../diagram/view';
import {
    ElementModel, LocalizedString, PropertyTypeIri,
    Property, isIriProperty, isLiteralProperty,
    ElementIri,
} from '../data/model';

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

    componentWillReceiveProps(nextProps: Props) {
        if (this.props.entity !== nextProps.entity) {
            this.setState({elementModel: nextProps.entity});
        }
    }

    private renderProperty = (key: PropertyTypeIri, property: Property) => {
        const {view} = this.props;
        const richProperty = view.model.getProperty(key);
        const label = view.formatLabel(richProperty.label, key);

        let values: string[] = [];
        if (isIriProperty(property)) {
            values = property.values.map(({value}) => value);
        } else if (isLiteralProperty(property)) {
            values = property.values.map(({value}) => value);
        }
        return (
            <div key={key} className={`${CLASS_NAME}__form-row`}>
                <label>
                    {label}
                    {
                        values.map((value, index) => (
                            <input key={index} className='ontodia-form-control' defaultValue={value} />
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
                    return this.renderProperty(iri, properties[iri]);
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

    private onChangeIri = (e: React.FormEvent<HTMLInputElement>) => {
        const target = (e.target as HTMLInputElement);
        const iri = target.value as ElementIri;
        this.setState(prevState => {
            return {
                elementModel: {
                    ...prevState.elementModel,
                    id: iri,
                }
            };
        });
    }

    private renderIri() {
        const {elementModel} = this.state;
        return (
            <label>
                IRI
                <input
                    className='ontodia-form-control'
                    defaultValue={elementModel.id}
                    onChange={this.onChangeIri}
                />
            </label>
        );
    }

    private onChangeLabel = (e: React.FormEvent<HTMLInputElement>) => {
        const target = (e.target as HTMLInputElement);

        const labels: LocalizedString[] = target.value.length > 0 ? [{value: target.value, language: ''}] : [];

        this.setState({elementModel: {
            ...this.state.elementModel,
            label: {values: labels},
        }});
    }

    private renderLabel() {
        const {view} = this.props;
        const label = view.selectLabel(this.state.elementModel.label.values);
        const text = label ? label.value : '';
        return (
            <label>
                Label
                <input className='ontodia-form-control' value={text} onChange={this.onChangeLabel} />
            </label>
        );
    }

    render() {
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <div className={`${CLASS_NAME}__form-row`}>
                        {this.renderIri()}
                    </div>
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
