import { PropTypes } from '../viewUtils/react';
import { EditorController } from '../editor/editorController';
import { UserActionHandler } from './workspaceMarkup';

export interface WorkspaceContextWrapper {
    ontodiaWorkspace: WorkspaceContext;
}

export interface WorkspaceContext {
    editor: EditorController;
    onUserAction?: UserActionHandler;
}

export const WorkspaceContextTypes: { [K in keyof WorkspaceContextWrapper]: any } = {
    ontodiaWorkspace: PropTypes.anything,
};
