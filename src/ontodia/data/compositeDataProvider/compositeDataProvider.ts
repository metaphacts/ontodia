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

export interface CompositeResponse<Type> {
    dataSourceName: string;
    response: Type;
}

export interface DPDefinition {
    name: string;
    dataProvider: DataProvider;
}

function isDefenition(dp: DataProvider | DPDefinition): dp is DPDefinition {
    return (<DPDefinition> dp).name !== undefined && (<DPDefinition> dp).dataProvider !== undefined;
}

export type MergeMode = 'fetchAll' | 'sequentialFetching';

export class CompositeDataProvider implements DataProvider {
    public dataProviders: DPDefinition[];
    public mergeMode: MergeMode = 'fetchAll';

    constructor(
        dataProviders: (DataProvider | DPDefinition)[],
        params?: {
            mergeMode?: MergeMode,
        },
    ) {
        let dpCounter = 1;
        this.dataProviders = dataProviders.map(dp => {
            if (isDefenition(dp)) {
                return dp;
            } else {
                return {
                    name: dp.constructor.name ?
                        dp.constructor.name :
                        'dataProvider_' + dpCounter++,
                    dataProvider: dp,
                };
            }
        });

        if (params && params.mergeMode) {
            this.mergeMode = params.mergeMode;
        }
    }

    private processResults<ResponseType>(
        responsePromise: Promise<ResponseType>,
        dpName: string,
    ): Promise<CompositeResponse<ResponseType>> {
        return responsePromise.then(
            response => ({
                dataSourceName: dpName,
                response: response,
            }),
        ).catch(
            error => {
                console.error(error);
                return {
                    dataSourceName: dpName,
                    response: undefined,
                };
            },
        );
    };

    private queueProcessResults<ResponseType>(
        callBack: (previousResult: ResponseType, dp: DPDefinition) => Promise<ResponseType>,
    ): Promise<CompositeResponse<ResponseType>[]> {
        let counter = 0;
        let responseList: CompositeResponse<ResponseType>[] = [];

        const recursiveCall = (result?: ResponseType): Promise<CompositeResponse<ResponseType>[]> => {
            if (this.dataProviders.length > counter) {
                const dp = this.dataProviders[counter++];
                const callBackResult = callBack(result, dp);

                if (!callBackResult) {
                    return Promise.resolve(responseList);
                }

                return callBackResult.then(newResult => {
                    responseList.push({
                        dataSourceName: dp.name,
                        response: newResult,
                    });
                    return recursiveCall(newResult);
                }).catch(error => {
                    console.error(error);
                    return recursiveCall(result);
                });
            } else {
                return Promise.resolve(responseList);
            }
        };

        return recursiveCall();
    };

    classTree(): Promise<ClassModel[]> {
        const resultPromises = this.dataProviders.map(
            dp => this.processResults(dp.dataProvider.classTree(), dp.name),
        );
        return Promise.all(resultPromises).then(this.mergeClassTree);
    }

    propertyInfo(params: { propertyIds: string[] }): Promise<Dictionary<PropertyModel>> {
        if (this.mergeMode === 'fetchAll') {
            const resultPromises = this.dataProviders.map(
                dp => this.processResults(dp.dataProvider.propertyInfo(params), dp.name),
            );
            return Promise.all(resultPromises).then(this.mergePropertyInfo);
        } else {
            let propertyIds = params.propertyIds;
            return this.queueProcessResults((previousResult: Dictionary<PropertyModel>, dp: DPDefinition) => {
                propertyIds = propertyIds.filter(id => !previousResult || !previousResult[id]);
                if (propertyIds.length > 0) {
                    return dp.dataProvider.propertyInfo({ propertyIds: propertyIds });
                } else {
                    return undefined;
                }
            }).then(this.mergePropertyInfo);
        }
    }

