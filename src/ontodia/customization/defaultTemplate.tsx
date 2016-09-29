import * as React from 'react';

import { TemplateProps } from './props';

export class DefaultTemplate extends React.Component<TemplateProps, {}> {
    render() {
        const props = this.props;
        const rootStyle = {backgroundColor: props.color};
        const imageStyle = {borderBottomColor: props.color};
        const iconClassName = props.icon + ' ontodia-default-template_type-line__icon';

        const image = props.imgUrl ? (
            <img src={props.imgUrl} className='ontodia-default-template__image' style={imageStyle}/>
        ) : undefined;

        let propertyTable: React.ReactNode;
        if (props.propsAsList && props.propsAsList.length > 0) {
            propertyTable = props.propsAsList.map(prop => {
                const values = prop.properties.map(({value}) =>
                    <div className='ontodia-default-template_body_expander_property-table_row_key_values__value'
                        key={prop.id} title={value.text}>
                        {value.text}
                    </div>
                );
                return (
                    <div className='ontodia-default-template_body_expander_property-table_row'>
                        <div title={prop.id} className='ontodia-default-template_body_expander_property-table_row__key'>
                            {prop.name}
                        </div>
                        <div className='ontodia-default-template_body_expander_property-table_row_key_values'>
                            {values}
                        </div>
                    </div>
                );
            });
        } else {
            propertyTable = <div>no properties</div>;
        }

        const expander = props.isExpanded ? (
            <div>
                <div className='ontodia-default-template_body_expander'>
                    <div className='ontodia-default-template_body_expander__iri_label'>
                        IRI:
                    </div>
                    <div className='ontodia-default-template_body_expander_iri'>
                        <a  className='ontodia-default-template_body_expander_iri__link'
                            href={props.iri} title={props.iri}>{props.iri}
                        </a>
                    </div>
                </div>
                <hr className='ontodia-default-template_body_expander__hr'/>
                <div className='ontodia-default-template_body_expander_property-table'>{propertyTable}</div>
            </div>
        ) : undefined;

        return (
            <div className='ontodia-default-template' style={rootStyle}>
                <div className='ontodia-default-template_type-line' title={props.label}>
                    <div className={iconClassName}
                        aria-hidden='true'>
                    </div>
                    <div title={props.types} className='ontodia-default-template_type-line_text-container'>
                        <div className='ontodia-default-template_type-line_text-container__text'>
                            {props.types}
                        </div>
                    </div>
                </div>
                {image}
                <div className='ontodia-default-template_body'>
                    <label className='ontodia-default-template_body__label' title={props.label}>
                        {props.label}
                    </label>
                    {expander}
                </div>
            </div>
        );
    }
}
