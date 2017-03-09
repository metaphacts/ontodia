import { DataProvider, FilterParams } from '../provider';
import { Dictionary, ClassModel, LinkType, ElementModel, LinkModel, LinkCount, PropertyModel } from '../model';
import {
    getClassTree,
    getClassInfo,
    getPropertyInfo,
    getLinkTypes,
    getElementsInfo,
    getLinksInfo,
    getLinksTypesOf,
    getFilteredData,
    getEnrichedElementsInfo,
    getLinkTypesInfo,
} from './responseHandler';
import {
    ClassBinding, ElementBinding, LinkBinding, PropertyBinding,
    LinkTypeBinding, LinkTypeInfoBinding, ElementImageBinding, SparqlResponse,
} from './sparqlModels';


// this is runtime settings
export interface SparqlDataProviderOptions {
    endpointUrl: string;
    prepareImages?: (elementInfo: Dictionary<ElementModel>) => Promise<Dictionary<string>>;
    imageClassUris?: string[];
}

// this is dataset-schema specific settings
export interface SparqlDataProviderSettings {
    // default prefix to be used in every query
    defaultPrefix: string;
    // property to use as label in schema (classes, properties)
    schemaLabelProperty: string;

    // property to use as instance label todo: make it an array
    dataLabelProperty: string;

    // full-text search settings
    ftsSettings: {ftsPrefix: string, ftsQueryPattern: string}
    // query to retreive class tree. Should return class, label, parent, instcount (optional)
    classTreeQuery: string;

    //link types pattern - what to consider a link on initial fetch
    linkTypesPattern: string;

    // query for fetching all information on element: labels, classes, properties
    elementInfoQuery: string;

    // this should return image URL for ?inst as instance and ?linkType for image property IRI todo: move to runtime settings instead? proxying is runtime stuff
    imageQueryPattern: string;

    // link types of returns possible link types from specified instance with statistics
    linkTypesOfQuery: string;

    // when fetching all links from element, we could specify additional filter
    filterRefElementLinkPattern: string

    // filter by type pattern. One could use transitive type resolution here.
    filterTypePattern: string;

    // how to fetch elements info when fetching data.
    filterElementInfoPattern: string;
}

export const WikidataOptions : SparqlDataProviderSettings = {
    defaultPrefix:
`PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
 PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
 PREFIX wdt: <http://www.wikidata.org/prop/direct/>
 PREFIX wd: <http://www.wikidata.org/entity/>
 PREFIX owl:  <http://www.w3.org/2002/07/owl#>

`,

    schemaLabelProperty: 'rdfs:label',
    dataLabelProperty: 'rdfs:label',

    ftsSettings: {
        ftsPrefix: 'PREFIX bds: <http://www.bigdata.com/rdf/search#>' + '\n',
        ftsQueryPattern: ` 
              ?inst rdfs:label ?searchLabel. 
              SERVICE bds:search {
                     ?searchLabel bds:search "\${text}*" ;
                                  bds:minRelevance '0.5' ;
                                  bds:matchAllTerms 'true' .
              }
              BIND(IF(STRLEN(?strInst) > 33,
                            <http://www.w3.org/2001/XMLSchema#integer>(SUBSTR(?strInst, 33)),
                            10000) as ?score)
            `
    },

    classTreeQuery: `
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
        `,

    // todo: think more, maybe add a limit here?
    linkTypesPattern: '?link wdt:P279* wd:Q18616576.',

    elementInfoQuery: `
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
            } VALUES (?inst) {\${ids}}
        `,
    imageQueryPattern: `?inst ?linkType ?fullImage
                BIND(CONCAT("https://commons.wikimedia.org/w/thumb.php?f=",
                    STRAFTER(STR(?fullImage), "Special:FilePath/"), "&w=200") AS ?image)`,

    linkTypesOfQuery: `
        SELECT ?link (count(distinct ?object) as ?instcount)
        WHERE {
            { \${elementIri} ?link ?object }
            UNION { ?object ?link \${elementIri} }
            #this is to prevent some junk appear on diagram, but can really slow down execution on complex objects
            FILTER ISIRI(?object)
            FILTER exists {?object ?someprop ?someobj}
            FILTER regex(STR(?link), "direct")                
        } GROUP BY ?link
    `,
    filterRefElementLinkPattern: 'FILTER regex(STR(?link), "direct")',
    filterTypePattern: `?inst wdt:P31 ?instType. ?instType wdt:P279* \${elementTypeIri} . ${'\n'}`,
    filterElementInfoPattern: `OPTIONAL {?inst wdt:P31 ?foundClass}
                BIND (coalesce(?foundClass, owl:Thing) as ?class)
                OPTIONAL {?inst rdfs:label ?label}`
    };

