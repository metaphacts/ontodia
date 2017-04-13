import 'whatwg-fetch';
import { DataProvider, FilterParams } from '../provider';
import { Dictionary, ClassModel, LinkType, ElementModel, LinkModel, LinkCount, PropertyModel } from '../model';
import {
    getClassTree,
    getLinkTypes,
    getElementsInfo,
    getLinksInfo,
    getLinksTypesOf,
    getFilteredData,
} from './responseHandler';

import {
    ClassBinding, ElementBinding, LinkBinding,
    LinkTypeBinding, Neo4jResponse,
} from './models';


export interface Neo4jDataProviderOptions {
    endpointUrl: string;
    imagePropertyUris?: string[];
    prepareImages?: (elementInfo: Dictionary<ElementModel>) => Promise<Dictionary<string>>;
    labelProperty?: string;
}

export class Neo4jDataProvider implements DataProvider {
    dataLabelProperty: string;
    constructor(
        private options: Neo4jDataProviderOptions
    ) {
        this.dataLabelProperty = options.labelProperty;
    }

    classTree(): Promise<ClassModel[]> {
        const query = `{
            "query": "START n=node(*) RETURN labels(n), count(*);",
            "params" : { }
        }`;
        return this.executeQuery<ClassBinding>(query).then(getClassTree);
    }

    // For lazy loading
    // ====================================================
    propertyInfo(params: { propertyIds: string[] }): Promise<Dictionary<PropertyModel>> {
        return Promise.resolve({});
    }

    classInfo(params: { classIds: string[] }): Promise<ClassModel[]> {
        return Promise.resolve([]);
    }

    linkTypesInfo(params: {linkTypeIds: string[]}): Promise<LinkType[]> {
        return Promise.resolve([]);
    }
    // ====================================================


    linkTypes(): Promise<LinkType[]> {
        const query = `
        {
            "query" : "START r=rel(*) RETURN type(r), count(*);",
            "params" : { }
        }`;
        return this.executeQuery<LinkTypeBinding>(query).then(getLinkTypes);
    }

    elementInfo(params: { elementIds: string[]; }): Promise<Dictionary<ElementModel>> {
        const idList = '[' + params.elementIds.join(', ') + ']';
        const query = `{
            "query" : "MATCH (n) WHERE (ID(n) IN ${idList}) RETURN DISTINCT n",
            "params" : { }
        }`;
        return this.executeQuery<ElementBinding>(query)
            .then(elementsInfo => getElementsInfo(elementsInfo, params.elementIds));
    }

    linksInfo(params: {
        elementIds: string[];
        linkTypeIds: string[];
    }): Promise<LinkModel[]> {
        if (params.elementIds.length === 0) {
            return Promise.resolve([]);
        }

        const idLine = '[' + params.elementIds.join(', ') + ']';
        const linkIdsLine = '[' + params.linkTypeIds.map(lid => '\'' + lid + '\'').join(', ') + ']';


        const query = [
            `{`,
                `"query" : "`,
                    `START r=rel(*) `,
                    `WHERE (`,
                        `(`,
                            `(ID(startNode(r)) IN ${idLine}) OR `,
                            `(ID(endNode(r)) IN ${idLine})`,
                        `) AND `,
                        `(type(r) IN ${linkIdsLine})`,
                    `)`,
                    `RETURN type(r), ID(startNode(r)), ID(endNode(r))`,
                `", `,
                `"params" : { }`,
            `}`,
        ].join('');
        return this.executeQuery<LinkBinding>(query).then(getLinksInfo);
    }

    linkTypesOf(params: { elementId: string; }): Promise<LinkCount[]> {
        const id = params.elementId;
        const query = `
        {
            "query" : 
            "MATCH (n1)-[r]->(n2) WHERE (ID(n1) = ${id} OR ID(n2) = ${id}) RETURN type(r), count(r);",
            "params" : { }
        }`;
        return this.executeQuery<LinkTypeBinding>(query).then(getLinksTypesOf);
    };

    linkElements(params: {
        elementId: string;
        linkId: string;
        limit: number;
        offset: number
    }): Promise<Dictionary<ElementModel>> {
        return this.filter({
            refElementId: params.elementId,
            refElementLinkId: params.linkId,
            limit: params.limit,
            offset: params.offset,
            languageCode: ''});
    }

    filter(params: FilterParams): Promise<Dictionary<ElementModel>> {
        if (params.limit === 0) { params.limit = 100; }

        let query;
        if (params.elementTypeId) {
            query = `{
                "query" : "MATCH (n:${params.elementTypeId}) RETURN n SKIP ${params.offset} LIMIT ${params.limit};",
                "params" : { }
            }`;
        } else if (params.refElementLinkId) {
            const linkId = params.refElementLinkId;
            const eId = params.refElementId;
            query = `{
                "query" : "MATCH (n)<-[r]->(n2) ` +
                    `WHERE  ((ID(n) = ${eId}) AND (type(r) = '${linkId}')) ` +
                    `RETURN n2 SKIP ${params.offset} LIMIT ${params.limit}",
                "params" : { }
            }`;
        } else if (params.refElementId) {
            const eId = params.refElementId;
            query = `{
                "query" : "MATCH (n)<-[r]->(n2) ` +
                    `WHERE  (ID(n) = ${eId}) ` +
                    `RETURN n2 SKIP ${params.offset} LIMIT ${params.limit}",
                "params" : { }
            }`;
        } else {
            return Promise.resolve({});
        }
        return this.executeQuery<ElementBinding>(query)
            .then(responce => getFilteredData(responce, params.text));
    };

    executeQuery<Binding>(query: string) {
        return executeQuery<Binding>(this.options.endpointUrl, query, 'POST');
    }
}

export function executeQuery<Binding>(
    endpoint: string, query: string, method?: string
): Promise<Neo4jResponse<Binding>> {
    let internalQuery: Promise<Response>;
    if (method === 'GET') {
        internalQuery = queryInternal({
            url: `${endpoint}?query=` + encodeURIComponent(query),
            body: null,
            headers: {
                'Accept': 'application/sparql-results+json',
                'Content-Type': 'application/json',
                'Authorization': 'Basic bmVvNGo6MTIzNA==',
            },
            method: 'GET',
        });
    } else {
        internalQuery = queryInternal({
            url: endpoint,
            body: query,
            headers: {
                'Accept': 'application/sparql-results+json',
                'Content-Type': 'application/json',
                'Authorization': 'Basic bmVvNGo6MTIzNA==',
            },
            method: 'POST',
        });
    }

    return internalQuery.then((response): Promise<Neo4jResponse<Binding>> => {
        if (response.ok) {
            return response.json();
        } else {
            const error = new Error(response.statusText);
            (<any>error).response = response;
            throw error;
        }
    });
};


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

export default Neo4jDataProvider;
