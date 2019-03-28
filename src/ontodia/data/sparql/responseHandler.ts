import {
    RdfLiteral, isRdfLiteral,
    SparqlResponse, ClassBinding, ElementBinding,
    LinkBinding, isRdfIri, isRdfBlank, RdfIri,
    ElementImageBinding, LinkCountBinding, LinkTypeBinding,
    PropertyBinding, Triple, RdfNode,
} from './sparqlModels';
import {
    Dictionary, LocalizedString, LinkType, ClassModel, ElementModel, LinkModel, Property, PropertyModel, LinkCount,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri, isIriProperty, isLiteralProperty,
} from '../model';
import * as _ from 'lodash';

const LABEL_URI = 'http://www.w3.org/2000/01/rdf-schema#label';
const RDF_TYPE_URI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

export function getClassTree(response: SparqlResponse<ClassBinding>): ClassModel[] {
    const tree: ClassModel[] = [];
    const treeNodes = createClassMap(response.results.bindings);
    // createClassMap ensures we get both elements and parents and we can use treeNodes[treeNode.parent] safely
    treeNodes.forEach(node => {
        if (node.parents.size > 0) {
            node.parents.forEach(parent => {
                treeNodes.get(parent).children.push(node);
            });
        } else {
            tree.push(node);
        }
        node.parents = undefined;
    });

    calculateCounts(tree);
    return tree;
}

/**
 * This extension of ClassModel is used only in processing, parent links are not needed in UI (yet?)
 */
interface HierarchicalClassModel extends ClassModel {
    parents?: Set<ElementTypeIri>;
}

function createClassMap(bindings: ClassBinding[]): Map<ElementTypeIri, HierarchicalClassModel> {
    const treeNodes = new Map<ElementTypeIri, HierarchicalClassModel>();

    for (const binding of bindings) {
        if (!isRdfIri(binding.class)) { continue; }
        const classIri = binding.class.value as ElementTypeIri;

        let node = treeNodes.get(classIri);
        if (!node) {
            node = createEmptyModel(classIri);
            treeNodes.set(classIri, node);
        }

        if (binding.label) {
            appendLabel(node.label, getLocalizedString(binding.label));
        }
        if (binding.parent) {
            const parentIri = binding.parent.value as ElementTypeIri;
            node.parents.add(parentIri);
        }
        if (binding.instcount) {
            node.count = getInstCount(binding.instcount);
        }
    }

    // ensuring parent will always be there
    for (const binding of bindings) {
        if (binding.parent) {
            const parentIri = binding.parent.value as ElementTypeIri;
            if (!treeNodes.has(parentIri)) {
                treeNodes.set(parentIri, createEmptyModel(parentIri));
            }
        }
    }

    function createEmptyModel(iri: ElementTypeIri): HierarchicalClassModel {
        return {
            id: iri as ElementTypeIri,
            children: [],
            label: {values: []},
            count: undefined,
            parents: new Set<ElementTypeIri>(),
        };
    }

    return treeNodes;
}

function calculateCounts(children: ClassModel[]) {
    for (const node of children) {
        // no more to count
        if (!node.children) {return; }
        // ensure all children have their counts completed;
        calculateCounts(node.children);
        // we have to preserve no data here. If nor element nor childs have no count information,
        // we just pass undefined upwards.
        let childCount: number;

        node.children.forEach(({count}) => {
            if (count === undefined) { return; }

            childCount = childCount === undefined ? count : childCount + count;
        });

        if (childCount !== undefined) {
            node.count = node.count === undefined ? childCount : node.count + childCount;
        }
    }
}

