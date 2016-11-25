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
                    `CONSTRUCT {
                        ?inst rdf:type ?class.
                        ?inst ?propType1 ?propValue1.
                        ?inst rdfs:label ?label .
                        ?propValue2 ?propType2 ?inst .
                    } WHERE {
                        BIND (<http://collection.britishmuseum.org/id/object/JCF8939> as ?inst)
                        ?inst rdf:type ?class.	
                        OPTIONAL {?inst rdfs:label ?label}
                        OPTIONAL {?inst ?propType1 ?propValue1.  FILTER(isURI(?propValue1)). }  	
                        OPTIONAL {?propValue2 ?propType2 ?inst.  FILTER(isURI(?propValue2)). }  
                    } LIMIT 100`
                ).then(response => model.importLayout({
                    dataProvider: sparqlDataProvider,
                    preloadedElements: response.preloadedElements,
                    preloadedLinks: response.preloadedLinks,
                    layoutData: response.layout,
                })).then(() => {
                    workspace.forceLayout();
                    workspace.zoomToFit();
                });
            }
        },
    };

    ReactDOM.render(createElement(Workspace, props), container);
});
