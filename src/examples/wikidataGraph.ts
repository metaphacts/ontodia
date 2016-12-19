import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import {
    Workspace, WorkspaceProps, WikidataDataProvider, OrganizationTemplate, PersonTemplate,
    GraphBuilder,
} from '../index';

require('jointjs/css/layout.css');
require('jointjs/css/themes/default.css');

document.addEventListener('DOMContentLoaded', () => {
    const container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);

    const props: WorkspaceProps & ClassAttributes<Workspace> = {
        onSaveDiagram: workspace => {
            const layout = workspace.getModel().exportLayout();
            console.log(layout);
        },
        ref: workspace => {
            // if you reuse this code you should check for workspace to be null on unmount
            if (workspace) {
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

                const model = workspace.getModel();
                model.graph.on('action:iriClick', (iri: string) => {
                    window.open(iri);
                    console.log(iri);
                });

                const dataProvider = new WikidataDataProvider({
                    endpointUrl: '/sparql-endpoint',
                    imageClassUris: [
                        'http://www.wikidata.org/prop/direct/P18',
                        'http://www.wikidata.org/prop/direct/P154',
                    ],
                });
                const graphBuilder = new GraphBuilder(dataProvider, '/sparql-endpoint');

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
                    }`
                );
                workspace.showWaitIndicatorWhile(loadingGraph);

                loadingGraph.then(response => model.importLayout({
                    dataProvider,
                    preloadedElements: response.preloadedElements,
                    preloadedLinks: response.preloadedLinks,
                    layoutData: response.layout,
                })).then(() => {
                    workspace.forceLayout();
                    workspace.zoomToFit();
                });
            }
        },
    };

    ReactDOM.render(createElement(Workspace, props), container);
});
