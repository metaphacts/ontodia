import * as React from 'react';

export function getDefaultTemplate() {
    return React.createClass({
        propTypes: {
            element: React.PropTypes.shape({
                types: React.PropTypes.string.isRequired,
                label: React.PropTypes.string.isRequired,
                color: React.PropTypes.object.isRequired,
                iri: React.PropTypes.string.isRequired,
                imgUrl: React.PropTypes.string,
                isExpanded: React.PropTypes.bool,
                propsAsList: React.PropTypes.array,
                props: React.PropTypes.object,
            }),
        },
        getInitialState: function() {
            // return {
            //     isExpanded: this.props.element.isExpanded,
            //     color: this.props.element.color,
            // };
            return this.props.element;
        },
        render: function() {
            const element = this.props.element;
            const rootStyle = {backgroundColor: element.color};
            const imageStyle = {borderBottomColor: element.color};
            const iconClassName = element.icon + ' ontodia-default-template_type-line__icon';
            let image = '';
            if (element.imgUrl) {
                image = <img src={element.imgUrl} className='ontodia-default-template__image' style={imageStyle}/>;
            }
            let propertyTable;
            if (element.propsAsList && element.propsAsList.length > 0) {
                propertyTable = element.propsAsList.map(prop => {
                    const values = prop.properties.map(value => {
                        return <div
                            className='ontodia-default-template_body_expander_property-table_row_key_values__value'
                            title={value.value.text}>
                            {value.value.text}
                        </div>;
                    });
                    return <div className='ontodia-default-template_body_expander_property-table_row'>
                        <div title={prop.id} className='ontodia-default-template_body_expander_property-table_row__key'>
                            {prop.name}
                        </div>
                        <div className='ontodia-default-template_body_expander_property-table_row_key_values'>
                            {values}
                        </div>
                    </div>;
                });
            } else {
                propertyTable = <div>no properties</div>;
            }
            let expander = '';
            if (element.isExpanded) {
                expander =
                <div>
                    <div className='ontodia-default-template_body_expander'>
                        <div className='ontodia-default-template_body_expander__iri_label'>
                            IRI:
                        </div>
                        <div className='ontodia-default-template_body_expander_iri'>
                            <a  className='ontodia-default-template_body_expander_iri__link'
                                href={element.iri} title={element.iri}>{element.iri}
                            </a>
                        </div>
                    </div>
                    <hr className='ontodia-default-template_body_expander__hr'/>
                    <div className='ontodia-default-template_body_expander_property-table'>{propertyTable}</div>
                </div>;
            }
            return (
                <div className='ontodia-default-template' style={rootStyle}>
                    <div className='ontodia-default-template_type-line' title={element.label}>
                        <div className={iconClassName}
                            aria-hidden='true'>
                        </div>
                        <div title={element.types} className='ontodia-default-template_type-line_text-container'>
                            <div className='ontodia-default-template_type-line_text-container__text'>
                                {element.types}
                            </div>
                        </div>
                    </div>
                    {image}
                    <div className='ontodia-default-template_body'>
                        <label className='ontodia-default-template_body__label' title={element.label}>
                            {element.label}
                        </label>
                        {expander}
                    </div>
                </div>
            );
        },
    });
}
