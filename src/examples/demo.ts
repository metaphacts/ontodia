import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, DemoDataProvider } from '../index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

const CLASSES = require<any>('./resources/classes.json');
const LINK_TYPES = require<any>('./resources/linkTypes.json');
const ELEMENTS = require<any>('./resources/elements.json');
const LINKS  = require<any>('./resources/links.json');

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const diagram = tryLoadLayoutFromLocalStorage();
    workspace.getModel().importLayout({
        diagram,
        dataProvider: new DemoDataProvider(CLASSES, LINK_TYPES, ELEMENTS, LINKS),
        validateLinks: true,
    });
}

const props: WorkspaceProps & ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
    onSaveDiagram: workspace => {
        const diagram = workspace.getModel().exportLayout();
        window.location.hash = saveLayoutToLocalStorage(diagram);
        window.location.reload();
    },
    viewOptions: {
        onIriClick: iri => window.open(iri),
    },
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