export function getClassInfo(response: SparqlResponse<ClassBinding>): ClassModel[] {
    const classes: { [id: string]: ClassModel } = {};
    for (const binding of response.results.bindings) {
        if (!binding.class) { continue; }
        const id = binding.class.value as ElementTypeIri;
        const model = classes[id];
        if (model) {
            appendLabel(model.label, getLocalizedString(binding.label));
            const instanceCount = getInstCount(binding.instcount);
            if (instanceCount !== undefined) {
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
        classesList.push(model);
    }

    return classesList;
}

export function getPropertyInfo(response: SparqlResponse<PropertyBinding>): Dictionary<PropertyModel> {
    const models: Dictionary<PropertyModel> = {};

    for (const sProperty of response.results.bindings) {
        const sPropertyTypeId = sProperty.prop.value as PropertyTypeIri;
        if (models[sPropertyTypeId]) {
            if (sProperty.label) {
                const label = models[sPropertyTypeId].label;
                if (label.values.length === 1 && !label.values[0].lang) {
                    label.values = [];
                }
                label.values.push(getLocalizedString(sProperty.label));
            }
        } else {
            models[sPropertyTypeId] = getPropertyModel(sProperty);
        }
    }
    return models;
}

export function getLinkTypes(response: SparqlResponse<LinkTypeBinding>): LinkType[] {
    const sInst = response.results.bindings;
    const linkTypes: LinkType[] = [];
    const linkTypesMap: Dictionary<LinkType> = {};

    for (const sLink of sInst) {
        const sInstTypeId = sLink.link.value as LinkTypeIri;
        if (linkTypesMap[sInstTypeId]) {
            if (sLink.label) {
                const label = linkTypesMap[sInstTypeId].label;
                if (label.values.length === 1 && !label.values[0].lang) {
                    label.values = [];
                }
                label.values.push(getLocalizedString(sLink.label));
            }
        } else {
            linkTypesMap[sInstTypeId] = getLinkTypeInfo(sLink);
            linkTypes.push(linkTypesMap[sInstTypeId]);
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
        } else if (!isRdfBlank(tripple.object) && isRdfIri(tripple.predicate)) { // Property
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
        const sInstTypeId = sInst.inst.value as ElementIri;
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

export function getLinksTypeIds(response: SparqlResponse<LinkTypeBinding>): LinkTypeIri[] {
    const sparqlLinkTypes = response.results.bindings.filter(b => !isRdfBlank(b.link));
    return sparqlLinkTypes.map((sLink: LinkTypeBinding) => sLink.link.value as LinkTypeIri);
}

export function getLinkStatistics(response: SparqlResponse<LinkCountBinding>): LinkCount {
    const sparqlLinkCount = response.results.bindings.filter(b => !isRdfBlank(b.link))[0];
    return  getLinkCount(sparqlLinkCount);
}

export function getFilteredData(response: SparqlResponse<ElementBinding>): Dictionary<ElementModel> {
    const sInstances = response.results.bindings;
    const instancesMap: Dictionary<ElementModel> = {};

    for (const sInst of sInstances) {
        if (!isRdfIri(sInst.inst) && !isRdfBlank(sInst.inst)) {
            continue;
        }
        const iri = sInst.inst.value as ElementIri;
        if (!instancesMap[iri]) {
            instancesMap[iri] = emptyElementInfo(iri);
        }
        enrichElement(instancesMap[iri], sInst);
    }
    return instancesMap;
}

/**
 * Modifies properties with merging with new values, couls be new peroperty or new value for existing properties.
 * @param properties
 * @param propType
 * @param propValue
 */
function mergeProperties(properties: { [id: string]: Property }, propType: RdfIri, propValue: RdfIri | RdfLiteral) {
    let property = properties[propType.value];
    if (isRdfIri(propValue)) {
        if (!property) {
            property = {type: 'uri', values: []};
        }
        if (isIriProperty(property) && property.values.every(({value}) => value !== propValue.value)) {
            property.values = [...property.values, propValue];
        }
    } else if (isRdfLiteral(propValue)) {
        if (!property) {
            property = {type: 'string', values: []};
        }
        const propertyValue = getLocalizedString(propValue);
        if (isLiteralProperty(property) && property.values.every(value => !isLocalizedEqual(value, propertyValue))) {
            property.values = [...property.values, propertyValue];
        }
    }
    properties[propType.value] = property;
}

export function enrichElement(element: ElementModel, sInst: ElementBinding) {
    if (!element) { return; }
    if (sInst.label) {
        const label = getLocalizedString(sInst.label);
        const currentLabels = element.label.values;

        if (element.label.values.every(value => !isLocalizedEqual(value, label))) {
            element.label.values.push(label);
        }
    }
    if (sInst.class && element.types.indexOf(sInst.class.value as ElementTypeIri) < 0) {
        element.types.push(sInst.class.value as ElementTypeIri);
    }
    if (sInst.propType && sInst.propType.value !== LABEL_URI) {
        mergeProperties(element.properties, sInst.propType, sInst.propValue);
    }
}

function appendLabel(container: { values: LocalizedString[] }, newLabel: LocalizedString | undefined) {
    if (!newLabel) { return; }
    for (const existing of container.values) {
        if (isLocalizedEqual(existing, newLabel)) { return; }
    }
    container.values.push(newLabel);
}

function isLocalizedEqual(left: LocalizedString, right: LocalizedString) {
    return left.lang === right.lang && left.text === right.text;
}

export function getLocalizedString(label: RdfLiteral): LocalizedString | undefined {
    if (label) {
        return {
            text: label.value,
            lang: label['xml:lang'],
            datatype: label.datatype,
        };
    } else {
        return undefined;
    }
}

export function getInstCount(instcount: RdfLiteral): number | undefined {
    return (instcount ? +instcount.value : undefined);
}

export function getPropertyModel(node: PropertyBinding): PropertyModel {
    const label = getLocalizedString(node.label);
    return {
        id: node.prop.value as PropertyTypeIri,
        label: { values: label ? [label] : [] },
    };
}

export function getLinkCount(sLinkType: LinkCountBinding): LinkCount {
    return {
        id: sLinkType.link.value as LinkTypeIri,
        inCount: getInstCount(sLinkType.inCount),
        outCount: getInstCount(sLinkType.outCount),
    };
}

export function emptyElementInfo(id: ElementIri): ElementModel {
    const elementInfo: ElementModel = {
        id: id,
        label: { values: [] },
        types: [],
        properties: {},
    };
    return elementInfo;
}

export function getLinkInfo(sLinkInfo: LinkBinding): LinkModel {
    if (!sLinkInfo) { return undefined; }
    const linkModel: LinkModel = {
        linkTypeId: sLinkInfo.type.value as LinkTypeIri,
        sourceId: sLinkInfo.source.value as ElementIri,
        targetId: sLinkInfo.target.value as ElementIri,
        properties: {},
    };
    if (sLinkInfo.propType && sLinkInfo.propValue) {
        linkModel.properties[sLinkInfo.propType.value] = {
            type: 'string',
            values: [getLocalizedString(sLinkInfo.propValue)],
        };
    }
    return linkModel;
}

export function getLinkTypeInfo(sLinkInfo: LinkTypeBinding): LinkType {
    if (!sLinkInfo) { return undefined; }
    const label = getLocalizedString(sLinkInfo.label);
    return {
        id: sLinkInfo.link.value as LinkTypeIri,
        label: {values: label ? [label] : []},
        count: getInstCount(sLinkInfo.instcount),
    };
}
