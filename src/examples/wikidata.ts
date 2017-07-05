import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';
import 'whatwg-fetch';

import {
    Workspace, WorkspaceProps, SparqlDataProvider, OrganizationTemplate, DefaultElementTemplate, PersonTemplate,
    WikidataSettings, SparqlQueryMethod,
} from '../index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

require('jointjs/css/layout.css');
require('jointjs/css/themes/default.css');

const WIKIDATA_PREFIX = 'http://www.wikidata.org/prop/direct/';

function foreignFilter(key: string, alternatives: string[]) {
    const idMap: { [id: string]: string } = {};

    alternatives = alternatives.map(id => {
        let resultID;
        if (id.startsWith(WIKIDATA_PREFIX)) {
            resultID = id.substr(WIKIDATA_PREFIX.length, id.length);
        } else {
            resultID = id;
        }
        idMap[resultID] = id;
        return resultID;
    });
    const requestBody = {
        threshold: 0.1,
        term: key.toLowerCase(),
        instance_properties: alternatives,
    };
    return fetch('/wikidata-prop-suggest', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        credentials: 'same-origin',
        mode: 'cors',
        cache: 'default',
    }).then((response) => {
        if (response.ok) {
            return response.json();
        } else {
            const error = new Error(response.statusText);
            (error as any).response = response;
            throw error;
        }
    }).then(json => {
        const dictionary: { [id: string]: { id: string; value: number; } } = {};
        for (const term of json.data) {
            dictionary[idMap[term.id]] =
                (!dictionary[idMap[term.id]] || dictionary[idMap[term.id]] < term ? term : dictionary[idMap[term.id]]);
        }
        return dictionary;
    });
}

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const diagram = workspace.getDiagram();
    diagram.registerTemplateResolver(types => {
        // using default template for country as a temporary solution
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
    viewOptions: {
        connectionsMenuFilterCallBack: foreignFilter,
    },
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
