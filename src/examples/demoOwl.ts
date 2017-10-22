import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, DemoDataProvider, LinkTemplate  } from '../index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

require('jointjs/css/layout.css');
require('jointjs/css/themes/default.css');

const CUSTOM_LINK_TEMPLATE_SUBCLASSOF: LinkTemplate = {
    renderLink: () => ({
        connection: {
            stroke: 'black',
            'stroke-width': 2,
            'stroke-dasharray':'5,5',
        },
        label: {
            attrs: {text: {fill: 'black'}},
        },
    }),
};
const CUSTOM_LINK_TEMPLATE_DOMAIN: LinkTemplate = {
    renderLink: () => ({
        connection: {
            stroke: 'black',
            'stroke-width': 2,
        },
        label: {
            attrs: {text: {fill: 'black'}},
        },
    }),
};
function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const model = workspace.getModel();
    model.graph.on('action:iriClick', (iri: string) => console.log(iri));

    const layoutData = tryLoadLayoutFromLocalStorage();
    model.importLayout({layoutData, dataProvider: new DemoDataProvider(), validateLinks: true});
}

const props: WorkspaceProps & ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
    onSaveDiagram: workspace => {
        const {layoutData} = workspace.getModel().exportLayout();
        window.location.hash = saveLayoutToLocalStorage(layoutData);
        window.location.reload();
    },
    viewOptions: {
        linkTemplateResolvers: [
            type => {
                if ( type.indexOf('subClassOf') !== -1 )
                    return CUSTOM_LINK_TEMPLATE_SUBCLASSOF;
                else if ( type.indexOf('domain') !== -1 || type.indexOf('range') !== -1)
                    return CUSTOM_LINK_TEMPLATE_DOMAIN;
                else 
                {
                    return undefined;
                }
            }
        ],
        
        /* typeStyleResolvers: [
            types => {
                if (types.indexOf('http://www.w3.org/2002/07/owl#Class') !== -1 ||
                    types.indexOf('http://www.w3.org/2000/01/rdf-schema#Class') !== -1
                ) {
                    return {color: '#eaac77', icon: 'ontodia-class-icon'};
                } else if (types.indexOf('http://www.w3.org/2002/07/owl#ObjectProperty') !== -1) {
                    return {color: '#34c7f3', icon: 'ontodia-object-property-icon'};
                } else if (types.indexOf('http://www.w3.org/2002/07/owl#DatatypeProperty') !== -1) {
                    return {color: '#34c7f3', icon: 'ontodia-datatype-property-icon'};
                } else if (types.indexOf('http://xmlns.com/foaf/0.1/Person') !== -1) {
                    return {color: '#eb7777', icon: 'ontodia-person-icon'};
                } else if (
                    types.indexOf('http://schema.org/Organization') !== -1 ||
                    types.indexOf('http://dbpedia.org/ontology/Organisation') !== -1 ||
                    types.indexOf('http://xmlns.com/foaf/0.1/Organization') !== -1
                ) {
                    return {color: '#77ca98', icon: 'ontodia-organization-icon'};
                } else {
                    return undefined;
                }
            },
        ] */
    },
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));

