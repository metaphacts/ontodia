import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, RDFDataProvider } from '../index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

const N3Parser: any = require('rdf-parser-n3');
const RdfXmlParser: any = require('rdf-parser-rdfxml');
const JsonLdParser: any = require('rdf-parser-jsonld');

const data = require<string>('raw-loader!./resources/testData.ttl');

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const dataProvider = new RDFDataProvider({
        data: [
            {
                content: data,
                type: 'text/turtle',
                fileName: 'testData.ttl'
            },
        ],
        acceptBlankNodes: false,
        dataFetching: false,
        parsers: {
            'application/rdf+xml': new RdfXmlParser(),
            'application/ld+json': new JsonLdParser(),
            'text/turtle': new N3Parser(),
        },
    });

    const layoutData = tryLoadLayoutFromLocalStorage();
    workspace.getModel().importLayout({
        layoutData,
        validateLinks: true,
        dataProvider,
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
        onIriClick: iri => window.open(iri),
    }
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