export const DBPediaOptions : SparqlDataProviderSettings = {
    defaultPrefix:
        `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
 PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
 PREFIX owl:  <http://www.w3.org/2002/07/owl#> 

`,

    schemaLabelProperty: 'rdfs:label',
    dataLabelProperty: 'rdfs:label',

    ftsSettings: {
        ftsPrefix: 'PREFIX dbo: <http://dbpedia.org/ontology/>\n',
        ftsQueryPattern: ` 
              ?inst rdfs:label ?searchLabel.
              ?searchLabel bif:contains "\${text}".
              ?inst dbo:wikiPageID ?score              
            `
    },

    classTreeQuery: `
            SELECT ?class ?instcount ?label ?parent
            WHERE {
                {
    				?class a rdfs:Class
  				} UNION {
                    ?class a owl:Class
                }
                OPTIONAL { ?class rdfs:label ?label.}
                OPTIONAL {?class rdfs:subClassOf ?parent}
                BIND(0 as ?instcount)
            }
        `,

    // todo: think more, maybe add a limit here?
    linkTypesPattern: `{	?link a rdf:Property
  					} UNION {
                    ?link a owl:ObjectProperty
                }`,

    elementInfoQuery: `
            SELECT ?inst ?class ?label ?propType ?propValue
            WHERE {
                OPTIONAL {?inst rdf:type ?class . }
                OPTIONAL {?inst rdfs:label ?label}
                OPTIONAL {?inst ?propType ?propValue.
                FILTER (isLiteral(?propValue)) }
            } VALUES (?inst) {\${ids}}
        `,
    imageQueryPattern: `?inst ?linkType ?image`,

    linkTypesOfQuery: `
        SELECT ?link (count(distinct ?object) as ?instcount)
        WHERE {
            { \${elementIri} ?link ?object FILTER ISIRI(?object)}
            UNION { ?object ?link \${elementIri} }
            #this is to prevent some junk appear on diagram, but can really slow down execution on complex objects
        } GROUP BY ?link
    `,
    filterRefElementLinkPattern: '',
    filterTypePattern: `?inst rdf:type \${elementTypeIri} . ${'\n'}`,
    filterElementInfoPattern: `OPTIONAL {?inst rdf:type ?foundClass}
                BIND (coalesce(?foundClass, owl:Thing) as ?class)
                OPTIONAL {?inst rdfs:label ?label}`
};

export class SparqlDataProvider implements DataProvider {
    constructor(private options: SparqlDataProviderOptions, private settings: SparqlDataProviderSettings) {}

    classTree(): Promise<ClassModel[]> {
        const query = this.settings.defaultPrefix + this.settings.classTreeQuery;
        return executeSparqlQuery<ClassBinding>(
            this.options.endpointUrl, query).then(getClassTree);
    }

    propertyInfo(params: { propertyIds: string[] }): Promise<Dictionary<PropertyModel>> {
        const ids = params.propertyIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
        const query = this.settings.defaultPrefix + `
            SELECT ?prop ?label
            WHERE {
                ?prop ${this.settings.schemaLabelProperty} ?label.
                VALUES (?prop) {${ids}}.
            }
        `;
        return executeSparqlQuery<PropertyBinding>(
            this.options.endpointUrl, query).then(getPropertyInfo);
    }

    classInfo(params: {classIds: string[]}): Promise<ClassModel[]> {
        const ids = params.classIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
        const query = this.settings.defaultPrefix + `
            SELECT ?class ?label ?instcount
            WHERE {
                ?class ${this.settings.schemaLabelProperty} ?label.
                VALUES (?class) {${ids}}.
                BIND("" as ?instcount)
            }
        `;
        return executeSparqlQuery<ClassBinding>(
            this.options.endpointUrl, query).then(getClassInfo);
    }

    linkTypesInfo(params: {linkTypeIds: string[]}): Promise<LinkType[]> {
        const ids = params.linkTypeIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
        const query = this.settings.defaultPrefix + `
            SELECT ?typeId ?label ?instcount
            WHERE {
                ?typeId ${this.settings.schemaLabelProperty} ?label.
                VALUES (?typeId) {${ids}}.
                BIND("" as ?instcount)      
            }
        `;
        return executeSparqlQuery<LinkTypeInfoBinding>(
            this.options.endpointUrl, query).then(getLinkTypesInfo);
    }

    linkTypes(): Promise<LinkType[]> {
        const query = this.settings.defaultPrefix + `
            SELECT ?link ?instcount ?label
            WHERE {
                  ${this.settings.linkTypesPattern}
                  OPTIONAL {?link ${this.settings.schemaLabelProperty} ?label.}
                  BIND(0 as ?instcount)
            }
        `;
        return executeSparqlQuery<LinkTypeBinding>(
            this.options.endpointUrl, query).then(getLinkTypes);
    }

