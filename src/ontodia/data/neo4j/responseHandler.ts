import {
    Neo4jResponse, ClassBinding, ElementBinding, LinkBinding,
    LinkTypeBinding,
} from './models';
import {
    Dictionary, LocalizedString, LinkType, ClassModel, ElementModel, LinkModel,
} from '../model';


export function getClassTree(response: Neo4jResponse<ClassBinding>): ClassModel[] {
    const tree: ClassModel[] = [];
    const treeNodes = response.data;

    const treeMap: Dictionary<ClassModel> = {}; 

    for (const nodeBinding of treeNodes) {
        const treeNodes = getClassModels(nodeBinding);
        for (const model of treeNodes) {
            if (!treeMap[model.id]) {
                treeMap[model.id] = model;
            } else {
                treeMap[model.id].count += model.count;
            }
        }
    }
    for (const model in treeMap) {
        if (treeMap.hasOwnProperty(model)) {
            tree.push(treeMap[model]);
        }
    }

    return tree;
}

export function getLinkTypes(response: Neo4jResponse<LinkTypeBinding>): LinkType[] {
    const neo4jTypes = response.data;
    const linkTypes: LinkType[] = [];

    for (const neo4jLink of neo4jTypes) {
        let link = getLinkType(neo4jLink);
        linkTypes.push(link);
    };

    return linkTypes;
}

export function getElementsInfo(response: Neo4jResponse<ElementBinding>, ids: string[]): Dictionary<ElementModel> {
    const nInstances = response.data;
    const instancesMap: Dictionary<ElementModel> = {};

    for (const nElement of nInstances) {
        const newElement = getElementInfo(nElement);
        instancesMap[newElement.id] = newElement;
    };

    const proccesedIds = Object.keys(instancesMap);
    for (const id of ids) {
        if (proccesedIds.indexOf(id) === -1) {
            instancesMap[id] = {
                id: id,
                label: { values: [getLocalizedString(undefined, id)] },
                types: ['Thing'],
                properties: {},
            };
        }
    };

    return instancesMap;
}

export function getLinksInfo(response: Neo4jResponse<LinkBinding>): LinkModel[] {
    const neo4jLinks = response.data;
    return neo4jLinks.map((nLink: LinkBinding) => getLinkInfo(nLink));
}

export function getLinksTypesOf(response: Neo4jResponse<LinkTypeBinding>): LinkType[] {
    const neo4jLinks = response.data;
    return neo4jLinks.map((nLink: LinkTypeBinding) => getLinkType(nLink));
}

export function getFilteredData(response: Neo4jResponse<ElementBinding>, filterKey?: string): Dictionary<ElementModel> {
    const ne4jElements = response.data;
    const instancesMap: Dictionary<ElementModel> = {};

    for (const nElement of ne4jElements) {
        const newElement = getElementInfo(nElement, filterKey);
        if (newElement) {
            instancesMap[newElement.id] = newElement;
        }
    };
    return instancesMap;
}

export function getNameFromId(id: string): string {
    const sharpIndex = id.indexOf('#');
    if (sharpIndex !== -1) {
        return id.substring(sharpIndex + 1, id.length);
    } else {
        const tokens = id.split('/');
        return tokens[tokens.length - 1];
    }
}

export function getLocalizedString(label: string, id?: string): LocalizedString {
    if (label) {
        return {
            text: label,
            lang: '',
        };
    } else {
        return undefined;
    }
}

/**
 * This extension of ClassModel is used only in processing, parent links are not needed in UI (yet?)
 */
export interface HierarchicalClassModel extends ClassModel {
    parent: string;
}

export function getClassModels(node: ClassBinding): HierarchicalClassModel[] {
    const models: HierarchicalClassModel[] = [];
    for (const label of node[0]) {
        models.push({
            id: label,
            children: [],
            label: { values: [getLocalizedString(label)] },
            count: node[1],
            parent: undefined,
        });
    }
    return models;
}

export function getLinkType(neo4jLink: LinkTypeBinding): LinkType {
    return {
        id: neo4jLink[0],
        label: { values: [getLocalizedString(neo4jLink[0])] },
        count: neo4jLink[1],
    };
}

export function getElementInfo (nElement: ElementBinding, filterKey?: string): ElementModel {
    const label = getElementLabel(nElement);
    if (filterKey && label.toLowerCase().indexOf(filterKey.toLowerCase()) === -1) {
        return null;
    }
    const eModel = nElement[0];
    const elementInfo: ElementModel = {
        id: '' + eModel.metadata.id,
        label: { values: [getLocalizedString(label)] },
        types: eModel.metadata.labels,
        properties: {},
    };

    const props = nElement[0].data;
    for (const prop in props) {
        if (props.hasOwnProperty(prop)) {
            elementInfo.properties[prop] = {
                type: 'string',
                values: [{
                    lang: 'en',
                    text: props[prop],
                }],
            };
        }
    }

    return elementInfo;
}

export function getLinkInfo(nLinkInfo: LinkBinding): LinkModel {
    if (!nLinkInfo) { return undefined; }
    return {
        linkTypeId: nLinkInfo[0],
        sourceId: '' + nLinkInfo[1],
        targetId: '' + nLinkInfo[2],
    };
}

const POSSIBLE_LABELS = [
    'name',
    'title',
    'label',
    'organization',
    'company',
    'product',
    'contact',
    'category',
    'address',
];

export function getElementLabel (nElement: ElementBinding) {
    const eModel = nElement[0];
    const props = eModel.data;
    for (const field of POSSIBLE_LABELS) {
        if (props[field]) {
            return props[field];
        }
        for (const prop in props) {
            if (props.hasOwnProperty(prop)) {
                const clearPropId = prop.toLowerCase();
                if (clearPropId.indexOf(field) !== -1) {
                    return props[prop];
                }
            }
        }
    }

    return eModel.metadata.labels.join('_') + '_' + eModel.metadata.id;
};
