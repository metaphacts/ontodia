import * as React from 'react';
import { Component } from 'react';

import { isEncodedBlank } from '../../data/sparql/blankNodes';

import { TemplateProps } from '../props';
import { getProperty } from './utils';

import { formatLocalizedLabel } from '../../diagram/model';

import { AuthoredEntity, AuthoredEntityContext } from '../../editor/authoredEntity';
import { AuthoringState } from '../../editor/authoringState';

import { HtmlSpinner } from '../../viewUtils/spinner';

const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name';

const CLASS_NAME = 'ontodia-standard-template';

export class StandardTemplate extends Component<TemplateProps, {}> {
    render() {
        return (
            <AuthoredEntity templateProps={this.props}>
                {context => this.renderTemplate(context)}
            </AuthoredEntity>
        );
    }

    private renderTemplate(context: AuthoredEntityContext) {
        const {color, types, isExpanded, iri} = this.props;
        const label = this.getLabel();

        const {editor} = context;
        const isNewElement = AuthoringState.isNewElement(editor.authoringState, iri);
        const leftStripeColor = isNewElement ? 'white' : color;

        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__main`} style={{backgroundColor: leftStripeColor, borderColor: color}}>
                    <div className={`${CLASS_NAME}__body`} style={{borderLeftColor: color}}>
                        {this.renderThumbnail()}
                        <div className={`${CLASS_NAME}__body-content`}>
                            <div title={types} className={`${CLASS_NAME}__type`}>
                                <div className={`${CLASS_NAME}__type-value`}>{this.getTypesLabel()}</div>
                            </div>
                            <div className={`${CLASS_NAME}__label`} title={label}>{label}</div>
                        </div>
                        {editor.inAuthoringMode ? this.renderValidationStatus(context) : null}
                    </div>
                </div>
                {isExpanded ? (
                    <div className={`${CLASS_NAME}__dropdown`} style={{borderColor: color}}>
                        {this.renderPhoto()}
                        <div className={`${CLASS_NAME}__dropdown-content`}>
                            {this.renderIri()}
                            {this.renderProperties()}
                            {editor.inAuthoringMode ? <hr className={`${CLASS_NAME}__hr`} /> : null}
                            {editor.inAuthoringMode ? this.renderActions(context) : null}
                        </div>
                    </div>
                ) : null}
            </div>
        );
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
        const {color, imgUrl, iconUrl} = this.props;

        if (imgUrl) {
            return (
                <div className={`${CLASS_NAME}__thumbnail`} aria-hidden='true'>
                    <img src={imgUrl} className={`${CLASS_NAME}__thumbnail-image`} />
                </div>
            );
        } else if (iconUrl) {
            return (
                <div className={`${CLASS_NAME}__thumbnail`} aria-hidden='true'>
                    <img src={iconUrl} className={`${CLASS_NAME}__thumbnail-icon`} />
                </div>
            );
        }

        const label = this.getLabel();
        return (
            <div className={`${CLASS_NAME}__thumbnail`} aria-hidden='true' style={{color}}>
                {label.charAt(0).toUpperCase()}
            </div>
        );
    }

    protected getTypesLabel(): string {
        return this.props.types;
    }

    private getLabel() {
        const {label, props} = this.props;
        return getProperty(props, FOAF_NAME) || label;
    }

    private renderValidationStatus({editor, view}: AuthoredEntityContext) {
        const validation = editor.validationState.elements.get(this.props.iri);
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

    private renderActions(context: AuthoredEntityContext) {
        const {canEdit, canDelete, onEdit, onDelete} = context;
        const SPINNER_WIDTH = 15;
        const SPINNER_HEIGHT = 12;
        return (
            <div className={`${CLASS_NAME}__actions`}>
                <button type='button'
                    className='ontodia-btn ontodia-btn-default'
                    title={canDelete ? 'Delete entity' : 'Deletion is unavailable for the selected element'}
                    disabled={!canDelete}
                    onClick={onDelete}>
                    <span className='fa fa-trash' />&nbsp;
                    {canEdit === undefined
                        ? <HtmlSpinner width={SPINNER_WIDTH} height={SPINNER_HEIGHT} />
                        : 'Delete'}
                </button>
                <button type='button'
                    className='ontodia-btn ontodia-btn-default'
                    title={canEdit ? 'Edit entity' : 'Editing is unavailable for the selected element'}
                    disabled={!canEdit}
                    onClick={onEdit}>
                    <span className='fa fa-edit' />&nbsp;
                    {canEdit === undefined
                        ? <HtmlSpinner width={SPINNER_WIDTH} height={SPINNER_HEIGHT} />
                        : 'Edit'}
                </button>
            </div>
        );
    }
}