    classInfo(params: { classIds: string[] }): Promise<ClassModel[]> {
        if (this.mergeMode === 'fetchAll') {
            const resultPromises = this.dataProviders.map(
                dp => this.processResults(dp.dataProvider.classInfo(params), dp.name),
            );
            return Promise.all(resultPromises).then(this.mergeClassInfo);
        } else {
            let classIds = params.classIds;
            return this.queueProcessResults((previousResult: ClassModel[], dp: DPDefinition) => {
                classIds = classIds.filter(id => !previousResult || previousResult.map(cm => cm.id).indexOf(id) === -1);
                if (classIds.length > 0) {
                    return dp.dataProvider.classInfo({ classIds: classIds });
                } else {
                    return undefined;
                }
            }).then(this.mergeClassInfo);
        }
    }

    linkTypesInfo(params: {linkTypeIds: string[]}): Promise<LinkType[]> {
        if (this.mergeMode === 'fetchAll') {
            const resultPromises = this.dataProviders.map(
                dp => this.processResults(dp.dataProvider.linkTypesInfo(params), dp.name),
            );
            return Promise.all(resultPromises).then(this.mergeLinkTypesInfo);
        } else {
            let linkTypeIds = params.linkTypeIds;
            return this.queueProcessResults((previousResult: LinkType[], dp: DPDefinition) => {
                linkTypeIds = linkTypeIds.filter(id =>
                    !previousResult || previousResult.map(lt => lt.id).indexOf(id) === -1);

                if (linkTypeIds.length > 0) {
                    return dp.dataProvider.linkTypesInfo({ linkTypeIds: linkTypeIds });
                } else {
                    return undefined;
                }
            }).then(this.mergeLinkTypesInfo);
        }
    }

    linkTypes(): Promise<LinkType[]> {
        const resultPromises = this.dataProviders.map(
            dp => this.processResults(dp.dataProvider.linkTypes(), dp.name),
        );
        return Promise.all(resultPromises).then(this.mergeLinkTypes);
    }

    elementInfo(params: { elementIds: string[]; }): Promise<Dictionary<ElementModel>> {
        if (this.mergeMode === 'fetchAll') {
            const resultPromises = this.dataProviders.map(
                dp => this.processResults(dp.dataProvider.elementInfo(params), dp.name),
            );
            return Promise.all(resultPromises).then(this.mergeElementInfo);
        } else {
            let elementIds = params.elementIds;
            return this.queueProcessResults((previousResult: Dictionary<ElementModel>, dp: DPDefinition) => {
                elementIds = elementIds.filter(id => !previousResult || !previousResult[id]);
                if (elementIds.length > 0) {
                    return dp.dataProvider.elementInfo({ elementIds: elementIds });
                } else {
                    return undefined;
                }
            }).then(this.mergeElementInfo);
        }
    }

    linksInfo(params: {
        elementIds: string[];
        linkTypeIds: string[];
    }): Promise<LinkModel[]> {
        if (this.mergeMode === 'fetchAll') {
            const resultPromises = this.dataProviders.map(
                dp => this.processResults(dp.dataProvider.linksInfo(params), dp.name),
            );
            return Promise.all(resultPromises).then(this.mergeLinksInfo);
        } else {
            let elementIds = params.elementIds;
            return this.queueProcessResults((previousResult: LinkModel[], dp: DPDefinition) => {
                elementIds = elementIds.filter(id => {
                    if (previousResult) {
                        for (const linkModel of previousResult) {
                            if (linkModel.sourceId === id) {
                                return false;
                            }
                        }
                    }
                    return true;
                });
                if (elementIds.length > 0) {
                    return dp.dataProvider.linksInfo({ elementIds: elementIds, linkTypeIds: params.linkTypeIds });
                } else {
                    return undefined;
                }
            }).then(this.mergeLinksInfo);
        }
    }

