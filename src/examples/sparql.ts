import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, SparqlDataProvider } from '../index';

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
                    dataProvider: new SparqlDataProvider({
                        endpointUrl: '/sparql-endpoint',
                        imageClassUris: [
                            'http://collection.britishmuseum.org/id/ontology/PX_has_main_representation',
                            'http://xmlns.com/foaf/0.1/img',
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
