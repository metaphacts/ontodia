import { DataProvider, FilterParams } from '../provider';
import { Dictionary, ClassModel, LinkType, ElementModel, LinkModel, LinkCount } from '../model';
import {
    getClassTree,
    getClassInfo,
    getLinkTypes,
    getElementsInfo,
    getLinksInfo,
    getLinksTypesOf,
    getFilteredData,
    getEnrichedElementsInfo,
    getLinkTypesInfo,
} from './responseHandler';
import {
    ClassBinding, ElementBinding, LinkBinding,
    LinkTypeBinding, LinkTypeInfoBinding, ElementImageBinding,
} from './sparqlModels';
import {executeSparqlQuery, SparqlDataProviderOptions} from './provider';
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
              { ?class wdt:P279 wd:Q35120. }
                UNION 
              { ?parent wdt:P279 wd:Q35120.
                ?class wdt:P279 ?parent. }
                UNION 
              { ?parent wdt:P279/wdt:P279 wd:Q35120.
                ?class wdt:P279 ?parent. }
              BIND("" as ?instcount)
            }
        `;
        return executeSparqlQuery<ClassBinding>(
            this.options.endpointUrl, query).then(getClassTree);
    }

    classInfo(params: {classIds: string[]}): Promise<ClassModel[]> {
        const ids = params.classIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
        const query = DEFAULT_PREFIX + `
            SELECT ?class ?label ?instcount
            WHERE {
                ?class rdfs:label ?label.
                VALUES (?class) {${ids}}.
                BIND("" as ?instcount)
            }
        `;
        return executeSparqlQuery<ClassBinding>(
            this.options.endpointUrl, query).then(getClassInfo);
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
        return executeSparqlQuery<LinkTypeBinding>(
            this.options.endpointUrl, query).then(getLinkTypes);
    }

    linkTypesInfo(params: {linkTypeIds: string[]}): Promise<LinkType[]> {
        const ids = params.linkTypeIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
        const query = DEFAULT_PREFIX + `
            SELECT ?typeId ?label ?instcount
            WHERE {
                ?typeId rdfs:label ?label.
                VALUES (?typeId) {${ids}}.
                BIND("" as ?instcount)      
            }
        `;
        return executeSparqlQuery<LinkTypeInfoBinding>(
            this.options.endpointUrl, query).then(getLinkTypesInfo);
    }

    elementInfo(params: { elementIds: string[]; }): Promise<Dictionary<ElementModel>> {
        const ids = params.elementIds.map(escapeIri).map(id => ` (${id})`).join(' ');
        const query = DEFAULT_PREFIX + `
            SELECT ?inst ?class ?label ?propType ?propValue
            WHERE {
                OPTIONAL {
                    { ?inst wdt:P31 ?class } UNION
                    { ?inst wdt:P31 ?realClass .
                        ?realClass wdt:P279 | wdt:P279/wdt:P279 ?class }
                }
                OPTIONAL {?inst rdfs:label ?label}
                OPTIONAL {
                    ?inst ?propType ?propValue .
                    FILTER (isLiteral(?propValue))
                }
            } VALUES (?inst) {${ids}}
        `;
        return executeSparqlQuery<ElementBinding>(this.options.endpointUrl, query)
            .then(elementsInfo => getElementsInfo(elementsInfo, params.elementIds))
            .then(elementModels => {
                if (this.options.prepareImages) {
                    return this.prepareElementsImage(elementModels);
                } else if (this.options.imageClassUris && this.options.imageClassUris.length) {
                    return this.enrichedElementsInfo(elementModels, this.options.imageClassUris);
                } else {
                    return elementModels;
                }
            });
    }

    private enrichedElementsInfo(
        elementsInfo: Dictionary<ElementModel>,
        types: string[]
    ): Promise<Dictionary<ElementModel>> {
        const ids = Object.keys(elementsInfo).map(escapeIri).map(id => ` ( ${id} )`).join(' ');
        const typesString = types.map(escapeIri).map(id => ` ( ${id} )`).join(' ');

        const query = DEFAULT_PREFIX + `
            SELECT ?inst ?linkType ?image
            WHERE {{
                VALUES (?inst) {${ids}}
                VALUES (?linkType) {${typesString}} 
                ?inst ?linkType ?fullImage
                BIND(CONCAT("https://commons.wikimedia.org/w/thumb.php?f=",
                    STRAFTER(STR(?fullImage), "Special:FilePath/"), "&w=200") AS ?image)
            }}
        `;
        return executeSparqlQuery<ElementImageBinding>(this.options.endpointUrl, query)
            .then(imageResponce => getEnrichedElementsInfo(imageResponce, elementsInfo)).catch((err) => {
                console.log(err);
                return elementsInfo;
            });
    }

    private prepareElementsImage(
        elementsInfo: Dictionary<ElementModel>
    ): Promise<Dictionary<ElementModel>> {
        return this.options.prepareImages(elementsInfo).then(images => {
            for (const key in images) {
                if (images.hasOwnProperty(key) && elementsInfo[key]) {
                    elementsInfo[key].image = images[key];
                }
            }
            return elementsInfo;
        });
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
        return executeSparqlQuery<LinkBinding>(
            this.options.endpointUrl, query).then(getLinksInfo);
    }

    linkTypesOf(params: { elementId: string; }): Promise<LinkCount[]> {
        const query = DEFAULT_PREFIX + `
            SELECT ?link (count(?link) as ?instcount)
            WHERE {{
                ${escapeIri(params.elementId)} ?link ?obj.
            } UNION {
                [] ?link ${escapeIri(params.elementId)}.
            }
            FILTER regex(STR(?link), "direct") 
            } GROUP BY ?link
        `;

        return executeSparqlQuery<LinkTypeBinding>(this.options.endpointUrl, query).then(getLinksTypesOf);
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
                ${escapeIri(params.refElementId)} ?link ?inst . 
                } UNION {
                    ?inst ?link ${escapeIri(params.refElementId)} .
                }
                FILTER regex(STR(?link), "direct") 
                `;
        }

        if (!params.refElementId && params.refElementLinkId) {
            throw new Error(`Can't execute refElementLink filter without refElement`);
        }

        const elementTypePart = params.elementTypeId
            ? `?inst wdt:P31 ?instType. ?instType wdt:P279* ${escapeIri(params.elementTypeId)} . ${'\n'}` : '';
        const textSearchPart = params.text ?
            ` ?inst rdfs:label ?searchLabel. 
              SERVICE bds:search {
                     ?searchLabel bds:search "${params.text}*" ;
                                  bds:minRelevance '0.5' ;
                                  bds:matchAllTerms 'true' .
              }
            ` : '';
        let query = DEFAULT_PREFIX + `
            SELECT ?inst ?class ?label
            WHERE {
                {
                    SELECT DISTINCT ?inst ?score WHERE {
                        ${elementTypePart}
                        ${refQueryPart}
                        ${textSearchPart}
                        BIND(<http://www.w3.org/2001/XMLSchema#integer>(SUBSTR(STR(?inst), 33)) AS ?score)
                    } ORDER BY ?score LIMIT ${params.limit} OFFSET ${params.offset}
                }
                OPTIONAL {?inst wdt:P31 ?foundClass}
                BIND (coalesce(?foundClass, owl:Thing) as ?class)
                OPTIONAL {?inst rdfs:label ?label}
            } ORDER BY ?score
        `;

        return executeSparqlQuery<ElementBinding>(
            this.options.endpointUrl, query).then(getFilteredData);
    };
};

function escapeIri(iri: string) {
    return `<${iri}>`;
}

export default WikidataDataProvider;
