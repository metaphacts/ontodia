import * as N3 from 'n3';
import { DataProvider, LinkElementsParams, FilterParams } from '../provider';
import {
    Dictionary, ClassModel, LinkType, ElementModel, LinkModel, LinkCount, PropertyModel,
    ElementIri, ClassIri, LinkTypeIri, PropertyTypeIri,
} from '../model';
import {
    triplesToElementBinding,
    getClassTree,
    getClassInfo,
    getPropertyInfo,
    getLinkTypes,
    getElementsInfo,
    getLinksInfo,
    getLinksTypeIds,
    getFilteredData,
    getEnrichedElementsInfo,
    getLinksTypesOf,
    getLinkStatistics,
} from './responseHandler';
import {
    ClassBinding, ElementBinding, LinkBinding, PropertyBinding, BlankBinding,
    LinkCountBinding, LinkTypeBinding, ElementImageBinding, SparqlResponse, Triple, RdfNode,
} from './sparqlModels';
import { SparqlDataProviderSettings, OWLStatsSettings } from './sparqlDataProviderSettings';
import * as BlankNodes from './blankNodes';
import { parseTurtleText } from './turtle';

export enum SparqlQueryMethod { GET = 1, POST }

export type QueryFunction = (params: {
    url: string;
    body?: string;
    headers: { [header: string]: string };
    method: string;
}) => Promise<Response>;

/**
 * Runtime settings of SPARQL data provider
 */
export interface SparqlDataProviderOptions {

    /**
     * If it's true then blank nodes will be present on the paper
     * By default blank nodes wont be shown
     */
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

