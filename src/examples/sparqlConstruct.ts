import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, SparqlDataProvider, GraphBuilder } from '../index';

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
                const endpointUrl = '/sparql-endpoint';
                const sparqlDataProvider = new SparqlDataProvider({endpointUrl});
                const graphBuilder = new GraphBuilder(sparqlDataProvider, endpointUrl);

                graphBuilder.getGraphFromConstrunct(
                    `CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }`
                ).then(response => model.importLayout({
                    dataProvider: sparqlDataProvider,
                    preloadedElements: response.preloadedElements,
                    preloadedLinks: response.preloadedLinks,
                    layoutData: response.layout,
                })).then(() => {
                    workspace.forceLayout();
                    workspace.getDiagram().zoomToFit();
                });
            }
        },
    };

    ReactDOM.render(createElement(Workspace, props), container);
});
