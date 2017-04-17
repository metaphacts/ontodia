import 'whatwg-fetch';
import * as N3 from 'n3';
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
    LinkCountBinding, LinkTypeInfoBinding, ElementImageBinding, SparqlResponse, Triple, RdfNode,
} from './sparqlModels';
import { SparqlDataProviderSettings, OWLStatsSettings } from './sparqlDataProviderSettings';

export enum SparqlQueryMethod { GET = 1, POST }

/**
 * Runtime settings of SPARQL data provider
 */
export interface SparqlDataProviderOptions {

    /**
     *  sparql endpoint URL to use
     */
    endpointUrl: string;

    // there are two options for fetching images: specify imagePropertyUris
    // to use as image properties or specify a function to fetch image URLs

    /**
     * properties to use as image URLs
     */
    imagePropertyUris?: string[];

    /**
     * you can specify prepareImages function to extract image URL from element model
     */
    prepareImages?: (elementInfo: Dictionary<ElementModel>) => Promise<Dictionary<string>>;

    /**
     * wether to use GET (more compatible (Virtuozo), more error-prone due to large request URLs)
     * or POST(less compatible, better on large data sets)
     */
    queryMethod?: SparqlQueryMethod;

    /*
     * what property to use as instance labels. This will override dataLabelProperty from settings
     */
    labelProperty?: string;
}

export class SparqlDataProvider implements DataProvider {
    dataLabelProperty: string;
    constructor(
        private options: SparqlDataProviderOptions,
        private settings: SparqlDataProviderSettings = OWLStatsSettings
    ) {
        this.dataLabelProperty = options.labelProperty ? options.labelProperty : settings.dataLabelProperty;
    }

    classTree(): Promise<ClassModel[]> {
        const query = this.settings.defaultPrefix + this.settings.classTreeQuery;
        return this.executeSparqlQuery<ClassBinding>(query).then(getClassTree);
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
        return this.executeSparqlQuery<PropertyBinding>(query).then(getPropertyInfo);
    }

    classInfo(params: { classIds: string[] }): Promise<ClassModel[]> {
        const ids = params.classIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
        const query = this.settings.defaultPrefix + `
            SELECT ?class ?label ?instcount
            WHERE {
                ?class ${this.settings.schemaLabelProperty} ?label.
                VALUES (?class) {${ids}}.
                BIND("" as ?instcount)
            }
        `;
        return this.executeSparqlQuery<ClassBinding>(query).then(getClassInfo);
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
        return this.executeSparqlQuery<LinkTypeInfoBinding>(query).then(getLinkTypesInfo);
    }

    linkTypes(): Promise<LinkType[]> {
        const query = this.settings.defaultPrefix + `
            SELECT ?link ?instcount ?label
            WHERE {
                  ${this.settings.linkTypesPattern}
                  OPTIONAL {?link ${this.settings.schemaLabelProperty} ?label.}
            }
        `;
        return this.executeSparqlQuery<LinkTypeInfoBinding>(query).then(getLinkTypes);
    }

