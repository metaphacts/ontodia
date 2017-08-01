import * as React from 'react';
import { Component } from 'react';

import { TemplateProps } from '../props';
import { getProperty } from './utils';

const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name';

export class OrganizationTemplate extends Component<TemplateProps, {}> {
    render() {
        const {color, imgUrl, icon, types, label, props, isExpanded, iri, propsAsList} = this.props;
        return (
            <div className='ontodia-organization-template' style={{borderColor: color}}>
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
                            <label title={getProperty(props, FOAF_NAME)}
                                className='ontodia-organization-template_body_data__label'>

                                {getProperty(props, FOAF_NAME)}
                            </label>
                        ) : (
                            <label title={label} className='ontodia-organization-template_body_data__label'>
                                {label}
                            </label>
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
                        ) : 'no properties'
                    ) : null}
                    </div>  
                </div>
            </div>
        );
    }
}
export default OrganizationTemplate;
