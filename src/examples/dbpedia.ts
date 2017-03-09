import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, SparqlDataProvider } from '../index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';
import {DBPediaOptions, QueryMethod} from "../ontodia/data/sparql/sparqlDataProvider";

require('jointjs/css/layout.css');
require('jointjs/css/themes/default.css');

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const model = workspace.getModel();
    model.graph.on('action:iriClick', (iri: string) => {
        window.open(iri);
        console.log(iri);
    });

    const layoutData = tryLoadLayoutFromLocalStorage();
    model.importLayout({
        layoutData,
        validateLinks: true,
        dataProvider: new SparqlDataProvider({
            endpointUrl: 'http://dbpedia.org/sparql',
            imageClassUris: [
                'http://xmlns.com/foaf/0.1/depiction',
                'http://xmlns.com/foaf/0.1/img',
            ],
            queryMethod: QueryMethod.GET,
        }, DBPediaOptions),
    });
}

const props: WorkspaceProps & ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
    onSaveDiagram: workspace => {
        const {layoutData} = workspace.getModel().exportLayout();
        window.location.hash = saveLayoutToLocalStorage(layoutData);
        window.location.reload();
    },
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
