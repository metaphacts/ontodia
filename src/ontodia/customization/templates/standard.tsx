import * as React from 'react';
import { Component } from 'react';

import { CrossOriginImage } from '../../viewUtils/crossOriginImage';
import { TemplateProps } from '../props';
import { getProperty } from './utils';

const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name';

const CLASS_NAME = 'ontodia-standard-template';

export class StandardTemplate extends Component<TemplateProps, {}> {
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
            <CrossOriginImage
                className={`${CLASS_NAME}__photo`}
                style={{borderColor: color}}
                imageProps={{
                    src: imgUrl,
                    className: `${CLASS_NAME}__photo-image`
                }}
            />
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
                        <a href={iri} title={iri}>{iri}</a>
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
                <CrossOriginImage
                    className={`${CLASS_NAME}__thumbnail`}
                    aria-hidden='true'
                    style={{color}}
                    imageProps={{
                        src: imgUrl,
                        className: `${CLASS_NAME}__thumbnail-image`,
                        style: {color},
                    }}
                />
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
}
