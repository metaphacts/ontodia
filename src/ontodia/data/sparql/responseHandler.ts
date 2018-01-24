import {
    RdfLiteral, isRdfLiteral,
    SparqlResponse, ClassBinding, ElementBinding,
    LinkBinding, isRdfIri, isRdfBlank, RdfIri,
    ElementImageBinding, LinkCountBinding, LinkTypeBinding,
    PropertyBinding, Triple, RdfNode,
} from './sparqlModels';
import {
    Dictionary, LocalizedString, LinkType, ClassModel, ElementModel, LinkModel, Property, PropertyModel, LinkCount,
} from '../model';
import * as _ from 'lodash';

const LABEL_URI = 'http://www.w3.org/2000/01/rdf-schema#label';
const RDF_TYPE_URI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

export function getClassTree(response: SparqlResponse<ClassBinding>): ClassModel[] {
    const tree: ClassModel[] = [];
    const treeNodes = createClassMap(response.results.bindings);
    // createClassMap ensures we get both elements and parents and we can use treeNodes[treeNode.parent] safely
    for (const nodeId in treeNodes) {
        if (!treeNodes.hasOwnProperty(nodeId)) { continue; }
        const treeNode = treeNodes[nodeId];
        if (treeNode.parent) {
            const parent = treeNodes[treeNode.parent];
            parent.children.push(treeNode);
            parent.count += treeNode.count;
        } else {
            tree.push(treeNode);
        }
    }

    calcCounts(tree);

    return tree;
}

function createClassMap(sNodes: ClassBinding[]): Dictionary<HierarchicalClassModel> {
    const treeNodes: Dictionary<HierarchicalClassModel> = {};
    for (const sNode of sNodes) {
        if (!isRdfIri(sNode.class)) { continue; }
        const sNodeId: string = sNode.class.value;
        let node = treeNodes[sNodeId];
        if (node) {
            if (sNode.label) {
                const label = node.label;
                if (label.values.length === 1 && !label.values[0].lang) {
                    label.values = [];
                }
                label.values.push(getLocalizedString(sNode.label));
            }
            if (!node.parent && sNode.parent) {
                node.parent = sNode.parent.value;
            }
        } else {
            node = getClassModel(sNode);
            treeNodes[sNodeId] = node;
        }
        // ensuring parent will always be there
        if (node.parent && !treeNodes[node.parent]) {
            treeNodes[node.parent] = getClassModel({class: {value: node.parent, type: 'uri'}});
        }
    }
    return treeNodes;
}

function calcCounts(children: ClassModel[]) {
    for (let node of children) {
        // no more to count
        if (!node.children) {return; }
        // ensure all children have their counts completed;
        calcCounts(node.children);
        // we have to preserve no data here. If nor element nor childs have no count information,
        // we just pass NaN upwards.
        const childCount = node.children.reduce((acc, val) =>
                // if val.count is not NaN, turn result into number
                !isNaN(val.count) ? (!isNaN(acc) ? acc + val.count : val.count) : acc
            , NaN);
        node.count = !isNaN(childCount) ? (!isNaN(node.count) ? node.count + childCount : childCount) : node.count;
    }
}

export function getClassInfo(response: SparqlResponse<ClassBinding>): ClassModel[] {
    const classes: { [id: string]: ClassModel } = {};
    for (const binding of response.results.bindings) {
        if (!binding.class) { continue; }
        const id = binding.class.value;
        const model = classes[id];
        if (model) {
            const newLabel = getLocalizedString(binding.label);
            if (!model.label.values.some(label => isLocalizedEqual(label, newLabel))) {
                model.label.values.push(newLabel);
            }
            const instanceCount = getInstCount(binding.instcount);
            if (!isNaN(instanceCount)) {
                model.count =  Math.max(model.count, instanceCount);
            }
        } else {
            const label = getLocalizedString(binding.label);
            classes[id] = {
                id,
                children: [],
                label: {values: label ? [label] : []},
                count: getInstCount(binding.instcount),
            };
        }
    }

    const classesList: ClassModel[] = [];
    for (const id in classes) {
        if (!classes.hasOwnProperty(id)) { continue; }
        const model = classes[id];
        if (model.label.values.length === 0) {
            model.label.values.push(getLocalizedString(undefined, id));
        }
        classesList.push(model);
    }

    return classesList;
}

export function getPropertyInfo(response: SparqlResponse<PropertyBinding>): Dictionary<PropertyModel> {
    const models: Dictionary<PropertyModel> = {};
    for (const sProp of response.results.bindings) {
        const model = getPropertyModel(sProp);
        models[model.id] = model;
    }
    return models;
}

