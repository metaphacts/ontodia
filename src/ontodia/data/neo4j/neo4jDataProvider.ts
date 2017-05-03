import 'whatwg-fetch';
import { DataProvider, FilterParams } from '../provider';

import {
    Dictionary,
    ClassModel,
    LinkType,
    ElementModel,
    LinkModel,
    LinkCount,
    PropertyModel,
} from '../model';

import {
    ResponseHandler,
    INSTANCE_OF,
    TYPE_OF,
} from './responseHandler';

import {
    ClassBinding, ElementBinding, LinkBinding,
    LinkTypeBinding, Neo4jResponse,
} from './models';

export interface Neo4jDataProviderOptions {
    endpointUrl: string;
    useAsTitle?: string[];
    titleMap?: Dictionary<string>;
    authorization?: string;
}

export class Neo4jDataProvider implements DataProvider {
    authorization: string;
    calc: ResponseHandler;

    constructor(
        private options: Neo4jDataProviderOptions
    ) {
        this.authorization = options.authorization;
        this.calc = new ResponseHandler(options.useAsTitle, options.titleMap);
    }

    classTree(): Promise<ClassModel[]> {
        const query = `{
            "query": "START n=node(*) RETURN labels(n), count(*);",
            "params" : { }
        }`;
        return this.executeQuery<ClassBinding>(query)
            .then(result => this.calc.getClassTree(result));
    }

