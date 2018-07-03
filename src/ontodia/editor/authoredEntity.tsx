import * as React from 'react';

import { ElementIri, LinkTypeIri, PropertyTypeIri, LocalizedString } from '../data/model';

import { ElementContextTypes, ElementContextWrapper } from '../diagram/elementLayer';
import { DiagramView } from '../diagram/view';

import { EditorController } from './editorController';

import { EventObserver } from '../viewUtils/events';
import { KeyedObserver, observeLinkTypes, observeProperties } from '../viewUtils/keyedObserver';

export interface AuthoredEntityProps {
    iri: ElementIri;
    children: (context: AuthoredEntityContext) => React.ReactElement<any>;
}

export interface AuthoredEntityContext {
    editor: EditorController;
    view: DiagramView;
}

/**
 * Component to simplify tracking changes in validation messages (property and link type labels).
 */
export class AuthoredEntity extends React.Component<AuthoredEntityProps, {}> {
    static contextTypes = ElementContextTypes;
    context: ElementContextWrapper;

    private linkTypesObserver: KeyedObserver<LinkTypeIri>;
    private propertiesObserver: KeyedObserver<PropertyTypeIri>;

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
        const iri = this.props.iri;
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

    render() {
        const {children: renderTemplate} = this.props;
        return renderTemplate(this.context.ontodiaElement);
    }
}
