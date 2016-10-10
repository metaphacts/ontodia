import * as Sparql from './sparqlModels';
import {
    Dictionary, LocalizedString, LinkType, ClassModel, ElementModel, LinkModel, Property,
} from '../model';

const THING_URI = 'http://www.w3.org/2002/07/owl#Thing';
const LABEL_URI = 'http://www.w3.org/2000/01/rdf-schema#label';

export function getClassTree(response: Sparql.TreeResponse): ClassModel[] {
    const sNodes = response.results.bindings;
    const tree: ClassModel[] = [];
    const createdTreeNodes: Dictionary<ClassModel> = {};
    const tempNodes: Dictionary<ClassModel> = {};

    for (const sNode of sNodes) {
        const sNodeId: string = sNode.class.value;
        if (createdTreeNodes[sNodeId]) {
            if (sNode.label) {
                const label = createdTreeNodes[sNodeId].label;
                if (label.values.length === 1 && !label.values[0].lang) {
                    label.values = [];
                }
                label.values.push(getLocalizedString(sNode.label));
            }
            if (sNode.instcount && createdTreeNodes[sNodeId].count === 0) {
                createdTreeNodes[sNodeId].count = getInstCount(sNode.instcount);
            }
        } else {
            const newNode = getClassModel(sNode);
            createdTreeNodes[sNodeId] = newNode;

            if (sNode.parent) {
                const sParentNodeId: string = sNode.parent.value;
                let parentNode: ClassModel;

                // if we put the parent node in first time we create it, 
                // then we miss the count value
                // That's why we put the temp parent node in another list in first time
                if (!createdTreeNodes[sParentNodeId]) {
                    if (!tempNodes[sParentNodeId]) {
                        parentNode = getClassModel({ class: sNode.parent });
                    } else {
                        parentNode = tempNodes[sParentNodeId];
                    }
                    tempNodes[sParentNodeId]  = parentNode;
                } else {
                    parentNode = createdTreeNodes[sParentNodeId];
                }

                parentNode.children.push(newNode);
                parentNode.count += newNode.count;
            } else {
                tree.push(newNode);
                if (tempNodes[sNodeId]) {
                    newNode.count += tempNodes[sNodeId].count;
                    newNode.children = tempNodes[sNodeId].children;
                }
            }
        }
    };

    if (!createdTreeNodes[THING_URI]) {
        tree.push({
            id: THING_URI,
            children: [],
            label: { values: [getLocalizedString(undefined, THING_URI)] },
            count: 0,
        });
    }

    return tree;
}

export function getLinkTypes(response: Sparql.LinkTypesResponse): LinkType[] {
    const sInst = response.results.bindings;
    const linkTypes: LinkType[] = [];
    const instancesMap: Dictionary<LinkType> = {};

    for (const sLink of sInst) {
        let sInstTypeId: string = sLink.link.value;

        if (instancesMap[sInstTypeId]) {
            if (sLink.label) {
                const label = instancesMap[sInstTypeId].label;
                if (label.values.length === 1 && !label.values[0].lang) {
                    label.values = [];
                }
                label.values.push(getLocalizedString(sLink.label));
            }
            if (sLink.instcount) {
                instancesMap[sInstTypeId].count = getInstCount(sLink.instcount);
            }
        } else {
            instancesMap[sInstTypeId] = getLinkType(sLink);
            linkTypes.push(instancesMap[sInstTypeId]);
        }

    };

    return linkTypes;
}

export function getElementsInfo(response: Sparql.ElementsInfoResponse, ids: string[]): Dictionary<ElementModel> {
    const sInstances = response.results.bindings;
    const instancesMap: Dictionary<ElementModel> = {};

    for (const sInst of sInstances) {
        let sInstTypeId: string = sInst.inst.value;

        if (instancesMap[sInstTypeId]) {
            enrichElement(instancesMap[sInst.inst.value], sInst);
        } else {
            instancesMap[sInstTypeId] = getElementInfo(sInst);
        }
    };

    const proccesedIds = Object.keys(instancesMap);
    for (const id of ids) {
        if (proccesedIds.indexOf(id) === -1) {
            instancesMap[id] = {
                id: id,
                label: { values: [getLocalizedString(undefined, id)] },
                types: [THING_URI],
                properties: {},
            };
        }
    };

    return instancesMap;
}

export function getEnrichedElementsInfo(
    response: Sparql.ImageResponse,
    elementsInfo: Dictionary<ElementModel>
): Dictionary<ElementModel> {
    const respElements = response.results.bindings;
    for (const respEl of respElements) {
        const elementInfo = elementsInfo[respEl.inst.value];
        if (elementInfo) {
            elementInfo.image = respEl.image.value;
        }
    }
    return elementsInfo;
}

