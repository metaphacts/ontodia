import { LinkConfiguration, PropertyConfiguration } from './sparqlDataProviderSettings';
import {
    RdfLiteral, isRdfLiteral,
    SparqlResponse, ClassBinding, ElementBinding,
    LinkBinding, isRdfIri, isRdfBlank, RdfIri,
    ElementImageBinding, LinkCountBinding, LinkTypeBinding,
    PropertyBinding, ElementTypeBinding, FilterBinding, Triple,
} from './sparqlModels';
import {
    Dictionary, LocalizedString, LinkType, ClassModel, ElementModel, LinkModel, Property, PropertyModel, LinkCount,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri, isIriProperty, isLiteralProperty, sameLink, hashLink
} from '../model';
import { HashMap, getOrCreateSetInMap } from '../../viewUtils/collections';

const LABEL_URI = 'http://www.w3.org/2000/01/rdf-schema#label';
const RDF_TYPE_URI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

const EMPTY_MAP: ReadonlyMap<any, any> = new Map();

export function getClassTree(response: SparqlResponse<ClassBinding>): ClassModel[] {
    const treeNodes = createClassMap(response.results.bindings);
    const allNodes: ClassModel[] = [];

    // createClassMap ensures we get both elements and parents and we can use treeNodes[treeNode.parent] safely
    treeNodes.forEach(node => {
        allNodes.push(node);
        node.parents.forEach(parent => {
            treeNodes.get(parent).children.push(node);
        });
        node.parents = undefined;
    });

    const withoutCycles = breakCyclesAndCalculateCounts(allNodes);
    const leafs = new Set<ElementTypeIri>();
    for (const node of withoutCycles) {
        for (const child of node.children) {
            leafs.add(child.id);
        }
    }

    const tree = withoutCycles.filter(node => !leafs.has(node.id));
    return tree;
}

