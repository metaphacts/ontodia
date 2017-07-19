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
    ClassBinding, ElementBinding, LinkBinding, PropertyBinding, BlankBinding, isBlankBinding,
    LinkCountBinding, LinkTypeBinding, ElementImageBinding, SparqlResponse, Triple, RdfNode, isRdfBlank,
} from './sparqlModels';
import { SparqlDataProviderSettings, OWLStatsSettings } from './sparqlDataProviderSettings';
import * as BlankNodes from './blankNodes';

export enum SparqlQueryMethod { GET = 1, POST }

export type QueryFunction = (params: {
    url: string,
    body?: string,
    headers: { [header: string]: string },
    method: string,
}) => Promise<Response>;

/**
 * Runtime settings of SPARQL data provider
 */
export interface SparqlDataProviderOptions {

    acceptBlankNodes?: boolean;

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
     * function to send sparql requests
     */
    queryFunction?: QueryFunction;
}

export class SparqlDataProvider implements DataProvider {
    readonly options: SparqlDataProviderOptions;
    readonly settings: SparqlDataProviderSettings;

    constructor(
        options: SparqlDataProviderOptions,
        settings: SparqlDataProviderSettings = OWLStatsSettings,
    ) {
        const {queryFunction = queryInternal} = options;
        this.options = {...options, queryFunction};
        this.settings = settings;
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
                VALUES (?prop) {${ids}}.
                OPTIONAL { ?prop ${this.settings.schemaLabelProperty} ?label. }
            }
        `;
        return this.executeSparqlQuery<PropertyBinding>(query).then(getPropertyInfo);
    }

    classInfo(params: { classIds: string[] }): Promise<ClassModel[]> {
        const ids = params.classIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
        const query = this.settings.defaultPrefix + `
            SELECT ?class ?label ?instcount
            WHERE {
                VALUES (?class) {${ids}}.
                OPTIONAL { ?class ${this.settings.schemaLabelProperty} ?label. }
                BIND("" as ?instcount)
            }
        `;
        return this.executeSparqlQuery<ClassBinding>(query).then(getClassInfo);
    }

    linkTypesInfo(params: {linkTypeIds: string[]}): Promise<LinkType[]> {
        const ids = params.linkTypeIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
        const query = this.settings.defaultPrefix + `
            SELECT ?link ?label ?instcount
            WHERE {
                VALUES (?link) {${ids}}.
                OPTIONAL { ?link ${this.settings.schemaLabelProperty} ?label. }
                BIND("" as ?instcount)
            }
        `;
        return this.executeSparqlQuery<LinkTypeBinding>(query).then(getLinkTypesInfo);
    }

    linkTypes(): Promise<LinkType[]> {
        const query = this.settings.defaultPrefix + `
            SELECT ?link ?instcount ?label
            WHERE {
                  ${this.settings.linkTypesPattern}
                  OPTIONAL { ?link ${this.settings.schemaLabelProperty} ?label. }
            }
        `;
        return this.executeSparqlQuery<LinkTypeBinding>(query).then(getLinkTypes);
    }

    elementInfo(params: { elementIds: string[]; }): Promise<Dictionary<ElementModel>> {
        const blankIds: string[] = [];

        const elementIds = params.elementIds.filter(id => !BlankNodes.isBlunkNodeId(id));
        const additionalData: SparqlResponse<ElementBinding> = (
            this.options.acceptBlankNodes ?
            BlankNodes.elementInfo(params.elementIds) :
            null
        );

        if (elementIds.length === 0 && this.options.acceptBlankNodes) {
            return Promise.resolve(getElementsInfo(additionalData, params.elementIds));
        }

        const ids = elementIds.map(escapeIri).map(id => ` (${id})`).join(' ');
        const {defaultPrefix, dataLabelProperty, elementInfoQuery} = this.settings;
        const query = defaultPrefix + resolveTemplate(elementInfoQuery, {ids, dataLabelProperty});

        return this.executeSparqlQuery<ElementBinding>(query, {additionalData})
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
        types: string[],
    ): Promise<Dictionary<ElementModel>> {
        const ids = Object.keys(elementsInfo).filter(id => !BlankNodes.isBlunkNodeId(id))
            .map(escapeIri).map(id => ` ( ${id} )`).join(' ');
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
            .then(imageResponse => getEnrichedElementsInfo(imageResponse, elementsInfo))
            .catch(err => {
                console.error(err);
                return elementsInfo;
            });
    }

    private prepareElementsImage(
        elementsInfo: Dictionary<ElementModel>,
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
        const elementIds = params.elementIds.filter(id => !BlankNodes.isBlunkNodeId(id));

        const additionalData = (
            this.options.acceptBlankNodes ?
            BlankNodes.linksInfo(params.elementIds) :
            null
        );

        if (elementIds.length === 0 && this.options.acceptBlankNodes) {
            return Promise.resolve(getLinksInfo(additionalData));
        }

        const ids = elementIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
        const linksInfoQuery = resolveTemplate(this.settings.linksInfoQuery, {ids: ids});
        const query = this.settings.defaultPrefix + linksInfoQuery;
        return this.executeSparqlQuery<LinkBinding>(query, {additionalData}).then(getLinksInfo);
    }

    linkTypesOf(params: { elementId: string; }): Promise<LinkCount[]> {
        if (this.options.acceptBlankNodes && BlankNodes.isBlunkNodeId(params.elementId)) {
            return Promise.resolve(getLinksTypesOf(BlankNodes.linkTypesOf(params)));
        } else {
            const elementIri = escapeIri(params.elementId);
            const query = this.settings.defaultPrefix
                + resolveTemplate(this.settings.linkTypesOfQuery, {elementIri: elementIri});
            return this.executeSparqlQuery<LinkCountBinding>(query).
                then(result => {
                    result.results.bindings = result.results.bindings.filter(b => !isRdfBlank(b.link));
                    return result;
                }).then(getLinksTypesOf);
        }
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
        const filterData = (
            this.options.acceptBlankNodes ?
            BlankNodes.filter(params) :
            null
        );

        if (this.options.acceptBlankNodes && Object.keys(filterData.results.bindings).length > 0) {
            return Promise.resolve(getFilteredData(filterData));
        }

        if (!params.refElementId && params.refElementLinkId) {
            throw new Error(`Can't execute refElementLink filter without refElement`);
        }

        let refQueryPart = '';
        if (params.refElementId) {
            refQueryPart = this.createRefQueryPart({
                elementId: params.refElementId,
                linkId: params.refElementLinkId,
                direction: params.linkDirection,
            });
        }

        let elementTypePart = '';
        if (params.elementTypeId) {
            const elementTypeIri = escapeIri(params.elementTypeId);
            elementTypePart = resolveTemplate(this.settings.filterTypePattern, {elementTypeIri});
        }

        let textSearchPart = '';
        if (params.text) {
            const {fullTextSearch, dataLabelProperty} = this.settings;
            textSearchPart = resolveTemplate(fullTextSearch.queryPattern, {text: params.text, dataLabelProperty});
        }

        const {defaultPrefix, fullTextSearch, dataLabelProperty} = this.settings;
        const query = `${defaultPrefix}
            ${fullTextSearch.prefix}
            
        SELECT ?inst ?class ?label ?blankTrgProp ?blankTrg ?blankSrc ?blankSrcProp ?blankType ?listHead
        WHERE {
            {
                SELECT DISTINCT ?inst ${textSearchPart ? '?score' : ''} WHERE {
                    ${elementTypePart}
                    ${refQueryPart}
                    ${textSearchPart}
                    ${this.settings.filterAdditionalRestriction}
                    ${this.settings.fullTextSearch.extractLabel ? sparqlExtractLabel('?inst', '?extractedLabel') : ''}
                }
                ${textSearchPart ? 'ORDER BY DESC(?score)' : ''}
                LIMIT ${params.limit} OFFSET ${params.offset}
            }
            ${resolveTemplate(this.settings.filterElementInfoPattern, {dataLabelProperty})}
            OPTIONAL {
                FILTER (ISBLANK(?inst)).
                {
                    ?inst ?blankTrgProp ?blankTrg.
                    ?blankSrc ?blankSrcProp ?inst.
                    FILTER NOT EXISTS { ?inst rdf:first _:smth1 }.
                    BIND("blankNode" as ?blankType)
                } UNION {
                    ?inst rdf:rest*/rdf:first ?blankTrg.
                    ?blankSrc ?blankSrcProp ?inst.
                    _:smth2 rdf:first ?blankTrg.
                    BIND(?blankSrcProp as ?blankTrgProp)
                    BIND("listHead" as ?blankType)
                    FILTER NOT EXISTS { _:smth3 rdf:rest ?inst }.
                } UNION {
                    ?listHead rdf:rest* ?inst.
                    FILTER NOT EXISTS { _:smth4 rdf:rest ?listHead }.

                    ?listHead rdf:rest*/rdf:first ?blankTrg.
                    ?blankSrc ?blankSrcProp ?listHead.
                    _:smth5 rdf:first ?blankTrg.
                    BIND(?blankSrcProp as ?blankTrgProp)
                    BIND("listHead" as ?blankType)
                }
            }
        } ${textSearchPart ? 'ORDER BY DESC(?score)' : ''}
        `;

        return this.executeSparqlQuery<ElementBinding | BlankBinding>(query, {
            additionalData: filterData,
        }).then(result => {
            if (this.options.acceptBlankNodes) {
                return BlankNodes.updateFilterResults(
                    result,
                    (callBackQuery: string) => {
                        return this.executeSparqlQuery<BlankBinding>(callBackQuery);
                    },
                );
            } else {
                result.results.bindings = result.results.bindings.filter(b => !isBlankBinding(b));
                return result;
            }
        }).then(getFilteredData);
    };

    executeSparqlQuery<Binding>(query: string, params?: { additionalData: SparqlResponse<Binding> }) {
        const method = this.options.queryMethod ? this.options.queryMethod : SparqlQueryMethod.GET;
        let promise = executeSparqlQuery<Binding>(this.options.endpointUrl, query, method, this.options.queryFunction);
        if (params && params.additionalData) {
            promise = promise.then(result => {
                result.results.bindings = result.results.bindings.concat(params.additionalData.results.bindings);
                return result;
            });
        }
        return promise;
    }

    executeSparqlConstruct(query: string): Promise<Triple[]> {
        const method = this.options.queryMethod ? this.options.queryMethod : SparqlQueryMethod.GET;
        return executeSparqlConstruct(this.options.endpointUrl, query, method, this.options.queryFunction);
    }

    protected createRefQueryPart(params: { elementId: string; linkId?: string; direction?: 'in' | 'out'}) {
        const {elementId, linkId, direction} = params;
        const refElementIRI = escapeIri(params.elementId);
        const linkPattern = linkId ? escapeIri(params.linkId) : '?link';
        const blankFilter = this.options.acceptBlankNodes
            ? 'FILTER(isIri(?inst) || isBlank(?inst))'
            : 'FILTER(isIri(?inst))';
        // link to element with specified link type
        // if direction is not specified, provide both patterns and union them
        // FILTER ISIRI is used to prevent blank nodes appearing in results
        let part = '';
        if (params.direction !== 'in') {
            part += `{ ${refElementIRI} ${linkPattern} ?inst . ${blankFilter} }`;
        }
        if (!params.direction) { part += ' UNION '; }
        if (params.direction !== 'out') {
            part += `{ ?inst ${linkPattern} ${refElementIRI} . ${blankFilter} }`;
        }
        return part;
    }
}

