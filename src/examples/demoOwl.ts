import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, DemoDataProvider, LinkTemplate, VowlTemplateBundle } from '../index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

require('jointjs/css/layout.css');
require('jointjs/css/themes/default.css');

const CUSTOM_LINK_TEMPLATE_SUBCLASSOF: LinkTemplate = {
    renderLink: () => ({
        connection: {
            stroke: 'black',
            'stroke-width': 2,
            'stroke-dasharray': '5,5',
        },
        label: {
            attrs: { text: { fill: 'black' } },
        },
    }),
};
const CUSTOM_LINK_TEMPLATE: LinkTemplate = {
    renderLink: () => ({
        connection: {
            stroke: 'black',
            'stroke-width': 2,
        },
        label: {
            attrs: { text: { fill: 'black' } },
        },
    }),
};

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const model = workspace.getModel();
    model.graph.on('action:iriClick', (iri: string) => console.log(iri));

    const layoutData = tryLoadLayoutFromLocalStorage();
    model.importLayout({ layoutData, dataProvider: new DemoDataProvider(), validateLinks: true });
}

const props: WorkspaceProps & ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
    onSaveDiagram: workspace => {
        const { layoutData } = workspace.getModel().exportLayout();
        window.location.hash = saveLayoutToLocalStorage(layoutData);
        window.location.reload();
    },
    viewOptions: {
        linkTemplateResolvers: [
            type => {
                if (type.indexOf('subClassOf') !== -1) {
                    return CUSTOM_LINK_TEMPLATE_SUBCLASSOF;
                } else {
                    return CUSTOM_LINK_TEMPLATE;
                }
            },
        ],
        templatesResolvers: VowlTemplateBundle,
    },
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));