export function getLinkTypes(response: SparqlResponse<LinkTypeBinding>): LinkType[] {
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
        } else {
            instancesMap[sInstTypeId] = getLinkTypeInfo(sLink);
            linkTypes.push(instancesMap[sInstTypeId]);
        }

    }

    return linkTypes;
}

export function triplesToElementBinding(
    tripples: Triple[],
): SparqlResponse<ElementBinding> {
    const map: Dictionary<ElementBinding> = {};
    const convertedResponse: SparqlResponse<ElementBinding> = {
        head: {
            vars: [ 'inst', 'class', 'label', 'blankType', 'propType', 'propValue' ],
        },
        results: {
            bindings: [],
        },
    };
    for (const tripple of tripples) {
        const trippleId = tripple.subject.value;
        if (!map[trippleId]) {
            map[trippleId] = createAndPushBinding(tripple);
        }

        if (tripple.predicate.value === LABEL_URI && isRdfLiteral(tripple.object)) { // Label
            if (map[trippleId].label) {
                map[trippleId] = createAndPushBinding(tripple);
            }
            map[trippleId].label = tripple.object;
        } else if ( // Class
            tripple.predicate.value === RDF_TYPE_URI &&
            isRdfIri(tripple.object) && isRdfIri(tripple.predicate)
        ) {
            if (map[trippleId].class) {
                map[trippleId] = createAndPushBinding(tripple);
            }
            map[trippleId].class = tripple.object;
        } else if (isRdfIri(tripple.predicate)) { // Property
            if (map[trippleId].propType) {
                map[trippleId] = createAndPushBinding(tripple);
            }
            map[trippleId].propType = tripple.predicate;
            map[trippleId].propValue = tripple.object;
        }
    }

    function createAndPushBinding(tripple: Triple): ElementBinding {
        const binding: ElementBinding = {
            inst: (tripple.subject as RdfIri),
        };
        convertedResponse.results.bindings.push(binding);
        return binding;
    }

    return convertedResponse;
}

export function getElementsInfo(response: SparqlResponse<ElementBinding>, ids: string[]): Dictionary<ElementModel> {
    const sInstances = response.results.bindings;
    const instancesMap: Dictionary<ElementModel> = {};

    for (const sInst of sInstances) {
        let sInstTypeId = sInst.inst.value;
        if (!instancesMap[sInstTypeId]) {
            instancesMap[sInstTypeId] = emptyElementInfo(sInstTypeId);
        }
        enrichElement(instancesMap[sInstTypeId], sInst);
    }

    return instancesMap;
}

