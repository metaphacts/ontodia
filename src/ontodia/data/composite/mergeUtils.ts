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

const DATA_PROVIDER_PROPERTY = 'http://ontodia.org/property/DataProvider';

export interface CompositeResponse<Type> {
    dataSourceName: string;
    useInStats?: boolean;
    response: Type;
}

export function mergeClassTree(composite: CompositeResponse<ClassModel[]>[]): ClassModel[] {
    const lists = composite.filter(r => r.response).map(({useInStats, response}) =>
        ({useInStats, classes: classTreeToArray(response)})
    );
    const dictionary: Dictionary<ClassModel> = {};
    const topLevelModels: Dictionary<ClassModel> = {};
    const childrenMap: Dictionary<string[]> = {};

    for (const {useInStats, classes} of lists) {
        for (const model of classes) {
            const childrenIds: string[] = childrenMap[model.id] || [];
            model.children.map(ch => ch.id).forEach(id => {
                if (childrenIds.indexOf(id) === -1) {
                    childrenIds.push(id);
                }
            });
            model.children = [];

            if (!useInStats) {
                delete model.count;
            }

            if (!dictionary[model.id]) {
                topLevelModels[model.id] = model;
                dictionary[model.id] = model;
                childrenMap[model.id] = childrenIds;
            } else {
                topLevelModels[model.id] = mergeClassModel(dictionary[model.id], model);
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

export function mergePropertyInfo(
    response: CompositeResponse<Dictionary<PropertyModel>>[],
): Dictionary<PropertyModel> {
    const result: Dictionary<PropertyModel> = {};
    const props = response.filter(r => r.response).map(r => r.response);
    for (const model of props) {
        const keys = Object.keys(model);
        for (const key of keys) {
            const prop = model[key];
            if (!result[key]) {
                result[key] = prop;
            } else {
                result[key].label = mergeLabels(result[key].label, prop.label);
            }
        }
    }
    return result;
}

export function mergeClassInfo(response: CompositeResponse<ClassModel[]>[]): ClassModel[] {
    const dictionaries = response.filter(r => r.response).map(r => r.response);
    const dictionary: Dictionary<ClassModel> = {};

    for (const models of dictionaries) {
        for (const model of models) {
            if (!dictionary[model.id]) {
                dictionary[model.id] = model;
            } else {
                dictionary[model.id] = mergeClassModel(dictionary[model.id], model);
            }
        }
    }
    return Object.keys(dictionary).map(key => dictionary[key]);
}

export function mergeLinkTypesInfo(response: CompositeResponse<LinkType[]>[]): LinkType[] {
    const lists = response.filter(r => r.response).map(r => r.response);

    const mergeLinkType = (a: LinkType, b: LinkType): LinkType => {
        return {
            id: a.id,
            label: mergeLabels(a.label, b.label),
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

export function mergeLinkTypes(response: CompositeResponse<LinkType[]>[]): LinkType[] {
    return mergeLinkTypesInfo(response);
}

export function mergeElementInfo(response: CompositeResponse<Dictionary<ElementModel>>[]): Dictionary<ElementModel> {
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
            label: mergeLabels(a.label, b.label),
            types: types,
            image: a.image || b.image,
            properties: mergeProperties(a.properties, b.properties),
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
            em.properties[DATA_PROVIDER_PROPERTY] = {
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

export function mergeProperties(a: Dictionary<Property>, b: Dictionary<Property>): Dictionary<Property> {
    const aLists = Object.keys(a);
    const bLists = Object.keys(b);

    const result: Dictionary<Property> = {};

    function createIdForProperty(baseId: string): string {
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

export function mergeLinksInfo(response: CompositeResponse<LinkModel[]>[]): LinkModel[] {
    const lists = response.filter(r => r.response).map(r => r.response);
    const resultInfo: LinkModel[] = [];

    function compareLinksInfo(a: LinkModel, b: LinkModel): boolean {
        return a.sourceId === b.sourceId &&
               a.targetId === b.targetId &&
               a.linkTypeId === b.linkTypeId;
    }

    for (const linkInfo of lists) {
        for (const linkModel of linkInfo) {
            if (!resultInfo.some(l => compareLinksInfo(l, linkModel))) {
                resultInfo.push(linkModel);
            }
        }
    }
    return resultInfo;
}

export function mergeLinkTypesOf(response: CompositeResponse<LinkCount[]>[]): LinkCount[] {
    const lists = response.filter(r => r.response).map(r => r.response);
    const dictionary: Dictionary<LinkCount> = {};

    const merge = (a: LinkCount, b: LinkCount): LinkCount => {
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
                dictionary[lCount.id] = merge(lCount, dictionary[lCount.id]);
            }
        }
    }
    return Object.keys(dictionary).map(key => dictionary[key]);
}

export function mergeLinkElements(response: CompositeResponse<Dictionary<ElementModel>>[]): Dictionary<ElementModel> {
    return mergeElementInfo(response);
}

export function mergeFilter(response: CompositeResponse<Dictionary<ElementModel>>[]): Dictionary<ElementModel> {
    return mergeElementInfo(response);
}

export function classTreeToArray(models: ClassModel[]): ClassModel[] {
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

export function mergeLabels(
    a: { values: LocalizedString[] },
    b: { values: LocalizedString[] },
): { values: LocalizedString[] } {

    function compareLabels(l1: LocalizedString, l2: LocalizedString): boolean {
        return l1.lang === l2.lang && l1.text === l2.text;
    }

    const mergedValuesList = a.values;

    for (const locStr of b.values) {
        if (!mergedValuesList.some(l => compareLabels(l, locStr))) {
            mergedValuesList.push(locStr);
        }
    }

    return {
        values: mergedValuesList,
    };
}

export function mergeCounts(a?: number, b?: number): number | undefined {
    if (a === undefined && b === undefined) { return undefined; }

    return (a || 0) + (b || 0);
}

export function mergeClassModel(a: ClassModel, b: ClassModel): ClassModel {
    const childrenDictionary: Dictionary<ClassModel> = {};
    for (const child of a.children.concat(b.children)) {
        if (!childrenDictionary[child.id]) {
            childrenDictionary[child.id] = child;
        }
    }

    return {
        id: a.id,
        label: mergeLabels(a.label, b.label),
        count: mergeCounts(a.count, b.count),
        children: Object.keys(childrenDictionary).map(key => childrenDictionary[key]),
    };
}
