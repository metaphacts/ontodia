import * as React from 'react';
import { Component } from 'react';

import { isEncodedBlank } from '../../data/sparql/blankNodes';

import { TemplateProps, PropArray } from '../props';
import { getProperty, getPropertyValues } from './utils';

import { TemplateProperties } from '../../data/schema';

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
        const {color, types, isExpanded, iri, propsAsList} = this.props;
        const label = this.getLabel();

        const {editor} = context;
        const isNewElement = AuthoringState.isNewElement(editor.authoringState, iri);
        const leftStripeColor = isNewElement ? 'white' : color;
        const pinnedProperties = this.findPinnedProperties(context);

        return (
            <div className={CLASS_NAME}>
                <div className={`${CLASS_NAME}__main`} style={{backgroundColor: leftStripeColor, borderColor: color}}>
                    <div className={`${CLASS_NAME}__body`} style={{borderLeftColor: color}}>
                        <div className={`${CLASS_NAME}__body-horizontal`}>
                            {this.renderThumbnail()}
                            <div className={`${CLASS_NAME}__body-content`}>
                                <div title={types} className={`${CLASS_NAME}__type`}>
                                    <div className={`${CLASS_NAME}__type-value`}>{this.getTypesLabel()}</div>
                                </div>
                                <div className={`${CLASS_NAME}__label`} title={label}>{label}</div>
                            </div>
                        </div>
                        {pinnedProperties ? (
                            <div className={`${CLASS_NAME}__pinned-props`} style={{borderColor: color}}>
                                {this.renderProperties(pinnedProperties)}
                            </div>
                        ) : null}
                    </div>
                </div>
                {isExpanded ? (
                    <div className={`${CLASS_NAME}__dropdown`} style={{borderColor: color}}>
                        {this.renderPhoto()}
                        <div className={`${CLASS_NAME}__dropdown-content`}>
                            {this.renderIri(context)}
                            {this.renderProperties(propsAsList)}
                            {editor.inAuthoringMode ? <hr className={`${CLASS_NAME}__hr`} /> : null}
                            {editor.inAuthoringMode ? this.renderActions(context) : null}
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    private findPinnedProperties(context: AuthoredEntityContext): PropArray | undefined {
        const {isExpanded, propsAsList, elementId} = this.props;
        if (isExpanded) { return undefined; }
        const templateState = context.view.model.getElement(elementId).elementState;
        if (!templateState) { return undefined; }
        const pinned = templateState[TemplateProperties.PinnedProperties] as PinnedProperties;
        if (!pinned) { return undefined; }
        const filtered = propsAsList.filter(prop => Boolean(pinned[prop.id]));
        return filtered.length === 0 ? undefined : filtered;
    }

    private renderProperties(propsAsList: PropArray) {
        if (!propsAsList.length) {
            return <div>no properties</div>;
        }

        return (
            <div className={`${CLASS_NAME}__properties`}>
                {propsAsList.map(({name, id, property}) => {
                    const propertyValues = getPropertyValues(property);
                    return <div key={id} className={`${CLASS_NAME}__properties-row`}>
                        <div className={`${CLASS_NAME}__properties-key`} title={`${name} (${id})`}>
                            {name}
                        </div>
                        <div className={`${CLASS_NAME}__properties-values`}>
                            {propertyValues.map((text, index) => (
                                <div className={`${CLASS_NAME}__properties-value`} key={index} title={text}>
                                    {text}
                                </div>
                            ))}
                        </div>
                    </div>;
                })}
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

    private renderIri(context: AuthoredEntityContext) {
        const {iri} = this.props;
        const finalIri = context.editedIri === undefined ? iri : context.editedIri;
        return (
            <div>
                <div className={`${CLASS_NAME}__iri`}>
                    <div className={`${CLASS_NAME}__iri-key`}>
                        IRI{context.editedIri ? '\u00A0(edited)' : ''}:
                    </div>
                    <div className={`${CLASS_NAME}__iri-value`}>
                        {isEncodedBlank(finalIri)
                            ? <span>(blank node)</span>
                            : <a href={finalIri}
                                title={finalIri}
                                data-iri-click-intent='openEntityIri'>
                                {finalIri}
                            </a>}
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

        const typeLabel = this.getTypesLabel();
        return (
            <div className={`${CLASS_NAME}__thumbnail`} aria-hidden='true' style={{color}}>
                {typeLabel.length > 0 ? typeLabel.charAt(0).toUpperCase() : '✳'}
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

interface PinnedProperties {
    [propertyId: string]: boolean;
}
