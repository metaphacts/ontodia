import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, SparqlDataProvider, OWLRDFSSettings } from '../index';

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
                'http://www.researchspace.org/ontology/PX_has_main_representation',
                'http://xmlns.com/foaf/0.1/img',
            ],
        }, {...OWLRDFSSettings, ...{
            defaultPrefix: OWLRDFSSettings.defaultPrefix + `
PREFIX rso: <http://www.researchspace.org/ontology/>`,
            dataLabelProperty: "rso:displayLabel",
            ftsSettings: {
                ftsPrefix: 'PREFIX bds: <http://www.bigdata.com/rdf/search#>' + '\n',
                ftsQueryPattern: ` 
              ?inst rso:displayLabel ?searchLabel. 
              SERVICE bds:search {
                     ?searchLabel bds:search "\${text}*" ;
                                  bds:minRelevance '0.5' ;
                                  
                                  bds:matchAllTerms 'true';
                                  bds:relevance ?score.
              }
            `
            },
            elementInfoQuery: `
            SELECT ?inst ?class ?label ?propType ?propValue
            WHERE {
                OPTIONAL {?inst rdf:type ?class . }
                OPTIONAL {?inst \${dataLabelProperty} ?label}
                OPTIONAL {?inst ?propType ?propValue.
                FILTER (isLiteral(?propValue)) }
			    VALUES (?labelProp) { (rso:displayLabel) (rdfs:label) }
            } VALUES (?inst) {\${ids}}
        `,
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
    viewOptions: {
        onIriClick: iri => window.open(iri),
    },
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
