import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import {
    Workspace, WorkspaceProps, SparqlDataProvider, SparqlGraphBuilder, OWLStatsSettings, SparqlQueryMethod
} from '../index';

import { onPageLoad } from './common';

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const model = workspace.getModel();
    const sparqlDataProvider = new SparqlDataProvider({
        endpointUrl: '/sparql',
        queryMethod: SparqlQueryMethod.GET
    }, OWLStatsSettings);
    const graphBuilder = new SparqlGraphBuilder(sparqlDataProvider);

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

    loadingGraph.then(({diagram, preloadedElements}) => model.importLayout({
        diagram,
        preloadedElements,
        dataProvider: sparqlDataProvider,
    })).then(() => {
        workspace.forceLayout();
        workspace.zoomToFit();
    });
}

const props: WorkspaceProps & ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
