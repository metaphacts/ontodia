import * as $ from 'jquery';

import { DataProvider, FilterParams } from '../provider';
import { Dictionary, ClassModel, LinkType, ElementModel, LinkModel, LinkCount } from '../model';
import {
    getClassTree,
    getLinkTypes,
    getElementsInfo,
    getLinksInfo,
    getLinksTypesOf,
    getFilteredData,
    getEnrichedElementsInfo,
} from './responseHandler';
import * as Sparql from './sparqlModels';
import {executeSparqlQuery, sparqlExtractLabel, SparqlDataProviderOptions} from "./provider";
import * as _ from 'lodash';

const DEFAULT_PREFIX =
`PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
 PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
 PREFIX wdt: <http://www.wikidata.org/prop/direct/>
 PREFIX wd: <http://www.wikidata.org/entity/>
 PREFIX bds: <http://www.bigdata.com/rdf/search#>
 PREFIX owl:  <http://www.w3.org/2002/07/owl#>` + '\n\n';


export class WikidataDataProvider implements DataProvider {
    constructor(private options: SparqlDataProviderOptions) {}

    classTree(): Promise<ClassModel[]> {
        const query = DEFAULT_PREFIX + `
            SELECT distinct ?class ?label ?parent ?instcount WHERE {
              
              ?class rdfs:label ?label.                            
              ?class wdt:P279 wd:Q35120.     			  
              BIND("" as ?instcount)
            }
        `;
        return executeSparqlQuery<Sparql.TreeResponse>(
            this.options.endpointUrl, query).then(getClassTree);
    }

    linkTypes(): Promise<LinkType[]> {
        const query = DEFAULT_PREFIX + `
            SELECT ?link ?instcount ?label
            WHERE {
                  ?link wdt:P279* wd:Q18616576.
                  ?link rdfs:label ?label.
                  BIND("" as ?instcount)
            }
        `;
        return executeSparqlQuery<Sparql.LinkTypesResponse>(
            this.options.endpointUrl, query).then(getLinkTypes);
    }

    elementInfo(params: { elementIds: string[]; }): Promise<Dictionary<ElementModel>> {
        return Promise.all(params.elementIds.map(element => {
            const iri = escapeIri(element);
            const query = DEFAULT_PREFIX + `
            SELECT ?inst ?class ?label ?propType ?propValue
            WHERE {
                BIND(${iri} as ?inst)
                            
                OPTIONAL {${iri} wdt:P31 ?class . }
                OPTIONAL {${iri} rdfs:label ?label}
                            
                OPTIONAL {${iri} ?propType ?propValue.
                FILTER (isLiteral(?propValue)) }
            }
            `;
            return executeSparqlQuery<Sparql.ElementsInfoResponse>(this.options.endpointUrl, query)
                .then(elementsInfo => getElementsInfo(elementsInfo, [element]))
                .then(elementsInfo => (this.options.imageClassUris && this.options.imageClassUris.length > 0)
                    ? this.enrichedElementsInfo(elementsInfo, this.options.imageClassUris)
                    : elementsInfo);
            }
        )).then(results => {
            return _.assign({}, results);
        }
        );

    }

    private enrichedElementsInfo(
        elementsInfo: Dictionary<ElementModel>,
        types: string[]
    ): Promise<Dictionary<ElementModel>> {
        const ids = Object.keys(elementsInfo).map(escapeIri).map(id => ` ( ${id} )`).join(' ');;
        const typesString = types.map(escapeIri).map(id => ` ( ${id} )`).join(' ');;

        const query = DEFAULT_PREFIX + `
            SELECT ?inst ?linkType ?image
            WHERE {{
                VALUES (?inst) {${ids}}
                VALUES (?linkType) {${typesString}} 
                ?inst ?linkType ?image
            }}
        `;
        return executeSparqlQuery<Sparql.ImageResponse>(this.options.endpointUrl, query)
            .then(imageResponce => getEnrichedElementsInfo(imageResponce, elementsInfo));
    }

    linksInfo(params: {
        elementIds: string[];
        linkTypeIds: string[];
    }): Promise<LinkModel[]> {
        const ids = params.elementIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
        const query = DEFAULT_PREFIX + `
            SELECT ?source ?type ?target
            WHERE {
                ?source ?type ?target.
                VALUES (?source) {${ids}}
                VALUES (?target) {${ids}}                
            }
        `;
        return executeSparqlQuery<Sparql.LinksInfoResponse>(
            this.options.endpointUrl, query).then(getLinksInfo);
    }

    linkTypesOf(params: { elementId: string; }): Promise<LinkCount[]> {
        const query = DEFAULT_PREFIX + `
            SELECT ?link (count(?link) as ?instcount)
            WHERE {{
                ${escapeIri(params.elementId)} ?link ?obj.
                FILTER (IsIRI(?obj)) 
            } UNION {
                [] ?link ${escapeIri(params.elementId)}.
            }} GROUP BY ?link
        `;

        return executeSparqlQuery<Sparql.LinkTypesOfResponse>(this.options.endpointUrl, query).then(getLinksTypesOf);
    };

    filter(params: FilterParams): Promise<Dictionary<ElementModel>> {
        if (params.limit === 0) { params.limit = 100; }

        let refQueryPart = '';
        if (params.refElementId && params.refElementLinkId) {
            refQueryPart =  `{
                ${escapeIri(params.refElementId)} ${escapeIri(params.refElementLinkId)} ?inst .
                } UNION {
                    ?inst ${escapeIri(params.refElementLinkId)} ${escapeIri(params.refElementId)} .
                }`;
        }

        if (params.refElementId && !params.refElementLinkId) {
            refQueryPart = `{
                ${escapeIri(params.refElementId)} ?p ?inst .
                } UNION {
                    ?inst ?p ${escapeIri(params.refElementId)} .
                }`;
        }

        if (!params.refElementId && params.refElementLinkId) {
            throw new Error(`Can't execute refElementLink filter without refElement`);
        }

        const elementTypePart = params.elementTypeId
            ? `?inst wdt:P31 ?instType. ?instType wdt:P279* ${escapeIri(params.elementTypeId)} . ${'\n'}` : '';
        const textSearchPart = params.text ?
            ` ?inst rdfs:label ?searchLabel. 
              SERVICE bds:search {
                     ?searchLabel bds:search "${params.text}" ;  
                                  bds:minRelevance '0.5';
                                  bds:relevance ?score.
              }
            ` : '';
        let query = DEFAULT_PREFIX + `
            SELECT ?inst ?class ?label
            WHERE {
                {
                    SELECT distinct ?inst ?score WHERE {
                        ${elementTypePart}
                        ${refQueryPart}
                        ${textSearchPart}
                    } LIMIT ${params.limit} OFFSET ${params.offset}
                }
                OPTIONAL {?inst wdt:P31 ?foundClass}
                BIND (coalesce(?foundClass, owl:Thing) as ?class)
                OPTIONAL {?inst rdfs:label ?label}                
            }
        `;

        return executeSparqlQuery<Sparql.FilterResponse>(
            this.options.endpointUrl, query).then(getFilteredData);
    };
};

function escapeIri(iri: string) {
    return `<${iri}>`;
}

export default WikidataDataProvider;