export function getLinkTypesInfo(response: Sparql.LinkTypesInfoResponse): LinkType[] {
    const sparqlLinkTypes = response.results.bindings;
    return sparqlLinkTypes.map((sLinkType: Sparql.LinkTypeInfo) => getLinkTypeInfo(sLinkType));
}

export function getLinksInfo(response: Sparql.LinksInfoResponse): LinkModel[] {
    const sparqlLinks = response.results.bindings;
    return sparqlLinks.map((sLink: Sparql.LinkInfo) => getLinkInfo(sLink));
}

export function getLinksTypesOf(response: Sparql.LinkTypesOfResponse): LinkType[] {
    const sparqlLinkTypes = response.results.bindings;
    return sparqlLinkTypes.map((sLink: Sparql.LinkType) => getLinkType(sLink));
}

export function getFilteredData(response: Sparql.FilterResponse): Dictionary<ElementModel> {
    const sInstances = response.results.bindings;
    const instancesMap: Dictionary<ElementModel> = {};

    for (const sInst of sInstances) {
        if (sInst.inst.type === 'literal') {
            continue;
        }
        if (!instancesMap[sInst.inst.value]) {
            instancesMap[sInst.inst.value] = getElementInfo(sInst);
        } else {
            enrichElement(instancesMap[sInst.inst.value], sInst);
        }
    };
    return instancesMap;
}

export function enrichElement(element: ElementModel, sInst: Sparql.ElementInfo) {
    if (!element) {
        return;
    }
    if (sInst.label) {
        const label = element.label;
        if (label.values.length === 1 && !label.values[0].lang) {
            label.values = [];
        }
        label.values.push(getLocalizedString(sInst.label));
    }
    if (sInst.class && element.types.indexOf(sInst.class.value) < 0) {
        element.types.push(sInst.class.value);
    }
    if (sInst.propType && sInst.propType.value !== LABEL_URI) {
        if (!element.properties[sInst.propType.value]) {
            element.properties[sInst.propType.value] = [];
        }
        element
            .properties[sInst.propType.value]
            .push(getPropertyValue(sInst.propValue));
    }
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

export function getLocalizedString(label?: Sparql.Label, id?: string): LocalizedString {
    if (label) {
        return {
            text: label.value,
            lang: label['xml:lang'],
        };
    } else if (id) {
        return {
            text: getNameFromId(id),
            lang: '',
        };
    } else {
        return undefined;
    }
}

export function getInstCount(instcount: Sparql.TypedField): number {
    return (instcount ? +instcount.value : 0);
}

export function getClassModel(node: Sparql.TreeNode): ClassModel {
    return {
        id: node.class.value,
        children: [],
        label: { values: [getLocalizedString(node.label, node.class.value)] },
        count: getInstCount(node.instcount),
    };
}

export function getLinkType(sLinkType: Sparql.LinkType): LinkType {
    return {
        id: sLinkType.link.value,
        label: { values: [getLocalizedString(sLinkType.label, sLinkType.link.value)] },
        count: getInstCount(sLinkType.instcount),
    };
}

export function getPropertyValue(propValue?: Sparql.TypedField): Property {
    if (!propValue) { return undefined; }
    return {
        type: 'string',
        value: { lang: '', text: propValue.value }
    };
}

export function getElementInfo(sInfo: Sparql.ElementInfo): ElementModel {

    const elementInfo: ElementModel = {
        id: sInfo.inst.value,
        label: { values: [getLocalizedString(sInfo.label, sInfo.inst.value)] },
        types: (sInfo.class ? [ sInfo.class.value ] : []),
        properties: {}
    };
    if (sInfo.propType && sInfo.propType.value !== LABEL_URI) {
        elementInfo.properties[sInfo.propType.value] = [getPropertyValue(sInfo.propValue)];
    }

    return elementInfo;
}

export function getLinkInfo(sLinkInfo: Sparql.LinkInfo): LinkModel {
    if (!sLinkInfo) { return undefined; }
    return {
        linkTypeId: sLinkInfo.type.value,
        sourceId: sLinkInfo.source.value,
        targetId: sLinkInfo.target.value,
    };
}

export function getLinkTypeInfo(sLinkInfo: Sparql.LinkTypeInfo): LinkType {
    if (!sLinkInfo) { return undefined; }
    return {
        id: sLinkInfo.typeId.value,
        label: { values: [getLocalizedString(sLinkInfo.label, sLinkInfo.typeId.value)] },
        count: getInstCount(sLinkInfo.instcount),
    };
}
