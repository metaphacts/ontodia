import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import {
    Workspace, WorkspaceProps, RDFDataProvider, GroupTemplate,
    Element, ElementTypeIri, LinkTypeIri,
} from '../index';

import { ExampleMetadataApi } from './resources/exampleMetadataApi';
import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

const N3Parser: any = require('rdf-parser-n3');
const RdfXmlParser: any = require('rdf-parser-rdfxml');
const JsonLdParser: any = require('rdf-parser-jsonld');

const data = require<string>('./resources/logical.ttl');

namespace logic {
    export const NAMESPACE = 'test://logic/schema#';
    export const Conjunction = NAMESPACE + 'Conjunction' as ElementTypeIri;
    export const Negation = NAMESPACE + 'Negation' as ElementTypeIri;
    export const Existential = NAMESPACE + 'Existential' as ElementTypeIri;
    export const hasExpression = NAMESPACE + 'hasExpression' as LinkTypeIri;
    export const conjunct = NAMESPACE + 'conjunct' as LinkTypeIri;
    export const negate = NAMESPACE + 'negate' as LinkTypeIri;
}

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const dataProvider = new RDFDataProvider({
        data: [
            {
                content: data,
                type: 'text/turtle',
                fileName: 'testData.ttl',
            },
        ],
        acceptBlankNodes: true,
        dataFetching: false,
        parsers: {
            'application/rdf+xml': new RdfXmlParser(),
            'application/ld+json': new JsonLdParser(),
            'text/turtle': new N3Parser(),
        },
    });

    const tryExpand = (element: Element) => {
        const types = element.data.types;
        const shouldBeExpanded = (
            types.indexOf(logic.Conjunction) >= 0 ||
            types.indexOf(logic.Negation) >= 0
        );
        if (shouldBeExpanded) {
            element.setExpanded(true);
        }
    };

    workspace.getEditor().events.on('addElements', e => {
        e.elements.forEach(tryExpand);
    });
    workspace.getModel().events.on('elementEvent', e => {
        if (e.data.changeData) {
            tryExpand(e.data.changeData.source);
        }
    });

    const diagram = tryLoadLayoutFromLocalStorage();
    workspace.getModel().importLayout({
        diagram,
        validateLinks: true,
        dataProvider,
    });
}

const props: WorkspaceProps & ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
    onSaveDiagram: workspace => {
        const diagram = workspace.getModel().exportLayout();
        window.location.hash = saveLayoutToLocalStorage(diagram);
        window.location.reload();
    },
    onPersistChanges: workspace => {
        const state = workspace.getEditor().authoringState;
        console.log('Authoring state:', state);
    },
    metadataApi: new ExampleMetadataApi(),
    viewOptions: {
        onIriClick: iri => window.open(iri),
        groupBy: [
            {linkType: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', linkDirection: 'in'},
            {linkType: logic.conjunct, linkDirection: 'out'},
            {linkType: logic.negate, linkDirection: 'out'},
        ],
        templatesResolvers: [
            types => {
                const useGroup = (
                    types.indexOf(logic.Conjunction) >= 0 ||
                    types.indexOf(logic.Negation) >= 0
                );
                return useGroup ? GroupTemplate : undefined;
            }
        ],
    }
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
