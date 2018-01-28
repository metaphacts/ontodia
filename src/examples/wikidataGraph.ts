import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import {
    Workspace, WorkspaceProps, SparqlDataProvider, OrganizationTemplate, PersonTemplate,
    SparqlGraphBuilder, WikidataSettings,
} from '../index';

import { onPageLoad } from './common';

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const diagram = workspace.getDiagram();
    diagram.registerTemplateResolver(types => {
        if (types.indexOf('http://www.wikidata.org/entity/Q43229') !== -1) {
            return OrganizationTemplate;
        } else if (types.indexOf('http://www.wikidata.org/entity/Q5') !== -1) {
            return PersonTemplate;
        } else {
            return undefined;
        }
    });
    diagram.registerElementStyleResolver(types => {
        if (types.indexOf('http://www.wikidata.org/entity/Q43229') !== -1) {
            return {color: '#77ca98', icon: 'ontodia-organization-icon'};
        } else if (types.indexOf('http://www.wikidata.org/entity/Q5') !== -1) {
            return {color: '#eb7777', icon: 'ontodia-person-icon'};
        } else {
            return undefined;
        }
    });

    const dataProvider = new SparqlDataProvider({
        endpointUrl: '/sparql-endpoint',
        imagePropertyUris: [
            'http://www.wikidata.org/prop/direct/P18',
            'http://www.wikidata.org/prop/direct/P154',
        ],
    }, WikidataSettings);
    const graphBuilder = new SparqlGraphBuilder(dataProvider);

    const loadingGraph = graphBuilder.getGraphFromConstruct(`
        CONSTRUCT { ?current ?p ?o. }
        WHERE {
            {
            ?current ?p ?o.
            ?p <http://www.w3.org/2000/01/rdf-schema#label> ?label.
            FILTER(ISIRI(?o))
            FILTER exists{?o ?p1 ?o2}
            }
        }
        LIMIT 20
        VALUES (?current) {
            (<http://www.wikidata.org/entity/Q567>)
        }`,
    );
    workspace.showWaitIndicatorWhile(loadingGraph);

    loadingGraph.then(({layoutData, preloadedElements}) =>
        workspace.getModel().importLayout({layoutData, preloadedElements, dataProvider}),
    ).then(() => {
        workspace.forceLayout();
        workspace.zoomToFit();
    });
}

const props: WorkspaceProps & ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
    viewOptions: {
        onIriClick: iri => window.open(iri),
    },
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