export function flattenClassTree(classTree: ReadonlyArray<ClassModel>) {
    const all: ClassModel[] = [];
    const visitClasses = (classes: ReadonlyArray<ClassModel>) => {
        for (const model of classes) {
            all.push(model);
            visitClasses(model.children);
        }
    };
    visitClasses(classTree);
    return all;
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

function breakCyclesAndCalculateCounts(tree: ClassModel[]): ClassModel[] {
    const visiting = new Set<ElementTypeIri>();

    function reduceChildren(acc: ClassModel[], node: ClassModel): ClassModel[] {
        if (visiting.has(node.id)) {
            // prevent unbounded recursion
            return acc;
        }
        // no more to count
        if (!node.children) {return; }
        // ensure all children have their counts completed;
        visiting.add(node.id);
        node.children = node.children.reduce(reduceChildren, []);
        visiting.delete(node.id);
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

        acc.push(node);
        return acc;
    }

    return tree.reduce(reduceChildren, []);
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
        const sPropertyTypeId = sProperty.property.value as PropertyTypeIri;
        if (models[sPropertyTypeId]) {
            if (sProperty.label) {
                const label = models[sPropertyTypeId].label;
                if (label.values.length === 1 && !label.values[0].language) {
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
                if (label.values.length === 1 && !label.values[0].language) {
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
    triples: Triple[],
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
    for (const triple of triples) {
        const trippleId = triple.subject.value;
        if (!map[trippleId]) {
            map[trippleId] = createAndPushBinding(triple);
        }

        if (triple.predicate.value === LABEL_URI && isRdfLiteral(triple.object)) { // Label
            if (map[trippleId].label) {
                map[trippleId] = createAndPushBinding(triple);
            }
            map[trippleId].label = triple.object;
        } else if ( // Class
            triple.predicate.value === RDF_TYPE_URI &&
            isRdfIri(triple.object) && isRdfIri(triple.predicate)
        ) {
            if (map[trippleId].class) {
                map[trippleId] = createAndPushBinding(triple);
            }
            map[trippleId].class = triple.object;
        } else if (!isRdfBlank(triple.object) && isRdfIri(triple.predicate)) { // Property
            if (map[trippleId].propType) {
                map[trippleId] = createAndPushBinding(triple);
            }
            map[trippleId].propType = triple.predicate;
            map[trippleId].propValue = triple.object;
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

export function getElementsInfo(
    response: SparqlResponse<ElementBinding>,
    types: ReadonlyMap<ElementIri, ReadonlySet<ElementTypeIri>> = EMPTY_MAP,
    propertyByPredicate: ReadonlyMap<string, readonly PropertyConfiguration[]> = EMPTY_MAP,
    openWorldProperties = true,
): Dictionary<ElementModel> {
    const instancesMap: Dictionary<ElementModel> = {};

    for (const binding of response.results.bindings) {
        if (!isRdfIri(binding.inst)) { continue; }
        const iri = binding.inst.value as ElementIri;
        let model = instancesMap[iri];
        if (!model) {
            model = emptyElementInfo(iri);
            instancesMap[iri] = model;
        }
        enrichElement(model, binding);
    }

    if (!openWorldProperties || propertyByPredicate.size > 0) {
        for (const iri in instancesMap) {
            if (!Object.hasOwnProperty.call(instancesMap, iri)) { continue; }
            const model = instancesMap[iri];
            const modelTypes = types.get(model.id);
            model.properties = mapPropertiesByConfig(
                model, modelTypes, propertyByPredicate, openWorldProperties
            );
        }
    }

    return instancesMap;
}

function mapPropertiesByConfig(
    model: ElementModel,
    modelTypes: ReadonlySet<ElementTypeIri> | undefined,
    propertyByPredicate: ReadonlyMap<string, readonly PropertyConfiguration[]>,
    openWorldProperties: boolean
): ElementModel['properties'] {
    const mapped: ElementModel['properties'] = {};
    for (const propertyIri in model.properties) {
        if (!Object.hasOwnProperty.call(model.properties, propertyIri)) { continue; }
        const properties = propertyByPredicate.get(propertyIri);
        if (properties && properties.length > 0) {
            for (const property of properties) {
                if (typeMatchesDomain(property, modelTypes)) {
                    mapped[property.id] = model.properties[propertyIri];
                }
            }
        } else if (openWorldProperties) {
            mapped[propertyIri] = model.properties[propertyIri];
        }
    }
    return mapped;
}

export function enrichElementsWithImages(
    response: SparqlResponse<ElementImageBinding>,
    elementsInfo: Dictionary<ElementModel>,
): void {
    const respElements = response.results.bindings;
    for (const respEl of respElements) {
        const elementInfo = elementsInfo[respEl.inst.value];
        if (elementInfo) {
            elementInfo.image = respEl.image.value;
        }
    }
}

export function getElementTypes(
    response: SparqlResponse<ElementTypeBinding>
): Map<ElementIri, Set<ElementTypeIri>> {
    const types = new Map<ElementIri, Set<ElementTypeIri>>();
    for (const binding of response.results.bindings) {
        if (isRdfIri(binding.inst) && isRdfIri(binding.class)) {
            const element = binding.inst.value as ElementIri;
            const type = binding.class.value as ElementTypeIri;
            getOrCreateSetInMap(types, element).add(type);
        }
    }
    return types;
}

export function getLinksInfo(
    response: SparqlResponse<LinkBinding>,
    types: ReadonlyMap<ElementIri, ReadonlySet<ElementTypeIri>> = EMPTY_MAP,
    linkByPredicateType: ReadonlyMap<string, readonly LinkConfiguration[]> = EMPTY_MAP,
    openWorldLinks: boolean = true
): LinkModel[] {
    const sparqlLinks = response.results.bindings;
    const links = new HashMap<LinkModel, LinkModel>(hashLink, sameLink);

    for (const binding of sparqlLinks) {
        const model: LinkModel = {
            sourceId: binding.source.value as ElementIri,
            linkTypeId: binding.type.value as LinkTypeIri,
            targetId: binding.target.value as ElementIri,
            properties: {},
        };
        if (links.has(model)) {
            // this can only happen due to error in sparql or when merging properties
            if (binding.propType) {
                const existing = links.get(model);
                mergeProperties(existing.properties, binding.propType, binding.propValue);
            }
        } else {
            if (binding.propType) {
                mergeProperties(model.properties, binding.propType, binding.propValue);
            }
            const linkConfigs = linkByPredicateType.get(model.linkTypeId);
            if (linkConfigs && linkConfigs.length > 0) {
                for (const linkConfig of linkConfigs) {
                    if (typeMatchesDomain(linkConfig, types.get(model.sourceId))) {
                        const mappedModel: LinkModel = isDirectLink(linkConfig)
                            ? {...model, linkTypeId: linkConfig.id as LinkTypeIri} : model;
                        links.set(mappedModel, mappedModel);
                    }
                }
            } else if (openWorldLinks) {
                links.set(model, model);
            }
        }
    }

    const linkArray: LinkModel[] = [];
    links.forEach(value => linkArray.push(value));
    return linkArray;
}

export function getLinksTypesOf(response: SparqlResponse<LinkCountBinding>): LinkCount[] {
    const sparqlLinkTypes = response.results.bindings.filter(b => !isRdfBlank(b.link));
    return sparqlLinkTypes.map((sLink: LinkCountBinding) => getLinkCount(sLink));
}

export function getLinksTypeIds(
    response: SparqlResponse<LinkTypeBinding>,
    linkByPredicateType: ReadonlyMap<string, readonly LinkConfiguration[]> = EMPTY_MAP,
    openWorldLinks: boolean = true
): LinkTypeIri[] {
    const linkTypes: LinkTypeIri[] = [];
    for (const binding of response.results.bindings) {
        if (!isRdfIri(binding.link)) { continue; }
        const linkConfigs = linkByPredicateType.get(binding.link.value);
        if (linkConfigs && linkConfigs.length > 0) {
            for (const linkConfig of linkConfigs) {
                const mappedLinkType = isDirectLink(linkConfig)
                    ? linkConfig.id : binding.link.value;
                linkTypes.push(mappedLinkType as LinkTypeIri);
            }
        } else if (openWorldLinks) {
            linkTypes.push(binding.link.value as LinkTypeIri);
        }
    }
    return linkTypes;
}

export function getLinkStatistics(response: SparqlResponse<LinkCountBinding>): LinkCount | undefined {
    for (const binding of response.results.bindings) {
        if (isRdfIri(binding.link)) {
            return getLinkCount(binding);
        }
    }
    return undefined;
}

export function getFilteredData(
    response: SparqlResponse<ElementBinding & FilterBinding>,
    sourceTypes?: ReadonlySet<ElementTypeIri>,
    linkByPredicateType: ReadonlyMap<string, readonly LinkConfiguration[]> = EMPTY_MAP,
    openWorldLinks: boolean = true
): Dictionary<ElementModel> {
    const instancesMap: Dictionary<ElementModel> = {};
    const resultTypes = new Map<ElementIri, Set<ElementTypeIri>>();
    const outPredicates = new Map<ElementIri, Set<string>>();
    const inPredicates = new Map<ElementIri, Set<string>>();

    for (const binding of response.results.bindings) {
        if (!isRdfIri(binding.inst) && !isRdfBlank(binding.inst)) {
            continue;
        }

        const iri = binding.inst.value as ElementIri;
        let model = instancesMap[iri];
        if (!model) {
            model = emptyElementInfo(iri);
            instancesMap[iri] = model;
        }
        enrichElement(model, binding);

        if (isRdfIri(binding.classAll)) {
            getOrCreateSetInMap(resultTypes, iri).add(binding.classAll.value as ElementTypeIri);
        }

        if (!openWorldLinks && binding.link && binding.direction) {
            const predicates = binding.direction.value === 'out' ? outPredicates : inPredicates;
            getOrCreateSetInMap(predicates, model.id).add(binding.link.value);
        }
    }

    if (!openWorldLinks) {
        for (const id of Object.keys(instancesMap)) {
            const model = instancesMap[id];
            const targetTypes = resultTypes.get(model.id);
            const doesMatchesDomain = (
                matchesDomainForLink(sourceTypes, outPredicates.get(model.id), linkByPredicateType) &&
                matchesDomainForLink(targetTypes, inPredicates.get(model.id), linkByPredicateType)
            );
            if (!doesMatchesDomain) {
                delete instancesMap[id];
            }
        }
    }

    return instancesMap;
}

function matchesDomainForLink(
    types: ReadonlySet<ElementTypeIri> | undefined,
    predicates: Set<string> | undefined,
    linkByPredicateType: ReadonlyMap<string, readonly LinkConfiguration[]>
) {
    if (!predicates) { return true; }

    let hasMatch = false;
    predicates.forEach(predicate => {
        const matched = linkByPredicateType.get(predicate);
        if (matched) {
            for (const link of matched) {
                if (typeMatchesDomain(link, types)) {
                    hasMatch = true;
                }
            }
        }
    });
    return hasMatch;
}

export function isDirectLink(link: LinkConfiguration) {
    // link configuration is path-based if includes any variables
    const pathBased = /[?$][a-zA-Z]+\b/.test(link.path);
    return !pathBased;
}

export function isDirectProperty(property: PropertyConfiguration) {
    // property configuration is path-based if includes any variables
    const pathBased = /[?$][a-zA-Z]+\b/.test(property.path);
    return !pathBased;
}

function typeMatchesDomain(
    config: { readonly domain?: ReadonlyArray<string> },
    types: ReadonlySet<ElementTypeIri> | undefined
): boolean {
    if (!config.domain || config.domain.length === 0) {
        return true;
    } else if (!types) {
        return false;
    } else {
        for (const type of config.domain) {
            if (types.has(type as ElementTypeIri)) {
                return true;
            }
        }
        return false;
    }
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
    return left.language === right.language && left.value === right.value;
}

export function getLocalizedString(label: RdfLiteral): LocalizedString | undefined {
    if (label) {
        return {
            value: label.value,
            language: label['xml:lang'],
            datatype: label.datatype ? {value: label.datatype} : undefined,
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
        id: node.property.value as PropertyTypeIri,
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

export function getLinkTypeInfo(sLinkInfo: LinkTypeBinding): LinkType {
    if (!sLinkInfo) { return undefined; }
    const label = getLocalizedString(sLinkInfo.label);
    return {
        id: sLinkInfo.link.value as LinkTypeIri,
        label: {values: label ? [label] : []},
        count: getInstCount(sLinkInfo.instcount),
    };
}

export function prependAdditionalBindings<Binding>(
    base: SparqlResponse<Binding>,
    additional: SparqlResponse<Binding> | undefined,
): SparqlResponse<Binding> {
    if (!additional) {
        return base;
    }
    return {
        head: {vars: base.head.vars},
        results: {
            bindings: [...additional.results.bindings, ...base.results.bindings]
        },
    };
}
