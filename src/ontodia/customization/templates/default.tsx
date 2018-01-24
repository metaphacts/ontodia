import * as React from 'react';

import { CrossOriginImage } from '../../viewUtils/crossOriginImage';
import { isIRI } from '../../diagram/model';
import { TemplateProps } from '../props';

const CLASS_NAME = 'ontodia-default-template';

export class DefaultElementTemplate extends React.Component<TemplateProps, {}> {
    render() {
        const props = this.props;

        const image = props.imgUrl ? (
            <CrossOriginImage className={`${CLASS_NAME}__thumbnail`}
                imageProps={{src: props.imgUrl}} />
        ) : undefined;

        let propertyTable: React.ReactElement<any>;
        if (props.propsAsList && props.propsAsList.length > 0) {
            propertyTable = <div className='ontodia-default-template_body_expander_property-table'>
                {props.propsAsList.map(prop => {
                    const values = prop.property.values.map(({text}, index) => (
                        <div className='ontodia-default-template_body_expander_property-table_row_key_values__value'
                            key={index} title={text}>
                            { isIRI(text) ? <a href={text}>{text}</a> : text }
                        </div>
                    ));

                    return (
                        <div key={prop.id} className='ontodia-default-template_body_expander_property-table_row'>
                            <div title={prop.name + ' (' + prop.id + ')'}
                                className='ontodia-default-template_body_expander_property-table_row__key'>
                                {prop.name}
                            </div>
                            <div className='ontodia-default-template_body_expander_property-table_row_key_values'>
                                {values}
                            </div>
                        </div>
                    );
                })}
            </div>;
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
                {propertyTable}
            </div>
        ) : undefined;

        return (
            <div className='ontodia-default-template' style={{
                backgroundColor: props.color,
                borderColor: props.color,
            }} data-expanded={this.props.isExpanded}>
                <div className='ontodia-default-template_type-line' title={props.label}>
                    <div className={`${props.icon} ontodia-default-template_type-line__icon`} aria-hidden='true'>
                    </div>
                    <div title={props.types} className='ontodia-default-template_type-line_text-container'>
                        <div className='ontodia-default-template_type-line_text-container__text'>
                            {props.types}
                        </div>
                    </div>
                </div>
                {image}
                <div className='ontodia-default-template_body' style={{borderColor: props.color}}>
                    <span className='ontodia-default-template_body__label' title={props.label}>
                        {props.label}
                    </span>
                    {expander}
                </div>
            </div>
        );
    }
}
