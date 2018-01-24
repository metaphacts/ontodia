import { clone } from 'lodash';
import { DataProvider, FilterParams } from '../provider';
import {
    Dictionary,
    ClassModel,
    LinkType,
    ElementModel,
    LinkModel,
    LinkCount,
    Property,
    PropertyModel,
    LocalizedString,
} from '../model';
import {
    CompositeResponse,
    mergeClassTree,
    mergePropertyInfo,
    mergeClassInfo,
    mergeLinkTypesInfo,
    mergeLinkTypes,
    mergeElementInfo,
    mergeLinksInfo,
    mergeLinkTypesOf,
    mergeLinkElements,
    mergeFilter,
} from '../composite/mergeUtils';
import { SparqlDataProvider, SparqlDataProviderOptions } from './sparqlDataProvider';
import { SparqlDataProviderSettings, OWLStatsSettings, SparqlQueryMethod } from '../../../index';
import { SparqlResponse } from './sparqlModels';

const MAX_QUERY_LENGTH = 1000;

export class SparqlMultipleGetDataProvider implements DataProvider {
    readonly sparqlDataProvider: SparqlDataProvider;

    constructor(
        options: SparqlDataProviderOptions,
        settings: SparqlDataProviderSettings = OWLStatsSettings,
    ) {
        this.sparqlDataProvider = new SparqlDataProvider(options, settings);
    }

    classTree(): Promise<ClassModel[]> {
        return this.sparqlDataProvider.classTree();
    }

    propertyInfo(params: { propertyIds: string[] }): Promise<Dictionary<PropertyModel>> {
        const dataChunks = this.breakByChunks(params.propertyIds);
        if (dataChunks.length > 1) {
            const dataPortions = dataChunks.map(chunk => ({propertyIds: chunk}));
            return Promise.all(dataPortions.map(d =>
                    this.sparqlDataProvider.propertyInfo(d)))
                        .then(responseToCompositeResponse)
                        .then(mergePropertyInfo);
        } else {
            return this.sparqlDataProvider.propertyInfo(params);
        }
    }

    classInfo(params: { classIds: string[] }): Promise<ClassModel[]> {
        const dataChunks = this.breakByChunks(params.classIds);
        if (dataChunks.length > 1) {
            const dataPortions = dataChunks.map(chunk => ({classIds: chunk}));
            return Promise.all(dataPortions.map(d =>
                    this.sparqlDataProvider.classInfo(d)))
                        .then(responseToCompositeResponse)
                        .then(mergeClassInfo);
        } else {
            return this.sparqlDataProvider.classInfo(params);
        }
    }

    linkTypesInfo(params: {linkTypeIds: string[]}): Promise<LinkType[]> {
        const dataChunks = this.breakByChunks(params.linkTypeIds);
        if (dataChunks.length > 1) {
            const dataPortions = dataChunks.map(chunk => ({linkTypeIds: chunk}));
            return Promise.all(dataPortions.map(d =>
                    this.sparqlDataProvider.linkTypesInfo(d)))
                        .then(responseToCompositeResponse)
                        .then(mergeLinkTypesInfo);
        } else {
            return this.sparqlDataProvider.linkTypesInfo(params);
        }
    }

    linkTypes(): Promise<LinkType[]> {
        return this.sparqlDataProvider.linkTypes();
    }

    elementInfo(params: { elementIds: string[]; }): Promise<Dictionary<ElementModel>> {
        const dataChunks = this.breakByChunks(params.elementIds);
        if (dataChunks.length > 1) {
            const dataPortions = dataChunks.map(chunk => ({elementIds: chunk}));
            return Promise.all(dataPortions.map(d =>
                    this.sparqlDataProvider.elementInfo(d)))
                        .then(responseToCompositeResponse)
                        .then(mergeElementInfo);
        } else {
            return this.sparqlDataProvider.elementInfo(params);
        }
    }

    linksInfo(params: {
        elementIds: string[];
        linkTypeIds: string[];
    }): Promise<LinkModel[]> {
        const dataChunks = this.breakByChunks(params.elementIds, true);
        if (dataChunks.length > 1) {
            const dataPortions = dataChunks.map(chunk => ({
                linkTypeIds: params.linkTypeIds, elementIds: chunk
            }));
            return Promise.all(dataPortions.map(d =>
                    this.sparqlDataProvider.linksInfo(d)))
                        .then(responseToCompositeResponse)
                        .then(mergeLinksInfo);
        } else {
            return this.sparqlDataProvider.linksInfo(params);
        }
    }

    linkTypesOf(params: { elementId: string; }): Promise<LinkCount[]> {
        return this.sparqlDataProvider.linkTypesOf(params);
    };

    linkElements(params: {
        elementId: string;
        linkId: string;
        limit: number;
        offset: number;
        direction?: 'in' | 'out';
    }): Promise<Dictionary<ElementModel>> {
        return this.sparqlDataProvider.linkElements(params);
    }

    filter(params: FilterParams): Promise<Dictionary<ElementModel>> {
        return this.sparqlDataProvider.filter(params);
    };

    breakByChunks(data: string[], manyToMany?: boolean): string[][] {
        const queryDataLength = data.join().length;
        const shouldBeBroken =
            this.sparqlDataProvider.options.queryMethod === SparqlQueryMethod.GET &&
            queryDataLength > MAX_QUERY_LENGTH;

        let dataPortions: string[][] = [];
        if (shouldBeBroken) {
            if (manyToMany) {
                const qurterPortions = _breakByLength(data, MAX_QUERY_LENGTH / 2);
                for (let i = 0; i < qurterPortions.length; i++) {
                    for (let j = i; j < qurterPortions.length; j++) {
                        dataPortions.push(
                            qurterPortions[i].concat(qurterPortions[j])
                        );
                    }
                }
            } else {
                dataPortions = _breakByLength(data, MAX_QUERY_LENGTH);
            }
        } else {
            dataPortions.push(data);
        }

        return dataPortions;

        function _breakByLength(wholeData: string[], maxLength: number): string[][] {
            let curChunkLength = 0;
            let curChunk: string[] = [];
            const chunks = [];
            for (const datum of data) {
                if (curChunkLength >= maxLength) {
                    curChunkLength = 0;
                    chunks.push(curChunk);
                    curChunk = [];
                }
                curChunk.push(datum);
                curChunkLength += datum.length;
            }
            chunks.push(curChunk);
            return chunks;
        }
    }
}

function responseToCompositeResponse<Result>(responses: Result[]) {
    return responses.map(resp => ({
        dataSourceName: 'SparqlDataProvider',
        response: resp,
    }));
}

export default SparqlMultipleGetDataProvider;
