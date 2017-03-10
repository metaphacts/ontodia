import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, SparqlDataProvider, OWLRDFSSettings } from '../index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

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
            endpointUrl: '/sparql-endpoint',
            imagePropertyUris: [
                'http://collection.britishmuseum.org/id/ontology/PX_has_main_representation',
                'http://xmlns.com/foaf/0.1/img',
            ],
        }, {...OWLRDFSSettings, ...{
            defaultPrefix: OWLRDFSSettings.defaultPrefix + `
PREFIX rso: <http://www.researchspace.org/ontology/>`,
            dataLabelProperty: "rso:displayLabel",
            ftsSettings: {
                ftsPrefix: 'PREFIX bds: <http://www.bigdata.com/rdf/search#>' + '\n',
                ftsQueryPattern: ` 
              ?inst rdfs:label ?searchLabel. 
              SERVICE bds:search {
                     ?searchLabel bds:search "\${text}*" ;
                                  bds:minRelevance '0.5' ;
                                  
                                  bds:matchAllTerms 'true';
                                  bds:relevance ?score.
              }
            `
            }
        }
        }),
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
