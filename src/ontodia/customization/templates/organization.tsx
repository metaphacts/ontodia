import * as React from 'react';
import { Component } from 'react';

import { TemplateProps } from '../props';
import { getProperty } from './utils';

const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name';

const CLASS_NAME = 'ontodia-organization-template';

export class OrganizationTemplate extends Component<TemplateProps, {}> {
    render() {
        const {color, icon, types, label, props, isExpanded, iri, propsAsList} = this.props;
        return (
            <div className={CLASS_NAME} style={{borderColor: color}}>
                <div className='ontodia-organization-template_body'>
                    <div
                        className={icon + ' ontodia-organization-template_body__logo'}
                        aria-hidden='true'
                        style={{color: color}}>
                    </div>
                    <div className='ontodia-organization-template_body_data'>
                        <div title={types} className='ontodia-organization-template_body_data__types'>
                            Organization
                        </div>
                        {getProperty(props, FOAF_NAME) ? (
                            <span title={getProperty(props, FOAF_NAME)} className={`${CLASS_NAME}__name`}>
                                {getProperty(props, FOAF_NAME)}
                            </span>
                        ) : (
                            <span title={label} className={`${CLASS_NAME}__name`}>{label}</span>
                        )}
                    </div>
                    <div className='ontodia-default-template__properties'>
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

                    {isExpanded ? (<hr className='ontodia-default-template_body_expander__hr'/>) : null}
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
                        ) : <div>no properties</div>
                    ) : null}
                    </div>  
                </div>
            </div>
        );
    }
}