    linkTypesOf(params: { elementId: string; }): Promise<LinkCount[]> {
        if (this.mergeMode === 'fetchAll') {
            const resultPromises = this.dataProviders.map(
                dp => this.processResults(dp.dataProvider.linkTypesOf(params), dp.name),
            );
            return Promise.all(resultPromises).then(this.mergeLinkTypesOf);
        } else {
            return this.queueProcessResults((previousResult: LinkCount[], dp: DPDefinition) => {
                if (!previousResult || previousResult && previousResult.length === 0) {
                    return dp.dataProvider.linkTypesOf(params);
                } else {
                    return undefined;
                }
            }).then(this.mergeLinkTypesOf);
        }
    };

    linkElements(params: {
        elementId: string;
        linkId: string;
        limit: number;
        offset: number;
        direction?: 'in' | 'out';
    }): Promise<Dictionary<ElementModel>> {
        if (this.mergeMode === 'fetchAll') {
            const resultPromises = this.dataProviders.map(
                dp => this.processResults(dp.dataProvider.linkElements(params), dp.name),
            );
            return Promise.all(resultPromises).then(this.mergeLinkElements);
        } else {
            return this.queueProcessResults((previousResult: Dictionary<ElementModel>, dp: DPDefinition) => {
                if (!previousResult || previousResult && Object.keys(previousResult).length === 0) {
                    return dp.dataProvider.linkElements(params);
                } else {
                    return undefined;
                }
            }).then(this.mergeLinkElements);
        }
    }

    filter(params: FilterParams): Promise<Dictionary<ElementModel>> {
        if (this.mergeMode === 'fetchAll') {
            const resultPromises = this.dataProviders.map(
                dp => this.processResults(dp.dataProvider.filter(params), dp.name),
            );
            return Promise.all(resultPromises).then(this.mergeFilter);
        } else {
            return this.queueProcessResults((previousResult: Dictionary<ElementModel>, dp: DPDefinition) => {
                if (!previousResult || previousResult && Object.keys(previousResult).length === 0) {
                    return dp.dataProvider.filter(params);
                } else {
                    return undefined;
                }
            }).then(this.mergeFilter);
        }
    };

    private mergeClassTree = (response: CompositeResponse<ClassModel[]>[]): ClassModel[] => {
        const lists = response.filter(r => r.response).map(r => this.classTree2Array(r.response));
        const dictionary: Dictionary<ClassModel> = {};
        const topLevelModels: Dictionary<ClassModel> = {};
        const childrenMap: Dictionary<string[]> = {};

        const self = this;

        for (const list of lists) {
            for (const model of list) {
                const childrenIds: string[] = childrenMap[model.id] || [];
                model.children.map(ch => ch.id).forEach(id => {
                    if (childrenIds.indexOf(id) === -1) {
                        childrenIds.push(id);
                    }
                });
                model.children = [];
                model.count = undefined;

                if (!dictionary[model.id]) {
                    topLevelModels[model.id] = model;
                    dictionary[model.id] = model;
                    childrenMap[model.id] = childrenIds;
                } else {
                    topLevelModels[model.id] = this.mergeClassModel(dictionary[model.id], model);
                    dictionary[model.id] = topLevelModels[model.id];
                }
            }
        }

        const models = Object.keys(dictionary).map(key => dictionary[key]);

        for (const m of models) {
            m.children = (childrenMap[m.id] || []).map(id => {
                delete topLevelModels[id];
                return dictionary[id];
            });
        }

        return Object.keys(topLevelModels).map(key => topLevelModels[key]);
    }

    private mergePropertyInfo = (
        response: CompositeResponse<Dictionary<PropertyModel>>[],
    ): Dictionary<PropertyModel> => {
        const result: Dictionary<PropertyModel> = {};
        const props = response.filter(r => r.response).map(r => r.response);
        for (const model of props) {
            const keys = Object.keys(model);
            for (const key of keys) {
                const prop = model[key];
                if (!result[key]) {
                    result[key] = prop;
                } else {
                    result[key].label = this.mergeLabels(result[key].label, prop.label);
                }
            }
        }
        return result;
    }

