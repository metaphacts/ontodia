import * as React from 'react';
import { Component } from 'react';

import { CrossOriginImage } from '../../viewUtils/crossOriginImage';

import { TemplateProps } from '../props';

const CLASS_NAME = 'ontodia-left-bar-owl_template';

export class LeftBarTemplate extends Component<TemplateProps, {}> {
    public SetColor(types: any) : string {
        if ( types.indexOf("DatatypeProperty") != -1 )
            return '#9c6';
        else if (types.indexOf("ObjectProperty") != -1)
            return '#acf';
        else return undefined;
    }
    render() {
        const {color, imgUrl, icon, types, label, isExpanded, iri, propsAsList} = this.props;
        return (
            <div className={CLASS_NAME}
                style={{backgroundColor: this.SetColor(this.props.types), borderColor: "black"}}>
                <div className='ontodia-left-bar-owl_template_body'> 
                    {imgUrl ? (
                        <CrossOriginImage className={`${CLASS_NAME}__picture`}
                            style={{borderColor: color}}
                            imageProps={{src: imgUrl, className: `${CLASS_NAME}__picture-image`}}
                        />
                    ) : null}
                    <span title={label} className={`${CLASS_NAME}__name`}>{label}</span>
                        <div title={types} className='ontodia-big-icon-owl_template_body_type-container'>
                    <div className='ontodia-big-icon-owl_template_body_type-container__type'>{types}</div>
                    </div>
                    {isExpanded ? (
                        <div className='ontodia-default-owl_template_body_expander'>
                            <div className='ontodia-default-owl_template_body_expander__iri_label'>
                                IRI:
                            </div>
                            <div className='ontodia-default-owl_template_body_expander_iri'>
                                <a className='ontodia-default-owl_template_body_expander_iri__link' href={iri} title={iri}>
                                    {iri}
                                </a>
                            </div>
                        </div>
                    ) : null}
                    {isExpanded ? (<hr className='ontodia-default-owl_template_body_expander__hr' />) : null}
                    {isExpanded ? (
                        propsAsList.length ? (
                            <div className='ontodia-default-owl_template_body_expander_property-table'>
                                {propsAsList.map(({name, id, property}) => (
                                    <div key={id} className='ontodia-default-owl_template_body_expander_property-table_row'>
                                        <div className='ontodia-default-owl_template_body_expander_property-table_row__key'
                                            title={`${name} (${id})`}>
                                            {name}
                                        </div>
                                        <div className='ontodia-default-owl_template_body_expander_property-table_row_key_values'>
                                            {property.values.map(({text}, index) => (
                                                <div className='ontodia-default-owl_template_body_expander_property-table_row_key_values__value'
                                                    key={index} title={text}>
                                                    {text}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : 'no properties'
                    ) : null}
                </div>
            </div>
        );
    }
}
