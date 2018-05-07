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

    const layoutData = tryLoadLayoutFromLocalStorage();
    workspace.getModel().importLayout({
        layoutData,
        dataProvider: new DemoDataProvider(CLASSES, LINK_TYPES, ELEMENTS, LINKS),
        validateLinks: true,
    });
}

const props: WorkspaceProps & ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
    onSaveDiagram: workspace => {
        const {layoutData} = workspace.getModel().exportLayout();
        window.location.hash = saveLayoutToLocalStorage(layoutData);
        window.location.reload();
    },
    viewOptions: {
        onIriClick: iri => console.log(iri),
    },
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