    elementInfo(params: { elementIds: string[]; }): Promise<Dictionary<ElementModel>> {
        const ids = params.elementIds.map(escapeIri).map(id => ` (${id})`).join(' ');
        const query = this.settings.defaultPrefix + this.settings.elementInfoQuery.replace(new RegExp('\\${ids}', 'g'), ids);
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

        const query = this.settings.defaultPrefix + `
            SELECT ?inst ?linkType ?image
            WHERE {{
                VALUES (?inst) {${ids}}
                VALUES (?linkType) {${typesString}} 
                ${this.settings.imageQueryPattern}
            }}
        `;
        return executeSparqlQuery<ElementImageBinding>(this.options.endpointUrl, query)
            .then(imageResponse => getEnrichedElementsInfo(imageResponse, elementsInfo)).catch((err) => {
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
        const query = this.settings.defaultPrefix + `
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
        const elementIri = escapeIri(params.elementId);
        const query = this.settings.defaultPrefix + this.settings.linkTypesOfQuery.replace(new RegExp('\\${elementIri}', 'g'), elementIri);
        return executeSparqlQuery<LinkTypeBinding>(this.options.endpointUrl, query).then(getLinksTypesOf);
    };

    filter(params: FilterParams): Promise<Dictionary<ElementModel>> {
        if (params.limit === 0) { params.limit = 100; }

        let refQueryPart = '';
        // link to element with specified link type
        if (params.refElementId && params.refElementLinkId) {
            const refElementIRI = escapeIri(params.refElementId);
            const refElementLinkIRI = escapeIri(params.refElementLinkId);
            refQueryPart =  `{
                ${refElementIRI} ${refElementLinkIRI} ?inst .
                } UNION {
                    ?inst ${refElementLinkIRI} ${refElementIRI} .
                }`;
        }

        // all links to current element
        if (params.refElementId && !params.refElementLinkId) {
            const refElementIRI = escapeIri(params.refElementId);
            refQueryPart = `{
                ${refElementIRI} ?link ?inst . 
                } UNION {
                    ?inst ?link ${refElementIRI} .
                }
                ${this.settings.filterRefElementLinkPattern}
                `;
        }

        if (!params.refElementId && params.refElementLinkId) {
            throw new Error(`Can't execute refElementLink filter without refElement`);
        }

        var elementTypePart: string;
        if (params.elementTypeId) {
            const elementTypeIri = escapeIri(params.elementTypeId);
            elementTypePart = this.settings.filterTypePattern.replace(new RegExp('\\${elementTypeIri}', 'g'), elementTypeIri);
        } else {
            elementTypePart = '';
        }

        var textSearchPart: string;
        if (params.text) {
            const text = params.text;
            textSearchPart = this.settings.ftsSettings.ftsQueryPattern.replace(new RegExp('\\${text}', 'g'), text);
        } else {
            textSearchPart = '';
        }

        let query = `${this.settings.defaultPrefix}
            ${this.settings.ftsSettings.ftsPrefix}
            
            SELECT ?inst ?class ?label
            WHERE {
                {
                    SELECT DISTINCT ?inst ?score WHERE {
                        ${elementTypePart}
                        ${refQueryPart}
                        ${textSearchPart}
                        FILTER ISIRI(?inst)
                        BIND(STR(?inst) as ?strInst)
                        FILTER exists {?inst ?someprop ?someobj}
                    } ORDER BY ?score LIMIT ${params.limit} OFFSET ${params.offset}
                }
                ${this.settings.filterElementInfoPattern}
            } ORDER BY ?score
        `;

        return executeSparqlQuery<ElementBinding>(
            this.options.endpointUrl, query).then(getFilteredData);
    };
}

export function executeSparqlQueryPOST<Binding>(endpoint: string, query: string) {
    return new Promise<SparqlResponse<Binding>>((resolve, reject) => {
        $.ajax({
            type: 'POST',
            url: endpoint,
            contentType: 'application/sparql-query',
            headers: {
                Accept: 'application/json, text/turtle',
            },
            data: query,
            success: result => resolve(result),
            error: (jqXHR, statusText, error) => reject(error || jqXHR),
        });
    });
}

export function executeSparqlQuery<Binding>(endpoint: string, query: string) {
    return executeSparqlQueryGET<Binding>(endpoint, query);
}

export function executeSparqlQueryGET<Binding>(endpoint: string, query: string) : Promise<SparqlResponse<Binding>> {
    return fetch(endpoint + '?' +
            'query=' + encodeURIComponent(query) + '&' +
            //'default-graph-uri=' + self.defaultGraphURI + '&' +
            'format=' + encodeURIComponent('application/sparql-results+json') + '&',
            //'with-imports=' + 'true',
            {
            method: 'GET',
            credentials: 'same-origin',
            mode: 'cors',
            cache: 'default',
            /*headers: {
                'Accept': 'application/sparql-results+json'
            },*/
        }).then((response): Promise<SparqlResponse<Binding>> => {
            if (response.ok) {
                return response.json();
            } else {
                var error = new Error(response.statusText);
                (<any>error).response = response;
                throw error;
            }
        });
}


function escapeIri(iri: string) {
    return `<${iri}>`;
}

export default SparqlDataProvider;
