import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, SparqlDataProvider, OWLStatsSettings, SparqlQueryMethod } from '../index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const layoutData = tryLoadLayoutFromLocalStorage();
    workspace.getModel().importLayout({
        layoutData,
        validateLinks: true,
        dataProvider: new SparqlDataProvider({
            endpointUrl: '/sparql-endpoint',
            imagePropertyUris: [
                'http://collection.britishmuseum.org/id/ontology/PX_has_main_representation',
                'http://xmlns.com/foaf/0.1/img',
            ],
            queryMethod: SparqlQueryMethod.GET,
            acceptBlankNodes: true,
            forceProperty: [
                'http://www.w3.org/2000/01/rdf-schema#domain',
                'http://www.w3.org/2000/01/rdf-schema#isDefinedBy',
            ],
        }, OWLStatsSettings),
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
        onIriClick: iri => window.open(iri),
    },
    languages: [
        {code: 'en', label: 'English'},
        {code: 'de', label: 'German'},
        {code: 'ru', label: 'Russian'},
    ],
    language: 'ru',
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
