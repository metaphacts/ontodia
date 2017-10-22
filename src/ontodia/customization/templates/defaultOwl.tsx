import * as React from 'react';

import { CrossOriginImage } from '../../viewUtils/crossOriginImage';

import { TemplateProps } from '../props';

const CLASS_NAME = 'ontodia-default-owl_template';

export class DefaultElementTemplate extends React.Component<TemplateProps, {}> {
    public SetColor(types: any) : string {
        if ( types.indexOf("Datatype") != -1 )
            return '#fc3';
        else if (types.indexOf("Property") != -1)
            return '#36c';
        else return undefined;
    }

    render() {
        const props = this.props;

        const image = props.imgUrl ? (
            <CrossOriginImage className={`${CLASS_NAME}__thumbnail`}
                imageProps={{src: props.imgUrl}} />
        ) : undefined;

        let propertyTable: React.ReactElement<any>;
        if (props.propsAsList && props.propsAsList.length > 0) {
            propertyTable = <div className='ontodia-default-owl_template_body_expander_property-table'>
                {props.propsAsList.map(prop => {
                    const values = prop.property.values.map(({text}, index) => (
                        <div className='ontodia-default-owl_template_body_expander_property-table_row_key_values__value'
                            key={index} title={text}>
                            {text}
                        </div>
                    ));
                    return (
                        <div key={prop.id} className='ontodia-default-owl_template_body_expander_property-table_row'>
                            <div title={prop.name + ' (' + prop.id + ')'}
                                className='ontodia-default-owl_template_body_expander_property-table_row__key'>
                                {prop.name}
                            </div>
                            <div className='ontodia-default-owl_template_body_expander_property-table_row_key_values'>
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
                <div className='ontodia-default-owl_template_body_expander'>
                    <div className='ontodia-default-owl_template_body_expander__iri_label'>
                        IRI:
                    </div>
                    <div className='ontodia-default-owl_template_body_expander_iri'>
                        <a  className='ontodia-default-owl_template_body_expander_iri__link'
                            href={props.iri} title={props.iri}>{props.iri}
                        </a>
                    </div>
                </div>
                <hr className='ontodia-default-owl_template_body_expander__hr' style={{ borderTopColor: 'black'}}/>
                {propertyTable}
            </div>
        ) : undefined;

        return (
            <div className='ontodia-default-owl_template'
            style={{borderColor: "black", backgroundColor:this.SetColor(this.props.types)}} 
            data-expanded={this.props.isExpanded}>
                {image}
                <div className='ontodia-default-owl_template_body'>
                    <label className='ontodia-default-owl_template_body__label' title={props.label}>
                        {props.label}
                                <div title={props.types} className='ontodia-big-icon-owl_template_body_type-container'>
                                <div className='ontodia-big-icon-owl_template_body_type-container__type'>{props.types}</div>
                            </div>
                    </label>
                    {expander}
                </div>
            </div>
        );
    }
}