function resolveTemplate(template: string, values: Dictionary<string>) {
    let result = template;
    for (const replaceKey in values) {
        if (!values.hasOwnProperty(replaceKey)) { continue; }
        const replaceValue = values[replaceKey];
        result = result.replace(new RegExp('\\${' + replaceKey + '}', 'g'), replaceValue);
    }
    return result;
}

export function executeSparqlQuery<Binding>(
    endpoint: string,
    query: string,
    method: SparqlQueryMethod,
    queryFunction: QueryFunction,
): Promise<SparqlResponse<Binding>> {
    let internalQuery: Promise<Response>;
    if (method === SparqlQueryMethod.GET) {
        internalQuery = queryFunction({
            url: appendQueryParams(endpoint, {query}),
            headers: {
                'Accept': 'application/sparql-results+json',
            },
            method: 'GET',
        });
    } else {
        internalQuery = queryFunction({
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
            (error as any).response = response;
            throw error;
        }
    });
}

export function executeSparqlConstruct(
    endpoint: string,
    query: string,
    method: SparqlQueryMethod,
    queryFunction: QueryFunction,
): Promise<Triple[]> {
    let internalQuery: Promise<Response>;
    if (method === SparqlQueryMethod.GET) {
        internalQuery = queryFunction({
            url: appendQueryParams(endpoint, {query}),
            headers: {
                'Accept': 'text/turtle',
            },
            method: 'GET',
        });
    } else {
        internalQuery = queryFunction({
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
                (<any> error).response = response;
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

function appendQueryParams(endpoint: string, queryParams: { [key: string]: string } = {}) {
    const initialSeparator = endpoint.indexOf('?') < 0 ? '?' : '&';
    const additionalParams = initialSeparator + Object.keys(queryParams)
        .map(key => `${key}=${encodeURIComponent(queryParams[key])}`)
        .join('&');
    return endpoint + additionalParams;
}

function queryInternal(params: {
    url: string,
    body?: string,
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
}

function escapeIri(iri: string) {
    if (typeof iri !== 'string') {
        throw new Error(`Cannot escape IRI of type "${typeof iri}"`);
    }
    return `<${iri}>`;
}

export default SparqlDataProvider;
