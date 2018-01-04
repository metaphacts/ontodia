import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, RDFDataProvider, RdfParsAdapter } from '../index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

const N3Parser: any = require('rdf-parser-n3');
const RdfXmlParser: any = require('rdf-parser-rdfxml');
const JsonLdParser: any = require('rdf-parser-jsonld');

const dataTtl = require<string>('raw-loader!./resources/testData.ttl');
const dataXml = require<string>('raw-loader!./resources/testData.xml');

require('jointjs/css/layout.css');
require('jointjs/css/themes/default.css');

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const model = workspace.getModel();
    model.graph.on('action:iriClick', (iri: string) => {
        window.open(iri);
    });

    const layoutData = tryLoadLayoutFromLocalStorage();
    model.importLayout({
        layoutData,
        validateLinks: true,
        dataProvider: new RDFDataProvider({
            data: [
                {
                    content: dataTtl,
                    type: 'text/turtle',
                },
                {
                    content: dataXml,
                    type: 'application/rdf+xml',
                },
            ],
            dataFetching: false,
            parsers: {
                'text/turtle': new N3Parser(),
                'application/ld+json': new JsonLdParser(),
                'application/rdf+xml': new RdfParsAdapter(new RdfXmlParser()),
            },
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
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
