import {
    Neo4jResponse,
    ClassBinding,
    ElementBinding,
    LinkBinding,
    LinkTypeBinding,
} from './models';
import {
    Dictionary, LocalizedString, LinkType, ClassModel, ElementModel, LinkModel,
} from '../model';

export const CLASS_URL = 'Class';
export const INSTANCE_OF = 'instanceOf';
export const TYPE_OF = 'typeOf';
export const POSSIBLE_LABELS = [
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

export function getClassTree (response: Neo4jResponse<ClassBinding>): ClassModel[] {
    const tree: ClassModel[] = [];
    const treeNodes = response.data;

    const treeMap: Dictionary<ClassModel> = {};

    for (const nodeBinding of treeNodes) {
        for (const model of _getClassModels(nodeBinding)) {
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

export function getLinkTypes (response: Neo4jResponse<LinkTypeBinding>): LinkType[] {
    const neo4jTypes = response.data;
    const linkTypes: LinkType[] = [];

    linkTypes.push({
        id: INSTANCE_OF,
        label: { values: [_getLocalizedString(INSTANCE_OF)] },
        count: 0,
    });

    linkTypes.push({
        id: TYPE_OF,
        label: { values: [_getLocalizedString(TYPE_OF)] },
        count: 0,
    });

    for (const neo4jLink of neo4jTypes) {
        let link = getLinkType(neo4jLink);
        linkTypes.push(link);
    };

    return linkTypes;
}

export function getElementsInfo (
    response: Neo4jResponse<ElementBinding>, ids: string[]
): Dictionary<ElementModel> {
    const nInstances = response ? response.data : [];
    const instancesMap: Dictionary<ElementModel> = {};

    for (const nElement of nInstances) {
        const newElement = _getElementInfo(nElement);
        instancesMap[newElement.id] = newElement;
    };

    const proccesedIds = Object.keys(instancesMap);
    for (const id of ids) {
        if (proccesedIds.indexOf(id) === -1) {
            instancesMap[id] = {
                id: id,
                label: { values: [_getLocalizedString(id)] },
                types: [CLASS_URL],
                properties: {},
            };
        }
    };

    return instancesMap;
}

export function getLinksInfo (response: Neo4jResponse<LinkBinding>): LinkModel[] {
    const neo4jLinks = response.data;
    const links: LinkModel[] = [];
    neo4jLinks.forEach(nLink => links.push(_getLinkInfo(nLink)));
    return links;
}

export function getGeneralizationLinksInfo (classIds?: string[], elements?: ElementModel[]): LinkModel[] {
    const links: LinkModel[] = [];
    if (elements && classIds) {
        for (const classId of classIds) {
            for (const el of elements) {
                if (el.types.indexOf(classId) !== -1) {
                    links.push({
                        linkTypeId: TYPE_OF,
                        sourceId: classId,
                        targetId: el.id,
                    });
                    links.push({
                        linkTypeId: INSTANCE_OF,
                        sourceId: el.id,
                        targetId: classId,
                    });
                }
            }
        }
    };
    return links;
}

export function getLinksTypesOf (response: Neo4jResponse<LinkTypeBinding>): LinkType[] {
    const neo4jLinks = response.data;
    const linkTypes: LinkType[] = [];
    neo4jLinks.forEach(nLink => linkTypes.push(getLinkType(nLink)));
    return linkTypes;
}

export function getFilteredData (
    response: Neo4jResponse<ElementBinding>, filterKey?: string
): Dictionary<ElementModel> {
    const ne4jElements = response.data;
    const instancesMap: Dictionary<ElementModel> = {};

    for (const nElement of ne4jElements) {
        const newElement = _getElementInfo(nElement, filterKey);
        if (newElement) {
            instancesMap[newElement.id] = newElement;
        }
    };
    return instancesMap;
}

export function getElementTypesAsElements (
    response: Dictionary<ElementModel>
): Dictionary<ElementModel> {
    const instancesMap: Dictionary<ElementModel> = {};

    for (const key in response) {
        if (response.hasOwnProperty(key)) {
            const nElement = response[key];
            for (const type of nElement.types) {
                if (!instancesMap[type]) {
                    const newElement = {
                        id: type,
                        label: { values: [_getLocalizedString(type)] },
                        types: [CLASS_URL],
                        properties: {},
                    };
                    instancesMap[type] = newElement;
                }
            }
        }
    };
    return instancesMap;
}

export function getLinkType (neo4jLink: LinkTypeBinding): LinkType {
    return {
        id: neo4jLink[0],
        label: { values: [_getLocalizedString(neo4jLink[0])] },
        count: neo4jLink[1],
    };
}

function _getLocalizedString (label: string, id?: string): LocalizedString {
    if (label) {
        return {
            text: label,
            lang: '',
        };
    } else {
        return undefined;
    }
}

function _getClassModels (node: ClassBinding): ClassModel[] {
    const models: ClassModel[] = [];
    for (const label of node[0]) {
        models.push({
            id: label,
            children: [],
            label: { values: [_getLocalizedString(label)] },
            count: node[1],
        });
    }
    return models;
}

function _getElementInfo (nElement: ElementBinding, filterKey?: string): ElementModel {
    const label = _getElementLabel(nElement);
    if (filterKey && label.toLowerCase().indexOf(filterKey.toLowerCase()) === -1) {
        return null;
    }
    const eModel = nElement[0];
    const elementInfo: ElementModel = {
        id: eModel.metadata.id.toString(),
        label: { values: [_getLocalizedString(label)] },
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

function _getLinkInfo (nLinkInfo: LinkBinding): LinkModel {
    if (!nLinkInfo) { return undefined; }
    return {
        linkTypeId: nLinkInfo[0],
        sourceId: nLinkInfo[1].toString(),
        targetId: nLinkInfo[2].toString(),
    };
}

function _getElementLabel (nElement: ElementBinding) {
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