    // For lazy loading (not implemented)
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
        return this.executeQuery<LinkTypeBinding>(query)
            .then(result => this.calc.getLinkTypes(result));
    }

    elementInfo(params: { elementIds: string[]; }): Promise<Dictionary<ElementModel>> {
        const ids = params.elementIds;
        const nodeIds = ids.filter(id => +id || +id === 0);

        if (ids.length === nodeIds.length) {
            const idListAsString = '[' + nodeIds.join(', ') + ']';
            const query = `{
                "query" : "MATCH (n) WHERE (ID(n) IN ${idListAsString}) RETURN DISTINCT n",
                "params" : { }
            }`;
            return this.executeQuery<ElementBinding>(query)
                .then(elementsInfo => this.calc.getElementsInfo(elementsInfo, params.elementIds));
        } else {
            return Promise.resolve(this.calc.getElementsInfo(null, params.elementIds));
        }
    }

    linksInfo(params: {
        elementIds: string[];
        linkTypeIds: string[];
    }): Promise<LinkModel[]> {
        if (params.elementIds.length === 0) {
            return Promise.resolve([]);
        }
        const ids = params.elementIds;
        const nodeIds = ids.filter(id => +id || +id === 0);
        const classIds = ids.filter(id => !+id && +id !== 0);

        const idLine = '[' + nodeIds.join(', ') + ']';
        const linkIdsLine = '[' + params.linkTypeIds.map(lid => '\'' + lid + '\'').join(', ') + ']';

        // neo4j breaks if the query contains line feeds, so we construct a query without LFs
        const query = [
            `{`,
                `"query" : "`,
                    `MATCH (n)-[r]->(n2) `,
                    `WHERE (`,
                        `(ID(n) IN ${idLine}) AND `,
                        `(type(r) IN ${linkIdsLine})`,
                    `) `,
                    `RETURN type(r), ID(n), ID(n2)`,
                `", `,
                `"params" : { }`,
            `}`,
        ].join('');

        if (classIds.length > 0) {
            const classIdLine = classIds.map(id => 'n:' + id).join(' OR ');
            const secondQuery = `{
                "query" : "MATCH (n) WHERE ((${classIdLine}) AND (ID(n) IN ${idLine})) RETURN n;",
                "params" : { }
            }`;
            return Promise.all([
                this.executeQuery<LinkBinding>(query),
                this.executeQuery<ElementBinding>(secondQuery)
                .then(elementsInfo => this.calc.getElementsInfo(elementsInfo, nodeIds)),
            ]).then(results => {
                const elements = Object.keys(results[1]).map(key => results[1][key]);
                const links = this.calc.getLinksInfo(results[0]);
                const typeLinks = this.calc.getGeneralizationLinksInfo(classIds, elements);
                return links.concat(typeLinks);
            });
        } else {
            return this.executeQuery<LinkBinding>(query)
                .then(result => this.calc.getLinksInfo(result));
        }
    }

    linkTypesOf(params: { elementId: string; }): Promise<LinkCount[]> {
        const id = params.elementId;
        if (+id || +id === 0) {
            const query1 = `
            {
                "query" : 
                "MATCH (n)-[r]->(n1) WHERE (ID(n1) = ${id}) RETURN type(r), count(r);",
                "params" : { }
            }`;
            const query2 = `
            {
                "query" : 
                "MATCH (n)<-[r]-(n1) WHERE (ID(n1) = ${id}) RETURN type(r), count(r);",
                "params" : { }
            }`;
            return Promise.all([
                this.executeQuery<LinkTypeBinding>(query1),
                this.executeQuery<LinkTypeBinding>(query2),
                this.elementInfo({ elementIds: [id]}),
            ]).then(results => {
                const linkCounts = this.calc.getLinkCount(results[0], results[1]);

                const element = results[2][Object.keys(results[2])[0]];
                linkCounts.push({
                    id: INSTANCE_OF,
                    inCount: 0,
                    outCount: element.types.length,
                });

                linkCounts.push({
                    id: TYPE_OF,
                    inCount: element.types.length,
                    outCount: 0,
                });

                return linkCounts;
            });
        } else {
            const query = `{
                "query" : "MATCH (n:${id}) RETURN 'typeOf', count(n);",
                "params" : { }
            }`;
            return this.executeQuery<LinkTypeBinding>(query)
                .then(result => {
                    const types = this.calc.getLinksTypesOf(result);
                    const linkCounts: LinkCount[] = types.map(t => ({
                        id: t.id,
                        inCount: 0,
                        outCount: t.count,
                    }));
                    return linkCounts;
                });
        }
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

        const getQueryForClassId = (classId: string, filterKey?: string): string => {
            const sortBy: string = this.calc.getTitleFieldByTypes([classId]);
            const filterByKey = filterKey && sortBy ? `WHERE (n.${sortBy} CONTAINS '${filterKey}')` : '';

            return `{
                "query" : "MATCH (n:${classId}) ${filterByKey} RETURN n SKIP ${params.offset} LIMIT ${params.limit};",
                "params" : { }
            }`;
        };

        const getQueryForElementId = (
            elementId: string,
            linktId?: string,
            elementInfo?: ElementModel,
            filterKey?: string,
        ): string => {
            let filterByKey = '';
            if (elementInfo) {
                const types = elementInfo.types;
                const sortBy = this.calc.getTitleFieldByTypes(types);
                filterByKey = filterKey && sortBy ? ` AND (n.${sortBy} CONTAINS '${filterKey}')` : '';
            }

            const linkFilter = linktId ? `AND (type(r) = '${linktId}')` : '';

            return `{
                "query" : "MATCH (n)<-[r]->(n2) ` +
                    `WHERE  ((ID(n) = ${elementId})${linkFilter}${filterByKey}) ` +
                    `RETURN n2 SKIP ${params.offset} LIMIT ${params.limit}",
                "params" : { }
            }`;
        };

        let query;
        if (params.elementTypeId) {
            query = getQueryForClassId(params.elementTypeId, params.text);
        } else if (params.refElementLinkId) {
            const linkId = params.refElementLinkId;
            const eId = params.refElementId;
            if (linkId === 'typeOf' || linkId === 'instanceOf') {
                if (linkId === 'typeOf' && (!+eId && +eId !== 0)) {
                    query = getQueryForClassId(eId, params.text);
                } else {
                    return this.elementInfo({ elementIds: [eId] })
                        .then(result => this.calc.getElementTypesAsElements(result));
                }
            } else {
                return this.elementInfo({ elementIds: [eId] }).then(elementResult => {
                    const el = elementResult[Object.keys(elementResult)[0]];

                    query = getQueryForElementId(eId, linkId, el, params.text);
                    return this.executeQuery<ElementBinding>(query)
                        .then(result => this.calc.getFilteredData(result, params.text))
                        .then(results => {
                            return Object.assign(results, elementResult);
                        });
                });
            }
        } else if (params.refElementId) {
            const eId = params.refElementId;
            if (+eId || +eId === 0) {
                return this.elementInfo({ elementIds: [eId] }).then(elementResult => {
                    const el = elementResult[Object.keys(elementResult)[0]];

                    query = getQueryForElementId(eId, null, el, params.text);
                    return this.executeQuery<ElementBinding>(query)
                        .then(result => this.calc.getFilteredData(result, params.text))
                        .then(results => {
                            return Object.assign(results, elementResult);
                        });
                });
            } else {
                query = getQueryForClassId(eId, params.text);
            }
        } else if (params.text) {
            let titles = this.calc.getPossibleTitles();
            const conditionString = titles.map(t => {
                return `(n.${t} CONTAINS '${params.text}')`;
            }).join(' OR ');

            query = `{
                "query" : "MATCH (n) ` +
                    `WHERE (${conditionString})` +
                    `RETURN n SKIP ${params.offset} LIMIT ${params.limit}",
                "params" : { }
            }`;
        } else {
            return Promise.resolve({});
        }

        return this.executeQuery<ElementBinding>(query)
            .then(result => this.calc.getFilteredData(result));
    };

    executeQuery<Binding>(query: string) {
        return executeQuery<Binding>(`${this.options.endpointUrl}/db/data/cypher`, query, this.authorization);
    }
}

function executeQuery<Binding>(
    endpoint: string,
    query: string,
    authorization?: string,
): Promise<Neo4jResponse<Binding>> {
    const headers: any = {
        'Accept': 'application/sparql-results+json',
        'Content-Type': 'application/json',
    };

    if (authorization) {
        headers['Authorization'] = authorization;
    }

    let internalQuery: Promise<Response>;
    internalQuery = queryInternal({
        url: endpoint,
        body: query,
        headers: headers,
        method: 'POST',
    });

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
