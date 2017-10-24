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
    public ItIsThing(types: any) : boolean {
        if ( types.indexOf("Datatype") != -1 || types.indexOf("Property") != -1)
            return false;
        else return true;
    }

    render() {
        const props = this.props;
        const {color, imgUrl, icon, types, label, isExpanded, iri, propsAsList} = this.props;

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

        const ThingExpander = props.isExpanded ? (
            <div className='ontodia-big-icon-owl_template_property' 
                        style={{borderColor: 'black'}}>
                        {imgUrl ? (
                            <CrossOriginImage className={`${CLASS_NAME}__picture`}
                                style={{borderColor: 'black'}}
                                imageProps={{src: imgUrl, className: `${CLASS_NAME}__picture-image`}}
                            />
                        ) : null}
                        <div className='ontodia-big-icon-owl_template_property_content'>
                            <div className='ontodia-big-icon-owl_template_property_content_iri-line'>
                                <div className='ontodia-big-icon-owl_template_property_content_iri-line__label'>
                                    IRI:
                                </div>
                                <div className='ontodia-big-icon-owl_template_property_content_iri-line__iri'>
                                    <a href={iri} title={iri}>{iri}</a>
                                </div>
                            </div>
                            
                            <hr className='ontodia-big-icon-owl_template_property_content__hr'
                                style={{borderTop:'solid', borderWidth:'1px', borderTopColor:'black'}}/>
                            {propsAsList.length ? (
                                <div className='ontodia-big-icon-owl_template_property_content_property-table'>
                                    {propsAsList.map(({name, id, property}) => (
                                        <div key={id} className='ontodia-big-icon-owl_template_property_content_property-table_row'>
                                            <div className='ontodia-big-icon-owl_template_property_content_property-table_row__key'
                                                title={name + ' ' + id}>
                                                {name}
                                            </div>
                                            <div className='ontodia-big-icon-owl_template_property_content_property-table_row_key_values'>
                                                {property.values.map(({text}, index) => (
                                                    <div className='ontodia-big-icon-owl_template_property_content_property-table_row_key_values__value'
                                                    key={index} title={text}>
                                                        {text}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : 'no properties'}
                        </div>
                    </div>
        ) : undefined;

        if ( !this.ItIsThing(this.props.types) ) {
        return (
            <div className='ontodia-default-owl_template'
            style={{ borderColor: "black", backgroundColor:this.SetColor(this.props.types)}} 
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
        else {
            return (
                <div className='ontodia-default-owl_thing_template'
                data-expanded={this.props.isExpanded}>
                    {image}
                    <div className='ontodia-default-owl_thing_template_body'>
                        <label className='ontodia-default-owl_thing_template_body__label' title={props.label}>
                            {props.label}
                                    <div title={props.types} className='ontodia-big-icon-owl_template_body_type-container'>
                                    <div className='ontodia-big-icon-owl_template_body_type-container__type'>{props.types}</div>
                                </div>
                        </label>
                    </div>
                    {ThingExpander}
                </div>
            );
        }
    }
}
