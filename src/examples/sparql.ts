import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import {
    Workspace, WorkspaceProps, SparqlDataProvider, OWLStatsSettings, SparqlQueryMethod, GroupTemplate, LinkTypeIri
} from '../index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const diagram = tryLoadLayoutFromLocalStorage();
    workspace.getModel().importLayout({
        diagram: {
            ...diagram,
            linkTypeOptions: [
                {
                    '@type': 'LinkTypeOptions',
                    property: 'http://www.researchspace.org/ontology/group' as LinkTypeIri,
                    visible: false,
                },
            ],
        },
        validateLinks: true,
        dataProvider: new SparqlDataProvider({
            endpointUrl: '/sparql',
            imagePropertyUris: [
                'http://collection.britishmuseum.org/id/ontology/PX_has_main_representation',
                'http://xmlns.com/foaf/0.1/img',
            ],
            queryMethod: SparqlQueryMethod.GET,
            acceptBlankNodes: true,
        }, OWLStatsSettings),
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
        templatesResolvers: [
            types => {
                if (types.indexOf('http://www.ics.forth.gr/isl/CRMinf/I2_Belief') !== -1) {
                    return GroupTemplate;
                }
                return undefined;
            }
        ],
        groupBy: [
            {linkType: 'http://www.researchspace.org/ontology/group', linkDirection: 'in'},
        ],
    },
    languages: [
        {code: 'en', label: 'English'},
        {code: 'de', label: 'German'},
        {code: 'ru', label: 'Russian'},
    ],
    language: 'ru',
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
