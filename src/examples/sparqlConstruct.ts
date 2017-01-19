import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, SparqlDataProvider, GraphBuilder } from '../index';

import { onPageLoad } from './common';

require('jointjs/css/layout.css');
require('jointjs/css/themes/default.css');

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const model = workspace.getModel();
    const endpointUrl = '/sparql-endpoint';
    const sparqlDataProvider = new SparqlDataProvider({endpointUrl});
    const graphBuilder = new GraphBuilder(sparqlDataProvider, endpointUrl);

    const loadingGraph = graphBuilder.getGraphFromConstruct(
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
        } LIMIT 100`,
    );
    workspace.showWaitIndicatorWhile(loadingGraph);

    loadingGraph.then(({layoutData, preloadedElements}) => model.importLayout({
        layoutData,
        preloadedElements,
        dataProvider: sparqlDataProvider,
    })).then(() => {
        workspace.forceLayout();
        workspace.zoomToFit();
    });
}

const props: WorkspaceProps & ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
    onSaveDiagram: workspace => {
        const layout = workspace.getModel().exportLayout();
        console.log(layout);
    },
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
