import * as React from 'react';
import { Component } from 'react';

import { ElementIri, LinkTypeIri, PropertyTypeIri, LocalizedString } from '../../data/model';
import { isEncodedBlank } from '../../data/sparql/blankNodes';

import { TemplateProps } from '../props';
import { getProperty } from './utils';

import { formatLocalizedLabel } from '../../diagram/model';
import { PaperAreaContextTypes, PaperAreaContextWrapper } from '../../diagram/paperArea';
import { ElementContextTypes, ElementContextWrapper } from '../../diagram/elementLayer';
import { EventObserver } from '../../viewUtils/events';
import { HtmlSpinner } from '../../viewUtils/spinner';
import { KeyedObserver, observeLinkTypes, observeProperties } from '../../viewUtils/keyedObserver';

const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name';

const CLASS_NAME = 'ontodia-standard-template';

export class StandardTemplate extends Component<TemplateProps, {}> {
    static contextTypes = {...ElementContextTypes, ...PaperAreaContextTypes};
    context: ElementContextWrapper & PaperAreaContextWrapper;

    private linkTypesObserver: KeyedObserver<LinkTypeIri>;
    private propertiesObserver: KeyedObserver<PropertyTypeIri>;

    constructor(props: TemplateProps, context: any) {
        super(props, context);
    }

    componentDidMount() {
        const {editor} = this.context.ontodiaElement;
        this.linkTypesObserver = observeLinkTypes(
            editor.model, 'changeLabel', () => this.forceUpdate()
        );
        this.propertiesObserver = observeProperties(
            editor.model, 'changeLabel', () => this.forceUpdate()
        );
        this.observeTypes();
    }

    componentDidUpdate() {
        this.observeTypes();
    }

    private observeTypes() {
        const iri = this.props.iri as ElementIri;
        const {editor} = this.context.ontodiaElement;
        const validation = editor.validationState.elements.get(iri);
        if (validation) {
            this.linkTypesObserver.observe(
                validation.errors.map(error => error.linkType).filter(type => type)
            );
            this.propertiesObserver.observe(
                validation.errors.map(error => error.propertyType).filter(type => type)
            );
        } else {
            this.linkTypesObserver.observe([]);
            this.propertiesObserver.observe([]);
        }
    }

    componentWillUnmount() {
        this.linkTypesObserver.stopListening();
        this.propertiesObserver.stopListening();
    }

    private renderProperties() {
        const {propsAsList} = this.props;

        if (!propsAsList.length) {
            return <div>no properties</div>;
        }

        return (
            <div className={`${CLASS_NAME}__properties`}>
                {propsAsList.map(({name, id, property}) => (
                    <div key={id} className={`${CLASS_NAME}__properties-row`}>
                        <div className={`${CLASS_NAME}__properties-key`} title={`${name} (${id})`}>
                            {name}
                        </div>
                        <div className={`${CLASS_NAME}__properties-values`}>
                            {property.values.map(({text}, index) => (
                                <div className={`${CLASS_NAME}__properties-value`} key={index} title={text}>
                                    {text}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    private renderPhoto() {
        const {color, imgUrl} = this.props;

        if (!imgUrl) { return null; }

        return (
            <div className={`${CLASS_NAME}__photo`} style={{borderColor: color}}>
                <img src={imgUrl} className={`${CLASS_NAME}__photo-image`} />
            </div>
        );
    }

    private renderIri() {
        const {iri} = this.props;
        return (
            <div>
                <div className={`${CLASS_NAME}__iri`}>
                    <div className={`${CLASS_NAME}__iri-key`}>
                        IRI:
                    </div>
                    <div className={`${CLASS_NAME}__iri-value`}>
                        {isEncodedBlank(iri)
                            ? <span>(blank node)</span>
                            : <a href={iri} title={iri}>{iri}</a>}
                    </div>
                </div>
                <hr className={`${CLASS_NAME}__hr`} />
            </div>
        );
    }

    private renderThumbnail() {
        const {color, imgUrl, icon} = this.props;

        if (imgUrl) {
            return (
                <div className={`${CLASS_NAME}__thumbnail`} aria-hidden='true'>
                    <img src={imgUrl} className={`${CLASS_NAME}__thumbnail-image`} />
                </div>
            );
        }

        if (icon === 'ontodia-default-icon') {
            const label = this.getLabel();
            return (
                <div className={`${CLASS_NAME}__thumbnail`} aria-hidden='true' style={{color}}>
                    {label.charAt(0).toUpperCase()}
                </div>
            );
        }

        return <div className={`${icon} ${CLASS_NAME}__thumbnail`} aria-hidden='true' style={{color}} />;
    }

    protected getTypesLabel(): string {
        return this.props.types;
    }

    private getLabel() {
        const {label, props} = this.props;
        return getProperty(props, FOAF_NAME) || label;
    }

    render() {
        const {color, types, isExpanded} = this.props;
        const label = this.getLabel();

        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__main`} style={{backgroundColor: color, borderColor: color}}>
                    <div className={`${CLASS_NAME}__body`} style={{borderLeftColor: color}}>
                        {this.renderThumbnail()}
                        <div className={`${CLASS_NAME}__body-content`}>
                            <div title={types} className={`${CLASS_NAME}__type`}>
                                <div className={`${CLASS_NAME}__type-value`}>{this.getTypesLabel()}</div>
                            </div>
                            <div className={`${CLASS_NAME}__label`} title={label}>{label}</div>
                        </div>
                        {this.renderValidationStatus()}
                    </div>
                </div>
                {isExpanded ? (
                    <div className={`${CLASS_NAME}__dropdown`} style={{borderColor: color}}>
                        {this.renderPhoto()}
                        <div className={`${CLASS_NAME}__dropdown-content`}>
                            {this.renderIri()}
                            {this.renderProperties()}
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    private renderValidationStatus() {
        const {editor, view} = this.context.ontodiaElement;
        const iri = this.props.iri as ElementIri;
        const validation = editor.validationState.elements.get(iri);
        if (!validation) {
            return null;
        }
        const title = validation.errors.map(error => {
            if (error.linkType) {
                const {id, label} = view.model.createLinkType(error.linkType);
                const source = formatLocalizedLabel(id, label, view.getLanguage());
                return `${source}: ${error.message}`;
            } else if (error.propertyType) {
                const {id, label} = view.model.createProperty(error.propertyType);
                const source = formatLocalizedLabel(id, label, view.getLanguage());
                return `${source}: ${error.message}`;
            } else {
                return error.message;
            }
        }).join('\n');
        return (
            <div className={`${CLASS_NAME}__validation`} title={title}>
                {validation.loading
                    ? <HtmlSpinner width={15} height={17} />
                    : <div className={`${CLASS_NAME}__invalid-icon`} />}
                {(!validation.loading && validation.errors.length > 0)
                    ? validation.errors.length : undefined}
            </div>
        );
    }
}
