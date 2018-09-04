import { PropTypes } from '../viewUtils/react';
import { EditorController } from '../editor/editorController';

export type WorkspaceEventHandler = (key: WorkspaceEventKey) => void;
export enum WorkspaceEventKey {
    searchQueryItem = 'search:queryItems',
    connectionsLoadLinks = 'connections:loadLinks',
    connectionsExpandLink = 'connections:expandLink',
    connectionsLoadElements = 'connections:loadElements',
    editorChangeSelection = 'editor:changeSelection',
    editorToggleDialog = 'editor:toggleDialog',
    editorAddElements = 'editor:addElements',
    elementRequestedAddToFilter = 'element:requestedAddToFilter',
}

export interface WorkspaceContextWrapper {
    ontodiaWorkspace: WorkspaceContext;
}

export interface WorkspaceContext {
    editor: EditorController;
    triggerWorkspaceEvent: WorkspaceEventHandler;
}

export const WorkspaceContextTypes: { [K in keyof WorkspaceContextWrapper]: any } = {
    ontodiaWorkspace: PropTypes.anything,
};
