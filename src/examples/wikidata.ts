import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import {
    Workspace, WorkspaceProps, SparqlDataProvider, OrganizationTemplate, DefaultElementTemplate, PersonTemplate,
    WikidataSettings, SparqlQueryMethod
} from '../index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

require('jointjs/css/layout.css');
require('jointjs/css/themes/default.css');

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const diagram = workspace.getDiagram();
    diagram.registerTemplateResolver(types => {
        //using default template for country as a temporary solution
        if (types.indexOf('http://www.wikidata.org/entity/Q6256') !== -1) {
            return DefaultElementTemplate;
        } else if (types.indexOf('http://www.wikidata.org/entity/Q43229') !== -1) {
            return OrganizationTemplate;
        } else if (types.indexOf('http://www.wikidata.org/entity/Q5') !== -1) {
            return PersonTemplate;
        } else {
            return undefined;
        }
    });
    diagram.registerElementStyleResolver(types => {
        if (types.indexOf('http://www.wikidata.org/entity/Q6256') !== -1) {
            return {color: '#77ca98', icon: 'ontodia-country-icon'};
        } else if (types.indexOf('http://www.wikidata.org/entity/Q43229') !== -1) {
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

    const layoutData = tryLoadLayoutFromLocalStorage();
    const dataProvider = new SparqlDataProvider({
        endpointUrl: '/sparql-endpoint',
        imagePropertyUris: [
            'http://www.wikidata.org/prop/direct/P18',
            'http://www.wikidata.org/prop/direct/P154',
        ],
        queryMethod: SparqlQueryMethod.POST,
    }, WikidataSettings);

    model.importLayout({layoutData, dataProvider, validateLinks: true});
}

const props: WorkspaceProps & ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
    onSaveDiagram: workspace => {
        const {layoutData} = workspace.getModel().exportLayout();
        window.location.hash = saveLayoutToLocalStorage(layoutData);
        window.location.reload();
    },
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
