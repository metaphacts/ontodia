import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import {
    Workspace,
    WorkspaceProps,
    SparqlDataProvider,
    // getDefaultTemplate,
    // LEFT_BAR_TEMPLATES,
    // BIG_ICON_TEMPLATE,
    // DEFAULT_ELEMENT_TEMPLATE,
} from '../index';

require('jointjs/css/layout.css');
require('jointjs/css/themes/default.css');

const CUSTOM_LINK_STYLE = {
    attrs: {
        '.connection': {
            stroke: '#3c4260',
            'stroke-width': 2,
        },
        '.marker-source': {
            fill: '#4b4a67',
            stroke: '#4b4a67',
            d: 'M0,3a3,3 0 1,0 6,0a3,3 0 1,0 -6,0',
        },
        '.marker-target': {
            fill: '#4b4a67',
            stroke: '#4b4a67',
            d: 'M5.5,15.499,15.8,21.447,15.8,15.846,25.5,21.447,25.5,9.552,15.8,15.152,15.8,9.552z',
        }
    },
    labels: [{
        attrs: {
            text: {fill: '#3c4260'},
        },
    }],
    connector: {name: 'rounded'},
    router: {name: 'orthogonal'},
};

document.addEventListener('DOMContentLoaded', () => {
    const container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);

    const props: WorkspaceProps & ClassAttributes<Workspace> = {
        onSaveDiagram: workspace => {
            const layout = workspace.getModel().exportLayout();
            console.log(layout);
        },
        viewOptions: {
            elementStyleResolvers: [
                elementModel => {
                    if (elementModel.types.indexOf('http://www.w3.org/2000/01/rdf-schema#Class') !== -1) {
                        return {icon: 'glyphicon glyphicon-certificate'};
                    }
                },
                elementModel => {
                    if (elementModel.types.indexOf('http://www.w3.org/2002/07/owl#Class') !== -1) {
                        return {icon: 'glyphicon glyphicon-certificate'};
                    }
                },
                elementModel => {
                    if (elementModel.types.indexOf('http://www.w3.org/2002/07/owl#ObjectProperty') !== -1) {
                        return {icon: 'glyphicon glyphicon-cog'};
                    }
                },
                elementModel => {
                    if (elementModel.types.indexOf('http://www.w3.org/2002/07/owl#DatatypeProperty') !== -1) {
                        return {color: '#046380'};
                    }
                },
            ],
            linkStyleResolvers: [
                link => {
                    return CUSTOM_LINK_STYLE;
                },
            ],
        },
        ref: workspace => {
            // if you reuse this code you should check for workspace to be null on unmount
            if (workspace) {
                const model = workspace.getModel();
                model.graph.on('action:iriClick', (iri: string) => {
                    console.log(iri);
                });
                model.importLayout({
                    dataProvider: new SparqlDataProvider({
                        endpointUrl: '/sparql-endpoint',
                        imageClassUris: [
                            'http://collection.britishmuseum.org/id/ontology/PX_has_main_representation',
                            'http://xmlns.com/foaf/0.1/img',
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
