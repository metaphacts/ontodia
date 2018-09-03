import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, SparqlDataProvider, OWLStatsSettings, GraphBuilder, Triple } from '../index';

import { onPageLoad } from './common';

const GRAPH: Triple[] = [
    {
        subject: {
            'type': 'uri',
            'value': 'http://collection.britishmuseum.org/id/object/JCF8939',
        },
        predicate: {
            'type': 'uri',
            'value': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        },
        object: {
            'type': 'uri',
            'value': 'http://www.cidoc-crm.org/cidoc-crm/E22_Man-Made_Object',
        },
    },
    {
        subject: {
            'type': 'uri',
            'value': 'http://collection.britishmuseum.org/id/object/JCF8939',
        },
        predicate: {
            'type': 'uri',
            'value': 'http://www.cidoc-crm.org/cidoc-crm/P43_has_dimension',
        },
        object: {
            'type': 'uri',
            'value': 'http://collection.britishmuseum.org/id/object/JCF8939/height/1',
        },
    },
    {
        subject: {
            'type': 'uri',
            'value': 'http://www.britishmuseum.org/collectionimages/AN00230/AN00230739_001_l.jpg/digiprocess',
        },
        predicate: {
            'type': 'uri',
            'value': 'http://www.ics.forth.gr/isl/CRMdig/L1_digitized',
        },
        object: {
            'type': 'uri',
            'value': 'http://collection.britishmuseum.org/id/object/JCF8939',
        },
    },
    {
        subject: {
            'type': 'uri',
            'value': 'http://collection.britishmuseum.org/id/object/JCF8939',
        },
        predicate: {
            'type': 'uri',
            'value': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        },
        object: {
            'type': 'uri',
            'value': 'http://www.researchspace.org/ontology/Thing',
        },
    },
];

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const model = workspace.getModel();
    const endpointUrl = '/sparql';
    const sparqlDataProvider = new SparqlDataProvider({
        endpointUrl: endpointUrl,
        imagePropertyUris: ['http://collection.britishmuseum.org/id/ontology/PX_has_main_representation'],
    }, OWLStatsSettings);
    const graphBuilder = new GraphBuilder(sparqlDataProvider);

    const loadingGraph = graphBuilder.getGraphFromRDFGraph(GRAPH);
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
