import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, WikidataDataProvider, OrganizationTemplate, PersonTemplate } from '../index';

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
                    }
                });
                diagram.registerTemplateResolver(types => {
                    if (types.indexOf('http://www.wikidata.org/entity/Q5') !== -1) {
                        return PersonTemplate;
                    }
                });
                diagram.registerElementStyleResolver(types => {
                    if (types.indexOf('http://www.wikidata.org/entity/Q43229') !== -1) {
                        return {color: '#77ca98', icon: 'ontodia-organization-icon'};
                    }
                });
                diagram.registerElementStyleResolver(types => {
                    if (types.indexOf('http://www.wikidata.org/entity/Q5') !== -1) {
                        return {color: '#eb7777', icon: 'ontodia-person-icon'};
                    }
                });

                const model = workspace.getModel();
                model.graph.on('action:iriClick', (iri: string) => {
                    window.open(iri);
                    console.log(iri);
                });
                model.importLayout({
                    dataProvider: new WikidataDataProvider({
                        endpointUrl: '/sparql-endpoint',
                        imageClassUris: [
                            'http://www.wikidata.org/prop/direct/P18',
                            'http://www.wikidata.org/prop/direct/P154',
                        ],
                    }),
                    preloadedElements: {},
                    preloadedLinks: [],
                    layoutData: undefined,
                });
            }
        },
    };

    ReactDOM.render(createElement(Workspace, props), container);
});
