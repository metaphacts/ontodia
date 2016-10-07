import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, WikidataDataProvider } from '../index';

require('jointjs/css/layout.css');
require('jointjs/css/themes/default.css');

document.addEventListener('DOMContentLoaded', () => {
    const container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);

    const props: WorkspaceProps & ClassAttributes<Workspace> = {
        onSaveDiagram: workspace => {
            const layout = workspace.getModel().exportLayout();
            console.log(layout);
        },
        ref: workspace => {
            // if you reuse this code you should check for workspace to be null on unmount
            if (workspace) {
                const model = workspace.getModel();
                model.graph.on('action:iriClick', (iri: string) => {
                    console.log(iri);
                });
                model.importLayout({
                    dataProvider: new WikidataDataProvider({
                        endpointUrl: '/sparql-endpoint',
                        imageClassUris: [
                            'http://www.wikidata.org/prop/direct/P18',
                        ],
                    }),
                    preloadedElements: {},
                    preloadedLinks: [],
                    layoutData: undefined,
                });
            }
        },
    };

    ReactDOM.render(createElement(Workspace, props), container);
});
