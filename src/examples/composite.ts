import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import {
    Workspace,
    WorkspaceProps,
    RDFDataProvider,
    CompositeDataProvider,
    SparqlDataProvider,
    OWLStatsSettings,
    SparqlQueryMethod,
    DBPediaSettings,
    OrganizationTemplate,
    DefaultElementTemplate,
    PersonTemplate,
    WikidataSettings,
    LinkModel,
 } from '../index';

 const N3Parser: any = require('rdf-parser-n3');
 const RdfXmlParser: any = require('rdf-parser-rdfxml');
 const JsonLdParser: any = require('rdf-parser-jsonld');

import {onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage} from './common';
import {LinkBinding} from '../ontodia/data/sparql/sparqlModels';
import {getLinksInfo} from '../ontodia/data/sparql/responseHandler';

const data = require<string>('raw-loader!./resources/testData.ttl');

require('jointjs/css/layout.css');
require('jointjs/css/themes/default.css');

class TransformingDataProvider extends SparqlDataProvider {

    createRefQueryPart(params: { elementId: string; linkId?: string; direction?: 'in' | 'out'}): string {
        let refQueryPart = '';
        const refElementIRI = `<${params.elementId}>`;
        const refElementLinkIRI = params.linkId ? `<${params.linkId}>` : undefined;

        //  link to element with specified link type
        // if direction is not specified, provide both patterns and union them
        // FILTER ISIRI is used to prevent blank nodes appearing in results
        if (params.elementId && params.linkId) {
            refQueryPart += !params.direction || params.direction === 'out' ? `
                { ${refElementIRI} ${refElementLinkIRI} ?inst . FILTER ISIRI(?inst)}
                UNION
                { ${refElementIRI} ${refElementLinkIRI} ?literalId.                     
    		        ?property <http://wikiba.se/ontology#directClaim> ${refElementLinkIRI}.
    		        ?property wdt:P1630|wdt:P1921 ?template.  	  	
                    BIND(IRI(REPLACE(?template, "\\\\$1", ?literalId)) as ?inst)
                }
                ` : '';
            refQueryPart += !params.direction ? ' UNION ' : '';
            refQueryPart += !params.direction ||
                params.direction === 'in' ?
                    `{  ?inst ${refElementLinkIRI} ${refElementIRI} . FILTER ISIRI(?inst)}` : '';
        }

        // all links to current element
        if (params.elementId && !params.linkId) {
            refQueryPart += !params.direction || params.direction === 'out' ? `
                { ${refElementIRI} ?link ?inst . FILTER ISIRI(?inst)}
                UNION
                { ${refElementIRI} ?link ?literalId.                     
    		        ?property <http://wikiba.se/ontology#directClaim> ?link.
    		        ?property wdt:P1630|wdt:P1921 ?template.  	  	
                    BIND(IRI(REPLACE(?template, "\\\\$1", ?literalId)) as ?inst)
                }
                ` : '';
            refQueryPart += !params.direction ? ' UNION ' : '';
            refQueryPart += !params.direction ||
                params.direction === 'in' ?
                    `{  ?inst ?link ${refElementIRI} . FILTER ISIRI(?inst)}` : '';
        }
        return refQueryPart;
    }

    linksInfo(params: {
        elementIds: string[];
        linkTypeIds: string[];
    }): Promise<LinkModel[]> {
        const ids = params.elementIds.map(uri => `<${uri}>`).map(id => ` ( ${id} )`).join(' ');
        const query = `PREFIX wdt: <http://www.wikidata.org/prop/direct/>

            SELECT ?source ?type ?target
            WHERE {
                VALUES (?source) {${ids}}
                VALUES (?target) {${ids}}
                {?source ?type ?target.}
                UNION
                {
                    ?source ?type ?literalId. 
                    FILTER(ISLITERAL(?literalId))                    
    		        ?property <http://wikiba.se/ontology#directClaim> ?type.
    		        ?property wdt:P1630|wdt:P1921 ?template.  	  	
                    BIND(IRI(REPLACE(?template, "\\\\$1", ?literalId)) as ?createdTarget)
                    BIND(?createdTarget as ?target)
                    FILTER (BOUND(?createdTarget))
                }                                
            }
        `;
        return this.executeSparqlQuery<LinkBinding>(query).then(getLinksInfo);
    }
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
    });

    const rdfDataProvider = new RDFDataProvider({
        data: [
            {
                content: data,
                type: 'text/turtle',
            },
        ],
        dataFetching: false,
        parsers: {
            'text/turtle': new N3Parser(),
            'application/rdf+xml': new RdfXmlParser(),
            'application/ld+json': new JsonLdParser(),
        },
    });

    const sparqlDataProvider = new TransformingDataProvider({
        endpointUrl: '/sparql-endpoint',
        imagePropertyUris: [
            'http://www.wikidata.org/prop/direct/P18',
            'http://www.wikidata.org/prop/direct/P154',
        ],
        queryMethod: SparqlQueryMethod.POST,
    }, {...WikidataSettings, ...{
        linkTypesOfQuery: `
        SELECT ?link (count(distinct ?outObject) as ?outCount) (count(distinct ?inObject) as ?inCount)
        WHERE {
            
            { \${elementIri} ?link ?outObject .
              # this is to prevent some junk appear on diagram,
              # but can really slow down execution on complex objects
              FILTER ISIRI(?outObject)
              FILTER EXISTS { ?outObject ?someprop ?someobj }
            }
            UNION
            { ?inObject ?link \${elementIri} .
              FILTER ISIRI(?inObject)
              FILTER EXISTS { ?inObject ?someprop ?someobj }
            }
            UNION 
            {
              $\{elementIri} ?link ?outObject.
              ?property <http://wikiba.se/ontology#directClaim> ?link.
            }
            FILTER regex(STR(?link), "direct")
        } GROUP BY ?link
    `,
        filterAdditionalRestriction: `FILTER ISIRI(?inst)
                        BIND(STR(?inst) as ?strInst)
`,
    }});

    const layoutData = tryLoadLayoutFromLocalStorage();
    model.importLayout({
        layoutData,
        validateLinks: true,
        dataProvider: new CompositeDataProvider([
            { name: 'SparQL Data Provider', dataProvider: sparqlDataProvider },
            { name: 'RDF Data Provider', dataProvider: rdfDataProvider },
        ], {
            mergeMode: 'sequentialFetching',
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
