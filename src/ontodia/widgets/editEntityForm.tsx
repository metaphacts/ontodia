import * as React from 'react';

import { DiagramView } from '../diagram/view';
import { formatLocalizedLabel, chooseLocalizedText } from '../diagram/model';
import { ElementModel, LocalizedString, PropertyTypeIri } from '../data/model';

const CLASS_NAME = 'ontodia-edit-form';

export interface Props {
    view: DiagramView;
    entity: ElementModel;
    onApply: (entity: ElementModel) => void;
    onCancel: () => void;
}

export class EditEntityForm extends React.Component<Props, {}> {

    private renderProperty = (key: PropertyTypeIri, values: LocalizedString[]) => {
        const {view} = this.props;
        const property = view.model.getProperty(key);
        const label = formatLocalizedLabel(key, property.label, view.getLanguage());

        return (
            <div key={key} className={`${CLASS_NAME}__form-row`}>
                <label>
                    {label}
                    {
                        values.map(value => (
                            <input className='ontodia-form-control' defaultValue={value.text} />
                        ))
                    }
                </label>
            </div>
        );
    }

    private renderProperties() {
        const {properties} = this.props.entity;

        return (
            <div>
                {
                    Object.keys(properties).map((key: PropertyTypeIri) => {
                        const {values} = properties[key];
                        return this.renderProperty(key, values);
                    })
                }
            </div>
        );
    }

    render() {
        const {view, entity} = this.props;
        const classLabel = view.getElementTypeString(entity);
        const label = chooseLocalizedText(entity.label.values, view.getLanguage()).text;

        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__body`}>
                    <div className={`${CLASS_NAME}__form-row`}>
                        <label>
                            Class
                            <input className='ontodia-form-control' defaultValue={classLabel} />
                        </label>
                    </div>
                    <div className={`${CLASS_NAME}__form-row`}>
                        <label>
                            Label
                            <input className='ontodia-form-control' defaultValue={label} />
                        </label>
                    </div>
                    {this.renderProperties()}
                </div>
                <div className={`${CLASS_NAME}__controls`}>
                    <button className={`ontodia-btn ontodia-btn-success ${CLASS_NAME}__apply-button`}
                        onClick={() => this.props.onApply(this.props.entity)}>
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