    private mergeClassInfo(response: CompositeResponse<ClassModel[]>[]): ClassModel[] {
        const dictionaries = response.filter(r => r.response).map(r => r.response);
        const dictionary: Dictionary<ClassModel> = {};

        for (const models of dictionaries) {
            for (const model of models) {
                if (!dictionary[model.id]) {
                    dictionary[model.id] = model;
                } else {
                    dictionary[model.id] = this.mergeClassModel(dictionary[model.id], model);
                }
            }
        }
        return Object.keys(dictionary).map(key => dictionary[key]);
    }

    private mergeLinkTypesInfo = (response: CompositeResponse<LinkType[]>[]): LinkType[] => {
        const lists = response.filter(r => r.response).map(r => r.response);

        const mergeLinkType = (a: LinkType, b: LinkType): LinkType => {
            return {
                id: a.id,
                label: this.mergeLabels(a.label, b.label),
                count: a.count + b.count,
            };
        };

        const dictionary: Dictionary<LinkType> = {};

        for (const linkTypes of lists) {
            for (const linkType of linkTypes) {
                if (!dictionary[linkType.id]) {
                    dictionary[linkType.id] = linkType;
                } else {
                    dictionary[linkType.id] = mergeLinkType(dictionary[linkType.id], linkType);
                }
            }
        }
        return Object.keys(dictionary).map(key => dictionary[key]);
    }

    private mergeLinkTypes = (response: CompositeResponse<LinkType[]>[]): LinkType[] => {
        return this.mergeLinkTypesInfo(response);
    }

    private mergeElementInfo = (response: CompositeResponse<Dictionary<ElementModel>>[]): Dictionary<ElementModel> => {
        const mergeElementModels = (a: ElementModel, b: ElementModel): ElementModel => {
            const types = a.types;
            for (const t of b.types) {
                if (types.indexOf(t) === -1) {
                    types.push(t);
                }
            }
            const sources: string[] = [];
            for (const s of a.sources) {
                if (sources.indexOf(s) === -1) {
                    sources.push(s);
                }
            }
            for (const s of b.sources) {
                if (sources.indexOf(s) === -1) {
                    sources.push(s);
                }
            }
            return {
                id: a.id,
                label: this.mergeLabels(a.label, b.label),
                types: types,
                image: a.image || b.image,
                properties: this.mergeProperties(a.properties, b.properties),
                sources: sources,
            };
        };

        const dictionaries = response.filter(r => r.response).map(r => r.response);
        const dictionary: Dictionary<ElementModel> = {};

        for (const resp of response) {
            if (!resp.response) {
                continue;
            }
            const list = Object.keys(resp.response).map(k => resp.response[k]);

            for (const em of list) {
                em.sources = [resp.dataSourceName];
                em.properties['DataProvider'] = {
                    type: 'string', values: [{ text: resp.dataSourceName, lang: '' }],
                };
                if (!dictionary[em.id]) {
                    dictionary[em.id] = em;
                } else {
                    dictionary[em.id] = mergeElementModels(dictionary[em.id], em);
                }
            }
        }
        return dictionary;
    }

    private mergeProperties = (a: Dictionary<Property>, b: Dictionary<Property>): Dictionary<Property> => {
        const aLists = Object.keys(a);
        const bLists = Object.keys(b);

        const result: Dictionary<Property> = {};

        function createIdForProperty (baseId: string): string {
            let counter = 1;
            while (result[baseId + '_' + counter]) {
                counter++;
            }
            return baseId + '_' + counter;
        }

        for (const pKey of aLists) {
            const prop = a[pKey];
            if (!result[pKey]) {
                result[pKey] = prop;
            } else {
                result[createIdForProperty(pKey)] = prop;
            }
        }
        for (const pKey of bLists) {
            const prop = b[pKey];
            if (!result[pKey]) {
                result[pKey] = prop;
            } else {
                result[createIdForProperty(pKey)] = prop;
            }
        }

        return result;
    }

