import * as React from 'react';

import { TemplateProps } from '../customization/props';

import { ElementIri, LinkTypeIri, PropertyTypeIri, ElementModel, LocalizedString } from '../data/model';

import { ElementContextTypes, ElementContextWrapper } from '../diagram/elementLayer';
import { DiagramView } from '../diagram/view';

import { AuthoringKind, AuthoringState } from './authoringState';
import { EditorController } from './editorController';

import { Cancellation } from '../viewUtils/async';
import { EventObserver } from '../viewUtils/events';
import { KeyedObserver, observeLinkTypes, observeProperties } from '../viewUtils/keyedObserver';

export interface AuthoredEntityProps {
    templateProps: TemplateProps;
    children: (context: AuthoredEntityContext) => React.ReactElement<any>;
}

export interface AuthoredEntityContext {
    editor: EditorController;
    view: DiagramView;
    canEdit: boolean | undefined;
    canDelete: boolean | undefined;
    onEdit: () => void;
    onDelete: () => void;
}

export interface State {
    canEdit?: boolean;
    canDelete?: boolean;
}

/**
 * Component to simplify tracking changes in validation messages (property and link type labels).
 */
export class AuthoredEntity extends React.Component<AuthoredEntityProps, State> {
    static contextTypes = ElementContextTypes;
    context: ElementContextWrapper;

    private readonly listener = new EventObserver();
    private queryCancellation = new Cancellation();
    private linkTypesObserver: KeyedObserver<LinkTypeIri>;
    private propertiesObserver: KeyedObserver<PropertyTypeIri>;

    constructor(props: AuthoredEntityProps, context: any) {
        super(props, context);
        this.state = {};
    }

    componentDidMount() {
        const {templateProps: {iri}} = this.props;
        const {editor} = this.context.ontodiaElement;
        this.listener.listen(editor.events, 'changeAuthoringState', ({previous}) => {
            const current = editor.authoringState;
            if (current.index.elements.get(iri) !== previous.index.elements.get(iri)) {
                this.queryAllowedActions();
            }
        });
        this.linkTypesObserver = observeLinkTypes(
            editor.model, 'changeLabel', () => this.forceUpdate()
        );
        this.propertiesObserver = observeProperties(
            editor.model, 'changeLabel', () => this.forceUpdate()
        );
        this.observeTypes();
        this.queryAllowedActions();
    }

    componentDidUpdate(prevProps: AuthoredEntityProps) {
        this.observeTypes();
        if (this.props.templateProps.isExpanded !== prevProps.templateProps.isExpanded) {
            this.queryAllowedActions();
        }
    }

    private observeTypes() {
        const {iri} = this.props.templateProps;
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
        this.listener.stopListening();
        this.linkTypesObserver.stopListening();
        this.propertiesObserver.stopListening();
        this.queryCancellation.abort();
    }

    private queryAllowedActions() {
        const {isExpanded, elementId, iri} = this.props.templateProps;
        // only fetch whether it's allowed to edit when expanded
        if (!this.props.templateProps.isExpanded) { return; }
        this.queryCancellation.abort();
        this.queryCancellation = new Cancellation();

        const {editor} = this.context.ontodiaElement;
        const element = editor.model.getElement(elementId);

        if (!(editor.metadataApi && element) || isDeletedElement(editor.authoringState, iri)) {
            this.setState({canEdit: false, canDelete: false});
        } else {
            const data = element.data;
            this.queryCanEdit(data);
            this.queryCanDelete(data);
        }
    }

    private queryCanEdit(data: ElementModel) {
        const {editor} = this.context.ontodiaElement;
        const {elementId} = this.props.templateProps;
        const signal = this.queryCancellation.signal;
        this.setState({canEdit: undefined});
        editor.metadataApi.canEditElement(data, signal).then(canEdit => {
            if (signal.aborted) { return; }
            this.setState({canEdit});
        });
    }

    private queryCanDelete(data: ElementModel) {
        const {editor} = this.context.ontodiaElement;
        const {elementId} = this.props.templateProps;
        const signal = this.queryCancellation.signal;
        this.setState({canDelete: undefined});
        editor.metadataApi.canDeleteElement(data, signal).then(canDelete => {
            if (signal.aborted) { return; }
            this.setState({canDelete});
        });
    }

    render() {
        const {children: renderTemplate} = this.props;
        const {editor, view} = this.context.ontodiaElement;
        const {canEdit, canDelete} = this.state;
        return renderTemplate({
            editor, view, canEdit, canDelete,
            onEdit: this.onEdit,
            onDelete: this.onDelete,
        });
    }

    private onEdit = () => {
        const {editor} = this.context.ontodiaElement;
        const {elementId} = this.props.templateProps;
        const element = editor.model.getElement(elementId);
        editor.showEditEntityForm(element);
    }

    private onDelete = () => {
        const {editor} = this.context.ontodiaElement;
        const {iri} = this.props.templateProps;
        editor.deleteEntity(iri);
    }
}

function isDeletedElement(state: AuthoringState, target: ElementIri) {
    const event = state.index.elements.get(target);
    return event && event.type === AuthoringKind.DeleteElement;
}
