import * as React from 'react';

import { TemplateProps } from '../customization/props';

import { ElementModel } from '../data/model';

import { DiagramView } from '../diagram/view';
import { PaperAreaContextTypes, PaperAreaContextWrapper } from '../diagram/paperArea';

import { Cancellation, CancellationToken } from '../viewUtils/async';
import { Listener } from '../viewUtils/events';

import { WorkspaceContextTypes, WorkspaceContextWrapper } from '../workspace/workspaceContext';

import { AuthoringState, AuthoringKind } from './authoringState';
import { EditorController, EditorEvents } from './editorController';

export interface AuthoredEntityProps {
    templateProps: TemplateProps;
    children: (context: AuthoredEntityContext) => React.ReactElement<any>;
}

export interface AuthoredEntityContext {
    editor: EditorController;
    editedIri?: string;
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
    static contextTypes = {...PaperAreaContextTypes, ...WorkspaceContextTypes};
    context: PaperAreaContextWrapper & WorkspaceContextWrapper;

    private queryCancellation = new Cancellation();

    constructor(props: AuthoredEntityProps, context: any) {
        super(props, context);
        this.state = {};
    }

    componentDidMount() {
        const {editor} = this.context.ontodiaWorkspace;
        editor.events.on('changeAuthoringState', this.onChangeAuthoringState);
        this.queryAllowedActions();
    }

    componentDidUpdate(prevProps: AuthoredEntityProps) {
        const shouldUpdateAllowedActions = !(
            this.props.templateProps.data === prevProps.templateProps.data &&
            this.props.templateProps.isExpanded === prevProps.templateProps.isExpanded
        );
        if (shouldUpdateAllowedActions) {
            this.queryAllowedActions();
        }
    }

    componentWillUnmount() {
        const {editor} = this.context.ontodiaWorkspace;
        editor.events.off('changeAuthoringState', this.onChangeAuthoringState);
        this.queryCancellation.abort();
    }

    private onChangeAuthoringState: Listener<EditorEvents, 'changeAuthoringState'> = e => {
        const {source: editor, previous} = e;
        const iri = this.props.templateProps.data.id;
        const current = editor.authoringState;
        if (current.elements.get(iri) !== previous.elements.get(iri)) {
            this.queryAllowedActions();
        }
    }

    private queryAllowedActions() {
        const {isExpanded, data} = this.props.templateProps;
        // only fetch whether it's allowed to edit when expanded
        if (!isExpanded) { return; }
        this.queryCancellation.abort();
        this.queryCancellation = new Cancellation();

        const {editor} = this.context.ontodiaWorkspace;

        if (!editor.metadataApi || AuthoringState.isDeletedElement(editor.authoringState, data.id)) {
            this.setState({canEdit: false, canDelete: false});
        } else {
            this.queryCanEdit(data);
            this.queryCanDelete(data);
        }
    }

    private queryCanEdit(data: ElementModel) {
        const {editor} = this.context.ontodiaWorkspace;
        const signal = this.queryCancellation.signal;
        this.setState({canEdit: undefined});
        CancellationToken.mapCancelledToNull(
            signal,
            editor.metadataApi.canEditElement(data, signal),
        ).then(canEdit => {
            if (canEdit === null) { return; }
            this.setState({canEdit});
        });
    }

    private queryCanDelete(data: ElementModel) {
        const {editor} = this.context.ontodiaWorkspace;
        const signal = this.queryCancellation.signal;
        this.setState({canDelete: undefined});
        CancellationToken.mapCancelledToNull(
            signal,
            editor.metadataApi.canDeleteElement(data, signal)
        ).then(canDelete => {
            if (canDelete === null) { return; }
            this.setState({canDelete});
        });
    }

    render() {
        const {children: renderTemplate} = this.props;
        const {view} = this.context.ontodiaPaperArea;
        const {editor} = this.context.ontodiaWorkspace;
        const {canEdit, canDelete} = this.state;

        const iri = this.props.templateProps.iri;
        const elementEvent = editor.authoringState.elements.get(iri);
        const editedIri = elementEvent && elementEvent.type === AuthoringKind.ChangeElement ?
            elementEvent.newIri : undefined;

        return renderTemplate({
            editor, view, canEdit, canDelete, editedIri,
            onEdit: this.onEdit,
            onDelete: this.onDelete,
        });
    }

    private onEdit = () => {
        const {editor} = this.context.ontodiaWorkspace;
        const {elementId} = this.props.templateProps;
        const element = editor.model.getElement(elementId);
        editor.showEditEntityForm(element);
    }

    private onDelete = () => {
        const {editor} = this.context.ontodiaWorkspace;
        const {data} = this.props.templateProps;
        editor.deleteEntity(data.id);
    }
}