    propertyInfo(params: { propertyIds: PropertyTypeIri[] }): Promise<Dictionary<PropertyModel>> {
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

    classInfo(params: { classIds: ClassIri[] }): Promise<ClassModel[]> {
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

    linkTypesInfo(params: { linkTypeIds: LinkTypeIri[] }): Promise<LinkType[]> {
        const ids = params.linkTypeIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
        const query = this.settings.defaultPrefix + `
            SELECT ?link ?label ?instcount
            WHERE {
                VALUES (?link) {${ids}}.
                OPTIONAL { ?link ${this.settings.schemaLabelProperty} ?label. }
                BIND("" as ?instcount)
            }
        `;
        return this.executeSparqlQuery<LinkTypeBinding>(query).then(getLinkTypes);
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

    elementInfo(params: { elementIds: ElementIri[] }): Promise<Dictionary<ElementModel>> {
        const blankIds: string[] = [];

        const elementIds = params.elementIds.filter(id => !BlankNodes.isEncodedBlank(id));
        const blankNodeResponse = this.options.acceptBlankNodes
            ? BlankNodes.elementInfo(params.elementIds) : undefined;

        if (elementIds.length === 0 && this.options.acceptBlankNodes) {
            return Promise.resolve(getElementsInfo(blankNodeResponse, params.elementIds));
        }

        const ids = elementIds.map(escapeIri).map(id => ` (${id})`).join(' ');
        const {defaultPrefix, dataLabelProperty, elementInfoQuery} = this.settings;
        const query = defaultPrefix + resolveTemplate(elementInfoQuery, {ids, dataLabelProperty});

        return this.executeSparqlConstruct(query)
            .then(triplesToElementBinding)
            .then(result => this.concatWithBlankNodeResponse(result, blankNodeResponse))
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
        const ids = Object.keys(elementsInfo).filter(id => !BlankNodes.isEncodedBlank(id))
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
        elementIds: ElementIri[];
        linkTypeIds: LinkTypeIri[];
    }): Promise<LinkModel[]> {
        const elementIds = params.elementIds.filter(id => !BlankNodes.isEncodedBlank(id));

        const blankNodeResponse = this.options.acceptBlankNodes
            ? BlankNodes.linksInfo(params.elementIds) : undefined;

        if (elementIds.length === 0 && this.options.acceptBlankNodes) {
            return Promise.resolve(getLinksInfo(blankNodeResponse));
        }

        const ids = elementIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
        const linksInfoQuery = resolveTemplate(
            this.settings.linksInfoQuery,
            {ids: ids, linkConfigurations: this.formatLinkLinks()},
        );
        const query = this.settings.defaultPrefix + linksInfoQuery;
        return this.executeSparqlQuery<LinkBinding>(query)
            .then(result => this.concatWithBlankNodeResponse(result, blankNodeResponse))
            .then(getLinksInfo);
    }

    linkTypesOf(params: { elementId: ElementIri }): Promise<LinkCount[]> {
        if (this.options.acceptBlankNodes && BlankNodes.isEncodedBlank(params.elementId)) {
            return Promise.resolve(getLinksTypesOf(BlankNodes.linkTypesOf(params)));
        }
        const elementIri = escapeIri(params.elementId);
        // Ask for linkTypes
        const query = this.settings.defaultPrefix
            + resolveTemplate(this.settings.linkTypesOfQuery,
                {elementIri, linkConfigurations: this.formatLinkTypesOf(params.elementId)},
            );
        return this.executeSparqlQuery<LinkTypeBinding>(query)
            .then(linkTypeBinding => {
                const linkTypeIds = getLinksTypeIds(linkTypeBinding);
                const requests: Promise<LinkCount>[] = [];

                const navigateElementFilterOut = this.options.acceptBlankNodes ?
                    `FILTER (IsIri(?outObject) || IsBlank(?outObject))` : `FILTER IsIri(?outObject)`;
                const navigateElementFilterIn = this.options.acceptBlankNodes ?
                    `FILTER (IsIri(?inObject) || IsBlank(?inObject))` : `FILTER IsIri(?inObject)`;

                for (const id of linkTypeIds) {
                    const q = this.settings.defaultPrefix
                    + resolveTemplate(this.settings.linkTypesStatisticsQuery, {
                        linkId:  escapeIri(id),
                        elementIri,
                        linkConfigurations: this.formatLinkTypesStatistics(params.elementId, id),
                        navigateElementFilterOut,
                        navigateElementFilterIn,
                    });
                    requests.push(
                        this.executeSparqlQuery<LinkCountBinding>(q).then(getLinkStatistics)
                    );
                }
                return Promise.all(requests);
            });
    };

    linkElements(params: LinkElementsParams): Promise<Dictionary<ElementModel>> {
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
        if (params.limit === undefined) { params.limit = 100; }
        const blankFiltration = this.options.acceptBlankNodes
            ? BlankNodes.filter(params) : undefined;

        if (this.options.acceptBlankNodes && blankFiltration.results.bindings.length > 0) {
            return Promise.resolve(getFilteredData(blankFiltration));
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
        const blankNodes = this.options.acceptBlankNodes;
        const query = `${defaultPrefix}
            ${fullTextSearch.prefix}

        SELECT ?inst ?class ?label ?blankType ${blankNodes ? BlankNodes.BLANK_NODE_QUERY_PARAMETERS : ''}
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
            ${blankNodes ? BlankNodes.BLANK_NODE_QUERY : ''}
        } ${textSearchPart ? 'ORDER BY DESC(?score)' : ''}
        `;

        return this.executeSparqlQuery<ElementBinding | BlankBinding>(query)
            .then(result => {
                if (this.options.acceptBlankNodes) {
                    return BlankNodes.updateFilterResults(result, blankQuery =>
                        this.executeSparqlQuery<BlankBinding>(blankQuery));
                }
                return result;
            }).then(getFilteredData);
    };

    executeSparqlQuery<Binding>(query: string) {
        const method = this.options.queryMethod ? this.options.queryMethod : SparqlQueryMethod.GET;
        return executeSparqlQuery<Binding>(this.options.endpointUrl, query, method, this.options.queryFunction);
    }

    concatWithBlankNodeResponse<Binding>(
        response: SparqlResponse<Binding>,
        blankNodeResponse: SparqlResponse<Binding>,
    ): SparqlResponse<Binding> {
        if (!this.options.acceptBlankNodes) {
            return response;
        }
        return {
            head: { vars: response.head.vars },
            results: {
                bindings: blankNodeResponse.results.bindings.concat(response.results.bindings)
            },
        };
    }

    executeSparqlConstruct(query: string): Promise<Triple[]> {
        const method = this.options.queryMethod ? this.options.queryMethod : SparqlQueryMethod.GET;
        return executeSparqlConstruct(this.options.endpointUrl, query, method, this.options.queryFunction);
    }

    protected createRefQueryPart(params: { elementId: ElementIri; linkId?: LinkTypeIri; direction?: 'in' | 'out' }) {
        const {elementId, linkId, direction} = params;
        const refElementIRI = escapeIri(params.elementId);

        // If no link configuration is passed, use rdf predicates as links
        if (this.settings.linkConfigurations.length === 0) {
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
            if (this.settings.filterRefElementLinkPattern.length && !linkId) {
                part += `\n${this.settings.filterRefElementLinkPattern}`;
            }
            return part;
        } else {
            // use link configuration in filter. If you need more or somehow mix it with rdf predicates, override
            // this function and provide nessesary sparql for this.
            const linkConfigurations = this.formatLinkElements(params.elementId, params.linkId, params.direction);
            return linkConfigurations;
        }

    }

    formatLinkTypesOf(elementIri: ElementIri): string {
        const elementIriConst = escapeIri(elementIri);
        return this.settings.linkConfigurations.map(linkConfig => {
            let links: string[] = [];
            links.push(`{ ${this.formatLinkPath(linkConfig.path, elementIriConst, '?outObject')} 
                BIND(<${linkConfig.id}> as ?link )
            }`);
            links.push(`{ ${this.formatLinkPath(linkConfig.path, '?inObject', elementIriConst)} 
                BIND(<${linkConfig.id}> as ?link )
            }`);
            if (linkConfig.inverseId) {
                links.push(`{ ${this.formatLinkPath(linkConfig.path, elementIriConst, '?inObject')} 
                BIND(<${linkConfig.inverseId}> as ?link )
            }`);
                links.push(`{ ${this.formatLinkPath(linkConfig.path, '?outObject', elementIriConst)} 
                BIND(<${linkConfig.inverseId}> as ?link )
            }`);
            }
            return links;
        }).map(links => links.join(`
            UNION 
            `)).join(`
            UNION 
            `);
    }

    formatLinkTypesStatistics(elementIri: ElementIri, linkIri: LinkTypeIri): string {
        const elementIriConst = escapeIri(elementIri);
        const linkConfig = this.settings.linkConfigurations.find(link => link.id === linkIri);
        const linkConfigInverse = this.settings.linkConfigurations.find(link => link.inverseId === linkIri);

        let links: string[] = [];
        if (linkConfig) {
            links.push(`{ ${this.formatLinkPath(linkConfig.path, elementIriConst, '?outObject')} 
                BIND(<${linkIri}> as ?link )
            }`);
            links.push(`{ ${this.formatLinkPath(linkConfig.path, '?inObject', elementIriConst)} 
                BIND(<${linkIri}> as ?link )
            }`);
        }
        if (linkConfigInverse) {
            links.push(`{ ${this.formatLinkPath(linkConfigInverse.path, elementIriConst, '?inObject')} 
                BIND(<${linkIri}> as ?link )
            }`);
            links.push(`{ ${this.formatLinkPath(linkConfigInverse.path, '?outObject', elementIriConst)} 
                BIND(<${linkIri}> as ?link )
            }`);
        }
        return links.join(`
            UNION 
            `);
    }

    formatLinkElements(refElementIri: ElementIri, linkIri?: LinkTypeIri, direction?: 'in' | 'out'): string {
        const elementIriConst = `<${refElementIri}>`;
        let parts: string[] = [];
        if (!linkIri) {
            if (!direction || direction === 'out') {
                parts = parts.concat( this.settings.linkConfigurations.map((linkConfig) =>
                    `{ ${this.formatLinkPath(linkConfig.path, elementIriConst, '?inst')} }`));
            }
            if (!direction || direction === 'in') {
                parts = parts.concat( this.settings.linkConfigurations.map((linkConfig) =>
                    `{ ${this.formatLinkPath(linkConfig.path, '?inst', elementIriConst)} }`));
            }
            return parts.join(`
            UNION 
            `);
        } else {
            const linkOut = this.settings.linkConfigurations.find((linkConfig) => linkConfig.id === linkIri);
            const linkIn = this.settings.linkConfigurations.find((linkConfig) => linkConfig.inverseId === linkIri);
            if (!direction || direction === 'out') {
                if (linkOut) {
                    parts.push(`{ ${this.formatLinkPath(linkOut.path, elementIriConst, '?inst')} }`);
                }
                if (linkIn) {
                    parts.push(`{ ${this.formatLinkPath(linkIn.path, '?inst', elementIriConst)} }`);
                }
            }
            if (!direction || direction === 'in') {
                if (linkIn) {
                    parts.push(`{ ${this.formatLinkPath(linkIn.path, elementIriConst, '?inst')} }`);
                }
                if (linkOut) {
                    parts.push(`{ ${this.formatLinkPath(linkOut.path, '?inst', elementIriConst)} }`);
                }
            }
            return parts.join(`
            UNION 
            `);
        }
    }

    formatLinkLinks(): string {
        return this.settings.linkConfigurations.map(linkConfig =>
            `{ ${this.formatLinkPath(linkConfig.path, '?source', '?target')} 
                BIND(<${linkConfig.id}> as ?type )
               ${linkConfig.properties ? this.formatLinkPath(linkConfig.properties, '?source', '?target') : ''}
            }`).join(`
            UNION 
            `);
    }

    formatLinkPath(path: string, source: string, target: string): string {
        return path.replace(/\$source/g, source).replace(/\$target/g, target);
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
    return internalQuery.then(response => {
        if (response.ok) {
            return response.text();
        } else {
            const error = new Error(response.statusText);
            (error as any).response = response;
            throw error;
        }
    }).then(parseTurtleText);
}

function appendQueryParams(endpoint: string, queryParams: { [key: string]: string } = {}) {
    const initialSeparator = endpoint.indexOf('?') < 0 ? '?' : '&';
    const additionalParams = initialSeparator + Object.keys(queryParams)
        .map(key => `${key}=${encodeURIComponent(queryParams[key])}`)
        .join('&');
    return endpoint + additionalParams;
}

function queryInternal(params: {
    url: string;
    body?: string;
    headers: any;
    method: string;
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
