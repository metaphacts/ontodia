import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import {
    Workspace, WorkspaceProps, SparqlDataProvider, OrganizationTemplate, DefaultElementTemplate, PersonTemplate,
    WikidataSettings, SparqlQueryMethod, PropertySuggestionParams, PropertyScore, formatLocalizedLabel
} from '../index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

const WIKIDATA_PREFIX = 'http://www.wikidata.org/prop/direct/';

let workspace: Workspace;

function getElementLabel(id: string): string {
    const model = workspace.getModel();
    const diagram = workspace.getDiagram();
    const element = model.getElement(id);
    return element ? formatLocalizedLabel(
        element.iri, element.data.label.values, diagram.getLanguage()
    ) : '';
}

function wikidataSuggestProperties(params: PropertySuggestionParams) {
    const idMap: { [id: string]: string } = {};

    const properties = params.properties.map(id => {
        let resultID;
        if (id.startsWith(WIKIDATA_PREFIX)) {
            resultID = id.substr(WIKIDATA_PREFIX.length, id.length);
        } else {
            resultID = id;
        }
        idMap[resultID] = id;
        return resultID;
    });
    const term = params.token.toLowerCase() || getElementLabel(params.elementId);
    const requestBody = {
        threshold: 0.1,
        term,
        instance_properties: properties,
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
        const dictionary: { [id: string]: PropertyScore } = {};
        for (const term of json.data) {
            const propertyIri = idMap[term.id];
            const item = dictionary[propertyIri];

            if (item && item.score > term.value) { continue; }

            dictionary[propertyIri] = {propertyIri, score: term.value};
        }

        Object.keys(idMap).forEach(key => {
            const propertyIri = idMap[key];

            if (dictionary[propertyIri]) { return; }

            dictionary[propertyIri] = {propertyIri, score: 0};
        });

        return dictionary;
    });
}

function onWorkspaceMounted(wspace: Workspace) {
    if (!wspace) { return; }

    workspace = wspace;

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

    const layoutData = tryLoadLayoutFromLocalStorage();
    const dataProvider = new SparqlDataProvider({
        endpointUrl: '/sparql-endpoint',
        imagePropertyUris: [
            'http://www.wikidata.org/prop/direct/P18',
            'http://www.wikidata.org/prop/direct/P154',
        ],
        queryMethod: SparqlQueryMethod.POST,
    }, WikidataSettings);

    workspace.getModel().importLayout({layoutData, dataProvider, validateLinks: true});
}

const props: WorkspaceProps & ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
    onSaveDiagram: workspace => {
        const {layoutData} = workspace.getModel().exportLayout();
        window.location.hash = saveLayoutToLocalStorage(layoutData);
        window.location.reload();
    },
    viewOptions: {
        suggestProperties: wikidataSuggestProperties,
        onIriClick: iri => window.open(iri),
    },
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
