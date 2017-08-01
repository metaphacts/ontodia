import * as React from 'react';
import { Component } from 'react';

import { TemplateProps } from '../props';

export class LeftBarTemplate extends Component<TemplateProps, {}> {
    render() {
        const {color, imgUrl, icon, types, label, isExpanded, iri, propsAsList} = this.props;
        return (
            <div className='ontodia-left-bar-template'
                style={{backgroundColor: color, borderColor: color}}>
                <div className='ontodia-left-bar-template_body' style={{borderLeftColor: color}}>
                    {imgUrl ? <img src={imgUrl} className='ontodia-left-bar-template_body__image'/> : null}
                    <div className='ontodia-left-bar-template_body_type-line'>
                        <div className={`${icon} ontodia-left-bar-template_body_type-line__icon`}
                            aria-hidden='true' style={{color: color}}>
                        </div>
                        <div title={types} className='ontodia-left-bar-template_body_type-line__type'>
                            {types}
                        </div>
                    </div>
                    <span title={label} className='ontodia-left-bar-template_body__label'>
                        {label}
                    </span>
                    {isExpanded ? (
                        <div className='ontodia-default-template_body_expander'>
                            <div className='ontodia-default-template_body_expander__iri_label'>
                                IRI:
                            </div>
                            <div className='ontodia-default-template_body_expander_iri'>
                                <a className='ontodia-default-template_body_expander_iri__link' href={iri} title={iri}>
                                    {iri}
                                </a>
                            </div>
                        </div>
                    ) : null}
                    {isExpanded ? <hr className='ontodia-default-template_body_expander__hr' /> : null}
                    {isExpanded ? (
                        propsAsList.length ? (
                            <div className='ontodia-default-template_body_expander_property-table'>
                                {propsAsList.map(({name, id, property}) => (
                                    <div key={id} className='ontodia-default-template_body_expander_property-table_row'>
                                        <div className='ontodia-default-template_body_expander_property-table_row__key'
                                            title={`${name} (${id})`}>
                                            {name}
                                        </div>
                                        <div className='ontodia-default-template_body_expander_property-table_row_key_values'>
                                            {property.values.map(({text}, index) => (
                                                <div className='ontodia-default-template_body_expander_property-table_row_key_values__value'
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
