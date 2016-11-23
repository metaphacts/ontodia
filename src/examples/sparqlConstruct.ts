import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, SparqlDataProvider, SparqlGraphBuilder, OWLStatsSettings, SparqlQueryMethod } from '../index';

import { onPageLoad } from './common';

require('jointjs/css/layout.css');
require('jointjs/css/themes/default.css');

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const model = workspace.getModel();
    const endpointUrl = '/sparql-endpoint';
    const sparqlDataProvider = new SparqlDataProvider({endpointUrl: endpointUrl, queryMethod: SparqlQueryMethod.POST}, OWLStatsSettings);
    const graphBuilder = new SparqlGraphBuilder(sparqlDataProvider);

    const loadingGraph = graphBuilder.getGraphFromConstruct(
        `CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o FILTER(isIRI(?s) && isIRI(?o)) } LIMIT 1000`,
    );
    workspace.showWaitIndicatorWhile(loadingGraph);

    loadingGraph.then(({layoutData, preloadedElements}) => model.importLayout({
        layoutData,
        preloadedElements,
        dataProvider: sparqlDataProvider,
    })).then(() => {
        const start = performance.now();
        workspace.forceLayout();
        workspace.zoomToFit();
        const end = performance.now();
        console.log(`Layout performed in ${Math.round(end - start)} ms`);
    });
}

const props: WorkspaceProps & ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
