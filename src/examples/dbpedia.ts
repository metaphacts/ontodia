import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, SparqlDataProvider } from '../index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';
import { SparqlQueryMethod } from '../ontodia/data/sparql/sparqlDataProvider';
import { DBPediaSettings } from '../ontodia/data/sparql/sparqlDataProviderSettings';

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const layoutData = tryLoadLayoutFromLocalStorage();
    workspace.getModel().importLayout({
        layoutData,
        validateLinks: true,
        dataProvider: new SparqlDataProvider({
            endpointUrl: 'http://dbpedia.org/sparql',
            imagePropertyUris: [
                'http://xmlns.com/foaf/0.1/depiction',
                'http://xmlns.com/foaf/0.1/img',
            ],
            queryMethod: SparqlQueryMethod.GET,
        }, DBPediaSettings),
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
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
