import * as React from 'react';
import { Component } from 'react';

import { CrossOriginImage } from '../../viewUtils/crossOriginImage';

import { TemplateProps } from '../props';

const CLASS_NAME = 'ontodia-VOWLDatatypeObjectProperty_template';

export class VOWLDatatypeObjectPropertyTemplate extends Component<TemplateProps, {}> {
    public SetColor(types: any) : string {
        if ( types.indexOf("DatatypeProperty") != -1 )
            return '#9c6';
        else if (types.indexOf("ObjectProperty") != -1)
            return '#1bf1ee';
        else return undefined;
    }
    render() {
        const {color, imgUrl, icon, types, label, isExpanded, iri, propsAsList} = this.props;
        const expander = this.props.isExpanded ? (
            <div className='ontodia-VOWLClass_template_property' 
                        style={{borderColor: 'black'}}>
                        {imgUrl ? (
                            <CrossOriginImage className={`${CLASS_NAME}__picture`}
                                style={{borderColor: 'black'}}
                                imageProps={{src: imgUrl, className: `${CLASS_NAME}__picture-image`}}
                            />
                        ) : null}
                        <div className='ontodia-VOWLClass_template_property_content'>
                            <div className='ontodia-VOWLClass_template_property_content_iri-line'>
                                <div className='ontodia-VOWLClass_template_property_content_iri-line__label'>
                                    IRI:
                                </div>
                                <div className='ontodia-VOWLClass_template_property_content_iri-line__iri'>
                                    <a href={iri} title={iri}>{iri}</a>
                                </div>
                            </div>
                            
                            <hr className='ontodia-VOWLClass_template_property_content__hr'
                                style={{borderTop:'solid', borderWidth:'1px', borderTopColor:'black'}}/>
                            {propsAsList.length ? (
                                <div className='ontodia-VOWLClass_template_property_content_property-table'>
                                    {propsAsList.map(({name, id, property}) => (
                                        <div key={id} className='ontodia-VOWLClass_template_property_content_property-table_row'>
                                            <div className='ontodia-VOWLClass_template_property_content_property-table_row__key'
                                                title={name + ' ' + id}>
                                                {name}
                                            </div>
                                            <div className='ontodia-VOWLClass_template_property_content_property-table_row_key_values'>
                                                {property.values.map(({text}, index) => (
                                                    <div className='ontodia-VOWLClass_template_property_content_property-table_row_key_values__value'
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

        return (
            <div>
            <div className={CLASS_NAME}
                style={{backgroundColor: this.SetColor(this.props.types), borderColor: "black"}}>
                    <div className='ontodia-VOWLDatatypeObjectProperty_template_body'> 
                        {imgUrl ? (
                            <CrossOriginImage className={`${CLASS_NAME}__picture`}
                                style={{borderColor: color}}
                                imageProps={{src: imgUrl, className: `${CLASS_NAME}__picture-image`}}
                            />
                        ) : null}
                        <span title={label} className={`${CLASS_NAME}__name`}>{label}</span>
                            <div title={types} className='ontodia-VOWLClass_template_body_type-container'>
                        <div className='ontodia-VOWLClass_template_body_type-container__type'>{types}</div>
                        </div>
                    </div>
            </div>
            {isExpanded ? expander : undefined }
            </div>
        );
    }
}
