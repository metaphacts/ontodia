import * as React from 'react';
import { Component } from 'react';

import { CrossOriginImage } from '../../viewUtils/crossOriginImage';

import { TemplateProps } from '../props';

const CLASS_NAME = 'ontodia-vowl-class-template';

export class VowlClassTemplate extends Component<TemplateProps, {}> {
    render() {
        const {color, imgUrl, icon, types, label, isExpanded, iri, propsAsList} = this.props;
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__main-part`}>
                        <div className='ontodia-vowl-class-template_body'>
                        <div className='ontodia-vowl-class-template_body_label'>
                            <span title={label} className='ontodia-vowl-class-template_body__label'>
                                {label}
                            </span>
                            <div title={types} className='ontodia-vowl-class-template_body_type-container'>
                                <div className='ontodia-vowl-class-template_body_type-container__type'>{types}</div>
                            </div> 
                        </div>
                    </div> 
                </div>
                {isExpanded ? (
                    <div className='ontodia-vowl-class-template_property'
                        style={{borderColor: 'black'}}>
                        {imgUrl ? (
                            <CrossOriginImage className={`${CLASS_NAME}__picture`}
                                style={{borderColor: 'black'}}
                                imageProps={{src: imgUrl, className: `${CLASS_NAME}__picture-image`}}
                            />
                        ) : null}
                        <div className='ontodia-vowl-class-template_property_content'>
                            <div className='ontodia-vowl-class-template_property_content_iri-line'>
                                <div className='ontodia-vowl-class-template_property_content_iri-line__label'>
                                    IRI:
                                </div>
                                <div className='ontodia-vowl-class-template_property_content_iri-line__iri'>
                                    <a href={iri} title={iri}>{iri}</a>
                                </div>
                            </div>
                            
                            <hr className='ontodia-vowl-class-template_property_content__hr'
                                style={{borderTop: 'solid', borderWidth: '1px', borderTopColor: 'black'}}/>
                            {propsAsList.length ? (
                                <div className='ontodia-vowl-class-template_property_content_property-table'>
                                    {propsAsList.map(({name, id, property}) => (
                                        <div key={id} className='ontodia-vowl-class-template_property_content_property-table_row'>
                                            <div className='ontodia-vowl-class-template_property_content_property-table_row__key'
                                                title={name + ' ' + id}>
                                                {name}
                                            </div>
                                            <div className='ontodia-vowl-class-template_property_content_property-table_row_key_values'>
                                                {property.values.map(({text}, index) => (
                                                    <div className='ontodia-vowl-class-template_property_content_property-table_row_key_values__value'
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
                ) : null}
        </div>);
    }
}
