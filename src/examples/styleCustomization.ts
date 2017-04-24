import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, SparqlDataProvider, LinkStyle } from '../index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

require('jointjs/css/layout.css');
require('jointjs/css/themes/default.css');

const CUSTOM_LINK_STYLE: LinkStyle = {
    connection: {
        stroke: '#3c4260',
        'stroke-width': 2,
    },
    markerSource: {
        fill: '#4b4a67',
        stroke: '#4b4a67',
        d: 'M0,3a3,3 0 1,0 6,0a3,3 0 1,0 -6,0',
        width: 6,
        height: 6,
    },
    markerTarget: {
        fill: '#4b4a67',
        stroke: '#4b4a67',
        d: 'm 20,5.88 -10.3,-5.95 0,5.6 -9.7,-5.6 0,11.82 9.7,-5.53 0,5.6 z',
        width: 20,
        height: 12,
    },
    label: {
        attrs: {
            text: {fill: '#3c4260'},
        },
    },
    connector: {name: 'rounded'},
    router: {name: 'orthogonal'},
};

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const model = workspace.getModel();
    model.graph.on('action:iriClick', (iri: string) => {
        console.log(iri);
    });

    const layoutData = tryLoadLayoutFromLocalStorage();
    model.importLayout({
        layoutData,
        dataProvider: new SparqlDataProvider({
            endpointUrl: '/sparql-endpoint',
            imagePropertyUris: [
                'http://collection.britishmuseum.org/id/ontology/PX_has_main_representation',
                'http://xmlns.com/foaf/0.1/img',
            ],
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
        typeStyleResolvers: [
            types => {
                if (types.indexOf('http://www.w3.org/2000/01/rdf-schema#Class') !== -1) {
                    return {icon: 'glyphicon glyphicon-certificate'};
                } else if (types.indexOf('http://www.w3.org/2002/07/owl#Class') !== -1) {
                    return {icon: 'glyphicon glyphicon-certificate'};
                } else if (types.indexOf('http://www.w3.org/2002/07/owl#ObjectProperty') !== -1) {
                    return {icon: 'glyphicon glyphicon-cog'};
                } else if (types.indexOf('http://www.w3.org/2002/07/owl#DatatypeProperty') !== -1) {
                    return {color: '#046380'};
                } else {
                    return undefined;
                }
            },
        ],
        linkStyleResolvers: [
            type => {
                return link => CUSTOM_LINK_STYLE;
            },
        ],
    },
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
