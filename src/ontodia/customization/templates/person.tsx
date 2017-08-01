import * as React from 'react';
import { Component } from 'react';

import { CrossOriginImage } from '../../viewUtils/crossOriginImage';
import { TemplateProps } from '../props';
import { getProperty } from './utils';

const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name';

export class PersonTemplate extends Component<TemplateProps, {}> {
    render() {
        const {color, imgUrl, icon, types, label, props, isExpanded, iri, propsAsList} = this.props;
        return (
            <div className='ontodia-person-container'>
                <div className='ontodia-person-template'
                    style={{backgroundColor: color, borderColor: color}}>
                    <div className='ontodia-person-template_body' style={{borderLeftColor: color}}>
                        {imgUrl ? (
                            <CrossOriginImage className='ontodia-person-template_body_photo'
                                aria-hidden='true' style={{color: color}}
                                imageProps={{
                                    src: imgUrl,
                                    className: 'ontodia-person-template_body_photo__image',
                                    style: {borderColor: color},
                                }}
                            />
                        ) : (
                            <div className={`${icon} ontodia-person-template_body__icon`}
                                aria-hidden='true' style={{color: color}}>
                            </div>
                        )}
                        <div className='ontodia-person-template_body_main-part'>
                            <div title={types} className='ontodia-person-template_body_main-part_type-container'>
                                <div className='ontodia-person-template_body_main-part_type-container__type'>Person</div>
                            </div>
                            {getProperty(props, FOAF_NAME) ? (
                                <label title={getProperty(props, FOAF_NAME)}
                                    className='ontodia-person-template_body_main-part__label'>
                                    {getProperty(props, FOAF_NAME)}
                                </label>
                            ) : (
                                <label title={label} className='ontodia-person-template_body_main-part__label'>
                                    {label}
                                </label>
                            )}
                        </div>
                    </div>
                </div>
                {isExpanded ? (
                    <div className='ontodia-person-template_property' style={{borderColor: color}}>
                        {imgUrl ? (
                            <img className='ontodia-person-template_property__image'
                                src={imgUrl} style={{borderColor: color}} />
                        ) : null}
                        <div className='ontodia-person-template_property_content'>
                            <div className='ontodia-person-template_property_content_iri-line'>
                                <div className='ontodia-person-template_property_content_iri-line__label'>
                                    IRI:
                                </div>
                                <div className='ontodia-person-template_property_content_iri-line__iri'>
                                    <a href={iri} title={iri}>{iri}</a>
                                </div>
                            </div>
                            <hr className='ontodia-person-template_property_content__hr' />
                            {propsAsList.length ? (
                                <div className='ontodia-person-template_property_content_property-table'>
                                    {propsAsList.map(({name, id, property}) => (
                                        <div key={id} className='ontodia-person-template_property_content_property-table_row'>
                                            <div className='ontodia-person-template_property_content_property-table_row__key'
                                                title={`${name}} (${id})`}>
                                                {name}
                                            </div>
                                            <div className='ontodia-person-template_property_content_property-table_row_key_values'>
                                                {property.values.map(({text}, index) => (
                                                    <div className='ontodia-person-template_property_content_property-table_row_key_values__value'
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
            </div>
        );
    }
}
