import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, DemoDataProvider } from '../index';

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
            elementColor: elementModel => {
                if (elementModel.types[0] === 'http://www.w3.org/2002/07/owl#DatatypeProperty') {
                    return '#046380';
                }
            },
            customLinkStyle: link => {
                return CUSTOM_LINK_STYLE;
            },
        },
        ref: workspace => {
            // if you reuse this code you should check for workspace to be null on unmount
            if (workspace) {
                const model = workspace.getModel();
                model.graph.on('action:iriClick', (iri: string) => {
                    console.log(iri);
                });
                model.importLayout({
                    dataProvider: new DemoDataProvider(),
                    preloadedElements: {},
                    preloadedLinks: [],
                    layoutData: undefined,
                });
            }
        },
    };

    ReactDOM.render(createElement(Workspace, props), container);
});