export function getEnrichedElementsInfo(
    response: SparqlResponse<ElementImageBinding>,
    elementsInfo: Dictionary<ElementModel>,
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

export function getLinkTypesInfo(response: SparqlResponse<LinkTypeBinding>): LinkType[] {
    const sparqlLinkTypes = response.results.bindings;
    return sparqlLinkTypes.map((sLinkType: LinkTypeBinding) => getLinkTypeInfo(sLinkType));
}

export function getLinksInfo(response: SparqlResponse<LinkBinding>): LinkModel[] {
    const sparqlLinks = response.results.bindings;
    const linksMap: Dictionary<LinkModel> = {};

    for (const sLink of sparqlLinks) {
        const linkKey = `${sLink.source.value} ${sLink.type.value} ${sLink.target.value}`;

        if (linksMap[linkKey]) {
            // this can only happen due to error in sparql or when merging properties
            if (sLink.propType) {
                mergeProperties(linksMap[linkKey].properties, sLink.propType, sLink.propValue);
            }
        } else {
            linksMap[linkKey] = getLinkInfo(sLink);
        }
    }

    return _.values(linksMap);
}

export function getLinksTypesOf(response: SparqlResponse<LinkCountBinding>): LinkCount[] {
    const sparqlLinkTypes = response.results.bindings.filter(b => !isRdfBlank(b.link));
    return sparqlLinkTypes.map((sLink: LinkCountBinding) => getLinkCount(sLink));
}

export function getFilteredData(response: SparqlResponse<ElementBinding>): Dictionary<ElementModel> {
    const sInstances = response.results.bindings;
    const instancesMap: Dictionary<ElementModel> = {};

    for (const sInst of sInstances) {
        if (!isRdfIri(sInst.inst) && !isRdfBlank(sInst.inst)) {
            continue;
        }
        if (!instancesMap[sInst.inst.value]) {
            instancesMap[sInst.inst.value] = emptyElementInfo(sInst.inst.value);
        }
        enrichElement(instancesMap[sInst.inst.value], sInst);
    }
    return instancesMap;
}

/**
 * Modifies properties with merging with new values, couls be new peroperty or new value for existing properties.
 * @param properties
 * @param propType
 * @param propValue
 */
function mergeProperties(properties: { [id: string]: Property }, propType: RdfIri, propValue: RdfNode) {
    let property: Property = properties[propType.value];
    if (!property) {
        property = properties[propType.value] = {
            type: 'string', // sInst.propType.value,
            values: [],
        };
    }
    const propertyValue = getPropertyValue(propValue);
    if (property.values.every(value => !isLocalizedEqual(value, propertyValue))) {
        property.values.push(propertyValue);
    }
}

export function enrichElement(element: ElementModel, sInst: ElementBinding) {
    if (!element) { return; }
    if (sInst.label) {
        const localized = getLocalizedString(sInst.label);

        const currentLabels = element.label.values;
        const isAutogeneratedLabel = currentLabels.length === 1 &&
            !currentLabels[0].lang && currentLabels[0].text === getNameFromId(element.id);

        if (isAutogeneratedLabel) {
            element.label.values = [localized];
        } else if (element.label.values.every(value => !isLocalizedEqual(value, localized))) {
            element.label.values.push(localized);
        }
    }
    if (sInst.class && element.types.indexOf(sInst.class.value) < 0) {
        element.types.push(sInst.class.value);
    }
    if (sInst.propType && sInst.propType.value !== LABEL_URI) {
        mergeProperties(element.properties, sInst.propType, sInst.propValue);
    }
}

function isLocalizedEqual(left: LocalizedString, right: LocalizedString) {
    return left.lang === right.lang && left.text === right.text;
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

export function getLocalizedString(label?: RdfLiteral, id?: string): LocalizedString {
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

export function getInstCount(instcount: RdfLiteral): number {
    return (instcount ? +instcount.value : NaN);
}

/**
 * This extension of ClassModel is used only in processing, parent links are not needed in UI (yet?)
 */
export interface HierarchicalClassModel extends ClassModel {
    parent: string;
}

export function getClassModel(node: ClassBinding): HierarchicalClassModel {
    return {
        id: node.class.value,
        children: [],
        label: { values: [getLocalizedString(node.label, node.class.value)] },
        count: getInstCount(node.instcount),
        parent: node.parent ? node.parent.value : undefined,
    };
}

export function getPropertyModel(node: PropertyBinding): PropertyModel {
    return {
        id: node.prop.value,
        label: { values: [getLocalizedString(node.label, node.prop.value)] },
    };
}

export function getLinkCount(sLinkType: LinkCountBinding): LinkCount {
    return {
        id: sLinkType.link.value,
        inCount: getInstCount(sLinkType.inCount),
        outCount: getInstCount(sLinkType.outCount),
    };
}

export function getPropertyValue(propValue?: RdfNode): LocalizedString {
    if (!propValue) { return undefined; }
    return {
        lang: (propValue as RdfLiteral)['xml:lang'] ,
        text: propValue.value,
    };
}

export function emptyElementInfo(id: string): ElementModel {
    const elementInfo: ElementModel = {
        id: id,
        label: { values: [{
            text: getNameFromId(id),
            lang: '',
        }] },
        types: [],
        properties: {},
    };
    return elementInfo;
}

export function getLinkInfo(sLinkInfo: LinkBinding): LinkModel {
    if (!sLinkInfo) { return undefined; }
    const linkModel: LinkModel = {
        linkTypeId: sLinkInfo.type.value,
        sourceId: sLinkInfo.source.value,
        targetId: sLinkInfo.target.value,
        properties: {},
    };
    if (sLinkInfo.propType && sLinkInfo.propValue) {
        linkModel.properties[sLinkInfo.propType.value] = {
            type: 'string',
            values: [getPropertyValue(sLinkInfo.propValue)],
        };
    }
    return linkModel;
}

export function getLinkTypeInfo(sLinkInfo: LinkTypeBinding): LinkType {
    if (!sLinkInfo) { return undefined; }
    return {
        id: sLinkInfo.link.value,
        label: { values: [getLocalizedString(sLinkInfo.label, sLinkInfo.link.value)] },
        count: getInstCount(sLinkInfo.instcount),
    };
}