    elementInfo(params: { elementIds: string[]; }): Promise<Dictionary<ElementModel>> {
        const ids = params.elementIds.map(escapeIri).map(id => ` (${id})`).join(' ');
        const query = this.settings.defaultPrefix
            + resolveTemplate(this.settings.elementInfoQuery, {ids: ids, dataLabelProperty: this.dataLabelProperty});
        return this.executeSparqlQuery<ElementBinding>(query)
            .then(elementsInfo => getElementsInfo(elementsInfo, params.elementIds))
            .then(elementModels => {
                if (this.options.prepareImages) {
                    return this.prepareElementsImage(elementModels);
                } else if (this.options.imagePropertyUris && this.options.imagePropertyUris.length) {
                    return this.enrichedElementsInfo(elementModels, this.options.imagePropertyUris);
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
        return this.executeSparqlQuery<ElementImageBinding>(query)
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
        return this.executeSparqlQuery<LinkBinding>(query).then(getLinksInfo);
    }

    linkTypesOf(params: { elementId: string; }): Promise<LinkCount[]> {
        const elementIri = escapeIri(params.elementId);
        const query = this.settings.defaultPrefix
            + resolveTemplate(this.settings.linkTypesOfQuery, {elementIri: elementIri});
        return this.executeSparqlQuery<LinkCountBinding>(query).then(getLinksTypesOf);
    };


    linkElements(params: {
        elementId: string;
        linkId: string;
        limit: number;
        offset: number;
        direction?: 'in' | 'out';
    }): Promise<Dictionary<ElementModel>> {
        // for sparql we have rich filtering features and we just reuse filter.
        return this.filter({
            refElementId: params.elementId,
            refElementLinkId: params.linkId,
            linkDirection: params.direction,
            limit: params.limit,
            offset: params.offset,
            languageCode: ''});
    }

    filter(params: FilterParams): Promise<Dictionary<ElementModel>> {
        if (params.limit === 0) { params.limit = 100; }

        if (!params.refElementId && params.refElementLinkId) {
            throw new Error(`Can't execute refElementLink filter without refElement`);
        }

        let refQueryPart = createRefQueryPart({
            elementId: params.refElementId,
            linkId: params.refElementLinkId,
            direction: params.linkDirection
        });

        let elementTypePart: string;
        if (params.elementTypeId) {
            const elementTypeIri = escapeIri(params.elementTypeId);
            elementTypePart = resolveTemplate(this.settings.filterTypePattern, {elementTypeIri: elementTypeIri});
        } else {
            elementTypePart = '';
        }

        let textSearchPart: string;
        if (params.text) {
            const text = params.text;
            textSearchPart = resolveTemplate(
                this.settings.fullTextSearch.queryPattern,
                {text: text, dataLabelProperty: this.dataLabelProperty}
            );
        } else {
            textSearchPart = '';
        }

        let query = `${this.settings.defaultPrefix}
            ${this.settings.fullTextSearch.prefix}
            
        SELECT ?inst ?class ?label
        WHERE {
            {
                SELECT DISTINCT ?inst ?score WHERE {
                    ${elementTypePart}
                    ${refQueryPart}
                    ${textSearchPart}
                    ${this.settings.filterAdditionalRestriction}
                    ${this.settings.fullTextSearch.extractLabel ? sparqlExtractLabel('?inst', '?extractedLabel') : ''}
                } ORDER BY DESC(?score) LIMIT ${params.limit} OFFSET ${params.offset}
            }
            ${resolveTemplate(this.settings.filterElementInfoPattern, {dataLabelProperty: this.dataLabelProperty})}
        } ORDER BY DESC(?score)
        `;

        return this.executeSparqlQuery<ElementBinding>(query).then(getFilteredData);
    };

    executeSparqlQuery<Binding>(query: string) {
        const method = this.options.queryMethod ? this.options.queryMethod : SparqlQueryMethod.GET;
        return executeSparqlQuery<Binding>(this.options.endpointUrl, query, method);
    }

    executeSparqlConstruct(query: string) : Promise<Triple[]> {
        const method = this.options.queryMethod ? this.options.queryMethod : SparqlQueryMethod.GET;
        return executeSparqlConstruct(this.options.endpointUrl, query, method);
    }
}

function resolveTemplate(template: string, values: Dictionary<string>) {
    let result = template;
    for (const replaceKey in values) {
        const replaceValue = values[replaceKey];
        result = result.replace(new RegExp('\\${' + replaceKey + '}', 'g'), replaceValue);
    }
    return result;
}

export function executeSparqlQuery<Binding>(endpoint: string, query: string, method: SparqlQueryMethod): Promise<SparqlResponse<Binding>> {
    let internalQuery: Promise<Response>;
    if (method == SparqlQueryMethod.GET) {
        internalQuery = queryInternal({
            url: `${endpoint}?query=` + encodeURIComponent(query),
            body: null,
            headers: {
                'Accept': 'application/sparql-results+json',
            },
            method: 'GET',
        });
    } else {
        internalQuery = queryInternal({
            url: endpoint,
            body: query,
            headers: {
                'Accept': 'application/sparql-results+json',
                'Content-Type': 'application/sparql-query',
            },
            method: 'POST',
        });
    }
    return internalQuery.then((response): Promise<SparqlResponse<Binding>> => {
        if (response.ok) {
            return response.json();
        } else {
            const error = new Error(response.statusText);
            (<any>error).response = response;
            throw error;
        }
    });
};

export function executeSparqlConstruct(endpoint: string, query: string, method: SparqlQueryMethod): Promise<Triple[]> {
    let internalQuery: Promise<Response>;
    if (method == SparqlQueryMethod.GET) {
        internalQuery = queryInternal({
            url: `${endpoint}?query=` + encodeURIComponent(query),
            body: null,
            headers: {
                'Accept': 'text/turtle',
            },
            method: 'GET',
        });
    } else {
        internalQuery = queryInternal({
            url: endpoint,
            body: query,
            headers: {
                'Accept': 'text/turtle',
                'Content-Type': 'application/sparql-query',
            },
            method: 'POST',
        });
    }
    return new Promise<Triple[]>((resolve, reject) => {
        internalQuery.then(response => {
            if (response.ok) {
                return response.text();
            } else {
                const error = new Error(response.statusText);
                (<any>error).response = response;
                throw error;
            }
        }).then(turtleText => {
            let triples: Triple[] = [];
            N3.Parser().parse(turtleText, (error, triple, hash) => {
                if (triple) {
                    triples.push({
                        subject: toRdfNode(triple.subject),
                        predicate: toRdfNode(triple.predicate),
                        object: toRdfNode(triple.object),
                    });
                } else {
                    resolve(triples);
                }
            });
        });
    });
}



function toRdfNode(entity: string): RdfNode {
    if (entity.length >= 2 && entity[0] === '"' && entity[entity.length - 1] === '"') {
        return {type: 'literal', value: entity.substring(1, entity.length - 1), 'xml:lang': ''};
    } else {
        return {type: 'uri', value: entity};
    }
}

function queryInternal(params: {
    url: string,
    body: string,
    headers: any,
    method: string,
}) {
    return fetch(params.url, {
        method: params.method,
        body: params.body,
        credentials: 'same-origin',
        mode: 'cors',
        cache: 'default',
        headers: params.headers,
    });
}

function sparqlExtractLabel(subject: string, label: string): string {
    return  `
        BIND ( str( ${subject} ) as ?uriStr)
        BIND ( strafter(?uriStr, "#") as ?label3)
        BIND ( strafter(strafter(?uriStr, "//"), "/") as ?label6) 
        BIND ( strafter(?label6, "/") as ?label5)   
        BIND ( strafter(?label5, "/") as ?label4)   
        BIND (if (?label3 != "", ?label3, 
            if (?label4 != "", ?label4, 
            if (?label5 != "", ?label5, ?label6))) as ${label})
    `;
};

function escapeIri(iri: string) {
    return `<${iri}>`;
}

function createRefQueryPart(params: { elementId: string; linkId?: string; direction?: 'in' | 'out'}) {
    let refQueryPart = '';
    const refElementIRI = escapeIri(params.elementId);
    const refElementLinkIRI = params.linkId ? escapeIri(params.linkId) : undefined;

    // link to element with specified link type
    // if direction is not specified, provide both patterns and union them
    // FILTER ISIRI is used to prevent blank nodes appearing in results
    if (params.elementId && params.linkId) {
        refQueryPart += !params.direction || params.direction === 'out' ? `{ ${refElementIRI} ${refElementLinkIRI} ?inst . FILTER ISIRI(?inst)}` : '';
        refQueryPart += !params.direction ? ' UNION ' : '';
        refQueryPart += !params.direction || params.direction === 'in' ? `{  ?inst ${refElementLinkIRI} ${refElementIRI} . FILTER ISIRI(?inst)}` : '';
    }

    // all links to current element
    if (params.elementId && !params.linkId) {
        refQueryPart += !params.direction || params.direction === 'out' ? `{ ${refElementIRI} ?link ?inst . FILTER ISIRI(?inst)}` : '';
        refQueryPart += !params.direction ? ' UNION ' : '';
        refQueryPart += !params.direction || params.direction === 'in' ? `{  ?inst ?link ${refElementIRI} . FILTER ISIRI(?inst)}` : '';
    }
    return refQueryPart;
}

export default SparqlDataProvider;