    private mergeLinksInfo(response: CompositeResponse<LinkModel[]>[]): LinkModel[] {
        const lists = response.filter(r => r.response).map(r => r.response);
        const resultInfo: LinkModel[] = [];

        function compareLinksInfo (a: LinkModel, b: LinkModel): boolean {
            return a.sourceId === b.sourceId &&
                   a.targetId === b.targetId &&
                   a.linkTypeId === b.linkTypeId;
        }

        for (const linkInfo of lists) {
            for (const linkModel of linkInfo) {
                if (!contain<LinkModel>(linkModel, resultInfo, compareLinksInfo)) {
                    resultInfo.push(linkModel);
                }
            }
        }
        return resultInfo;
    }

    private mergeLinkTypesOf(response: CompositeResponse<LinkCount[]>[]): LinkCount[] {
        const lists = response.filter(r => r.response).map(r => r.response);
        const dictionary: Dictionary<LinkCount> = {};

        const mergeCounts = (a: LinkCount, b: LinkCount): LinkCount => {
            return {
                id: a.id,
                inCount: a.inCount + b.inCount,
                outCount: a.outCount + b.outCount,
            };
        };

        for (const linkCount of lists) {
            for (const lCount of linkCount) {
                if (!dictionary[lCount.id]) {
                    dictionary[lCount.id] = lCount;
                } else {
                    dictionary[lCount.id] = mergeCounts(lCount, dictionary[lCount.id]);
                }
            }
        }
        return Object.keys(dictionary).map(key => dictionary[key]);
    }

    private mergeLinkElements = (response: CompositeResponse<Dictionary<ElementModel>>[]): Dictionary<ElementModel> => {
        return this.mergeElementInfo(response);
    }

    private mergeFilter = (response: CompositeResponse<Dictionary<ElementModel>>[]): Dictionary<ElementModel> => {
        return this.mergeElementInfo(response);
    }

    private classTree2Array(models: ClassModel[]): ClassModel[] {
        let resultArray: ClassModel[] = models;

        function getDescendants(model: ClassModel): ClassModel[] {
            let descendants = model.children || [];
            for (const descendant of descendants) {
                const nextGeneration = getDescendants(descendant);
                descendants = descendants.concat(nextGeneration);
            }
            return descendants;
        }

        for (const model of models) {
            const descendants = getDescendants(model);
            resultArray = resultArray.concat(descendants);
        }

        return resultArray;
    }

    private mergeLabels(
        a: { values: LocalizedString[] },
        b: { values: LocalizedString[] },
    ): { values: LocalizedString[] } {

        function compareLabels (l1: LocalizedString, l2: LocalizedString): boolean {
            return l1.lang === l2.lang && l1.text === l2.text;
        }

        const mergedValuesList = a.values;

        for (const locStr of b.values) {
            if (!contain<LocalizedString>(locStr, mergedValuesList, compareLabels)) {
                mergedValuesList.push(locStr);
            }
        }

        return {
            values: mergedValuesList,
        };
    }

    private mergeClassModel = (a: ClassModel, b: ClassModel): ClassModel => {
        const childrenDictionary: Dictionary<ClassModel> = {};
        for (const child of a.children.concat(b.children)) {
            if (!childrenDictionary[child.id]) {
                childrenDictionary[child.id] = child;
            }
        }

        return {
            id: a.id,
            label: this.mergeLabels(a.label, b.label),
            count: a.count + b.count,
            children: Object.keys(childrenDictionary).map(key => childrenDictionary[key]),
        };
    }
}

export default CompositeDataProvider;

function contain<Type>(locStr: Type, strList: Type[], comparator: (a: Type, b: Type) => boolean) {
    for (const ls of strList) {
        if (comparator(ls, locStr)) {
            return true;
        }
    }
    return false;
}
