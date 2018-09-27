import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, SparqlDataProvider, OWLRDFSSettings } from '../index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const diagram = tryLoadLayoutFromLocalStorage();
    workspace.getModel().importLayout({
        diagram,
        validateLinks: true,
        dataProvider: new SparqlDataProvider({
            endpointUrl: '/sparql',
            imagePropertyUris: [
                'http://xmlns.com/foaf/0.1/img',
            ],
            // queryMethod: SparqlQueryMethod.POST
        }, {...OWLRDFSSettings, ...{
            fullTextSearch: {
                prefix: 'PREFIX bds: <http://www.bigdata.com/rdf/search#>' + '\n',
                queryPattern: `
              ?inst rdfs:label ?searchLabel.
              SERVICE bds:search {
                     ?searchLabel bds:search "\${text}*" ;
                                  bds:minRelevance '0.5' ;

                                  bds:matchAllTerms 'true';
                                  bds:relevance ?score.
              }
            `
            },
            elementInfoQuery: `
            CONSTRUCT {
                ?inst rdf:type ?class;
                    rdfs:label ?label;
                    ?propType ?propValue.
            }
            WHERE {
                OPTIONAL {?inst rdf:type ?class . }
                OPTIONAL {?inst \${dataLabelProperty} ?label}
                OPTIONAL {?inst ?propType ?propValue.
                FILTER (isLiteral(?propValue)) }
			    VALUES ?labelProp { rdfs:label foaf:name }
            } VALUES (?inst) {\${ids}}
        `,
        }
        }),
    });
}

const props: WorkspaceProps & ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
    onSaveDiagram: workspace => {
        const diagram = workspace.getModel().exportLayout();
        window.location.hash = saveLayoutToLocalStorage(diagram);
        window.location.reload();
    },
    viewOptions: {
        onIriClick: iri => window.open(iri),
    },
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
