import * as React from 'react';
import { Component } from 'react';

import { CrossOriginImage } from '../../viewUtils/crossOriginImage';

import { TemplateProps } from '../props';

const CLASS_NAME = 'ontodia-big-icon-template';

export class BigIconTemplate extends Component<TemplateProps, {}> {
    render() {
        const {color, imgUrl, icon, types, label, isExpanded, iri, propsAsList} = this.props;
        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__main-part`}
                    style={{backgroundColor: color, borderColor: color}}>
                    <div className='ontodia-big-icon-template_body' style={{borderLeftColor: color}}>
                        <div style={{flexGrow: 1, textOverflow: 'ellipsis', overflow: 'hidden'}}>
                            <span title={label} className='ontodia-big-icon-template_body__label'>
                                {label}
                            </span>
                            <div title={types} className='ontodia-big-icon-template_body_type-container'>
                                <div className='ontodia-big-icon-template_body_type-container__type'>{types}</div>
                            </div>
                        </div>
                        <div className={icon + ' ontodia-big-icon-template_body__icon'} aria-hidden='true'
                            style={{color: color}}>
                        </div>
                    </div>
                </div>
                {isExpanded ? (
                    <div className='ontodia-big-icon-template_property' style={{borderColor: color}}>
                        {imgUrl ? (
                            <CrossOriginImage className={`${CLASS_NAME}__picture`}
                                style={{borderColor: color}}
                                imageProps={{src: imgUrl, className: `${CLASS_NAME}__picture-image`}}
                            />
                        ) : null}
                        <div className='ontodia-big-icon-template_property_content'>
                            <div className='ontodia-big-icon-template_property_content_iri-line'>
                                <div className='ontodia-big-icon-template_property_content_iri-line__label'>
                                    IRI:
                                </div>
                                <div className='ontodia-big-icon-template_property_content_iri-line__iri'>
                                    <a href={iri} title={iri}>{iri}</a>
                                </div>
                            </div>
                            
                            <hr className='ontodia-big-icon-template_property_content__hr'/>
                            {propsAsList.length ? (
                                <div className='ontodia-big-icon-template_property_content_property-table'>
                                    {propsAsList.map(({name, id, property}) => (
                                        <div key={id} className='ontodia-big-icon-template_property_content_property-table_row'>
                                            <div className='ontodia-big-icon-template_property_content_property-table_row__key'
                                                title={name + ' ' + id}>
                                                {name}
                                            </div>
                                            <div className='ontodia-big-icon-template_property_content_property-table_row_key_values'>
                                                {property.values.map(({text}, index) => (
                                                    <div className='ontodia-big-icon-template_property_content_property-table_row_key_values__value'
                                                    key={index} title={text}>
                                                        {text}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : <div>no properties</div> }
                        </div>
                    </div>
                ) : null}
        </div>);
    }
}
