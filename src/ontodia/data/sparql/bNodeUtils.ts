import 'whatwg-fetch';
import { getNameFromId } from './responseHandler';
import { Dictionary } from '../model';
import { FilterParams } from '../provider';

import {
    ElementBinding, LinkBinding, BlankBinding, isRdfIri, isRdfBlank,
    LinkCountBinding, SparqlResponse, RdfLiteral, RdfBlank,
} from './sparqlModels';

import { executeSparqlQuery } from './sparqlDataProvider';

export const MAX_RECURSION_DEEP = 3;

export function isBlunkNodeId (id: string): boolean {
    const blankElements = decodeId(id);
    return blankElements !== undefined;
};

export class QueryExecutor {
    queryDictionary: Dictionary<Promise<SparqlResponse<BlankBinding>>> = {};
    constructor (
        public queryFunction: (query: string) => Promise<SparqlResponse<BlankBinding>>,
    ) { }

    executeQuery(query: string): Promise<SparqlResponse<BlankBinding>> {
        const execution = this.queryDictionary[query];
        if (execution) {
            return execution;
        } else {
            this.queryDictionary[query] = this.queryFunction(query).then(response => {
                delete this.queryDictionary[query];
                return response;
            });
            return this.queryDictionary[query];
        }
    }
}

export function processBlankBindings(
    blankBindings: BlankBinding[],
    queryFunction: (query: string) => Promise<SparqlResponse<BlankBinding>>,
): Promise<BlankBinding[]> {

    const bindingGroupsById: Dictionary<BlankBinding[]> = {};
    for (const binding of blankBindings) {
        if (binding.newInst) {
            binding.inst = binding.newInst;
        }
        if (!bindingGroupsById[binding.inst.value]) {
            bindingGroupsById[binding.inst.value] = [];
        }
        bindingGroupsById[binding.inst.value].push(binding);
    }

    const relatedBlankBindnings: BlankBinding[][] = [];
    for (const b of blankBindings) {
        if (isRdfBlank(b.blankTrg)) {
            relatedBlankBindnings.push([b]);
        }
    }

    const queryExecutor = new QueryExecutor(queryFunction);

    return loadRelatedBlankNodes(relatedBlankBindnings, queryExecutor).then(loadedGroupsById => {
        const idsMap = getEncodedIdDictionary(loadedGroupsById);
        const groups = Object.keys(bindingGroupsById).map(key => bindingGroupsById[key]);

        for (const group of groups) {
            for (const blankBinding of group) {
                if (!blankBinding.label) {
                    blankBinding.label = createLabel4BlankBinding(blankBinding);
                }
                const encodedId4LoadedElement = idsMap[blankBinding.blankTrg.value];
                if (encodedId4LoadedElement) {
                    blankBinding.blankTrg.value = encodedId4LoadedElement;
                }
            }
            const encodedId = encodeId(group);
            updateGroupIds(group, encodedId);
        }

        return blankBindings;
    });
}

function getEncodedIdDictionary (blankBindingGroups: Dictionary<BlankBinding[]>): Dictionary<string> {
    const idDictionary: Dictionary<string> = {};
    const keys = Object.keys(blankBindingGroups);
    for (const key of keys) {
        idDictionary[key] = encodeId(blankBindingGroups[key]);
        updateGroupIds(blankBindingGroups[key], idDictionary[key]);
    }
    return idDictionary;
}

function updateGroupIds (group: BlankBinding[], newId: string) {
    for (const loadedBlankBinding of group) {
        loadedBlankBinding.inst.value = newId;
    }
}

export function encodeId (blankBindings: BlankBinding[]): string {

    function contains (list: BlankBinding[], binding: BlankBinding): BlankBinding {
        for (const b of list) {
            if (compareNodes(b, binding)) {
                return b;
            }
        }
        return null;
    }

    function updateBinding (targetBinding: BlankBinding, newBinding: BlankBinding) {
        if (!targetBinding.blankSrc && newBinding.blankSrc) {
            targetBinding.blankSrc = newBinding.blankSrc;
        }
        if (!targetBinding.blankSrcProp && newBinding.blankSrcProp) {
            targetBinding.blankSrcProp = newBinding.blankSrcProp;
        }
        if (
            targetBinding.label &&
            targetBinding.label.value === 'anonimous' &&
            newBinding.label && newBinding.label.value !== 'anonimous'
        ) {
            targetBinding.label = newBinding.label;
        }
    }

    function compareStrings (a: string, b: string): number {
        if (a > b) {
            return 1;
        } else if (a < b) {
            return -1;
        } else {
            return 0;
        }
    }

    const uniqueElements: BlankBinding[] = [];
    for (const binding of blankBindings) {
        const similarElement = contains(uniqueElements, binding);
        if (!similarElement) {
            uniqueElements.push(binding);
        } else {
            updateBinding(similarElement, binding);
        }
    }

    uniqueElements.sort((a: BlankBinding, b: BlankBinding) => {
        const areTargetsSimilar = compareStrings(a.blankTrg.value, b.blankTrg.value);
        if (areTargetsSimilar !== 0) {
            return areTargetsSimilar;
        }
        const areTargetTypesSimilar = compareStrings(a.blankTrgProp.value, b.blankTrgProp.value);
        return areTargetTypesSimilar;
    });

    return encodeURI(JSON.stringify(uniqueElements).replace(/\s/g, ''));
}

export function decodeId (id: string): BlankBinding[] {
    try {
        const bindings: BlankBinding[] = JSON.parse(decodeURI(id));
        for (const b of bindings) {
            b.inst.value = id;
        }
        return bindings;
    } catch (error) {
        /* Silent */
        return undefined;
    }
}

export function createLabel4BlankBinding (bn: BlankBinding): RdfLiteral {
    if (bn.blankType.value === 'listHead') {
        return {
            type: 'literal',
            value: 'RDFList',
            'xml:lang': '',
        };
    } else {
        return {
            type: 'literal',
            value: getNameFromId(bn.class ? bn.class.value : 'anonymous'),
            'xml:lang': '',
        };
    }
}

function loadRelatedBlankNodes (
    blankChains: BlankBinding[][],
    queryExecutor: QueryExecutor,
    recursionDeep?: number,
): Promise<Dictionary<BlankBinding[]>> {

    recursionDeep = recursionDeep || 1;

    if (recursionDeep > MAX_RECURSION_DEEP) {
        return Promise.resolve({});
    }

    const queryPairs = blankChains.map(chain => ({
        query: getQueryForChain(chain),
        chain: chain,
    }));

    const promises = queryPairs.map(pair => queryExecutor.executeQuery(pair.query).then(response => ({
        response: response,
        chain: pair.chain,
    })));

    return Promise.all(promises)
        .then(results => {
            const recursionPromises: Promise<boolean>[] = [];

            const loadedBlankBindings: Dictionary<BlankBinding[]> = {};
            for (const result of results) {
                const bindings = result.response.results.bindings;
                if (bindings.length > 0) {

                    const relatedBlankBindings: BlankBinding[][] = [];

                    for (const binding of bindings) {
                        if (isRdfBlank(binding.blankTrg)) {
                            relatedBlankBindings.push(result.chain.concat([binding]));
                        }
                    }

                    recursionPromises.push(
                        loadRelatedBlankNodes(relatedBlankBindings, queryExecutor, (recursionDeep + 1))
                            .then(loadedGroupsById => {
                                const idsMap = getEncodedIdDictionary(loadedGroupsById);
                                const mergedResults: Dictionary<BlankBinding[]> = {};

                                for (const binding of bindings) {
                                    binding.label = createLabel4BlankBinding(binding);

                                    const encodedId = idsMap[binding.blankTrg.value];

                                    if (encodedId) {
                                        binding.blankTrg.value = encodedId;
                                    }

                                    if (!mergedResults[binding.inst.value]) {
                                        mergedResults[binding.inst.value] = [];
                                    }

                                    mergedResults[binding.inst.value].push(binding);
                                }

                                Object.keys(mergedResults).forEach(key => {
                                    const group = mergedResults[key];
                                    const originalId = group[0].inst.value;
                                    loadedBlankBindings[originalId] = group;
                                });

                                return true;
                            }),
                    );
                }
            }
            return Promise.all(recursionPromises).then(() => {
                return loadedBlankBindings;
            });
        });
}

function getQueryForChain (blankNodes: BlankBinding[]): string {

    function getQueryBlock (
        blankNode: BlankBinding,
        index: number,
        maxIndex: number,
    ) {
        // if blankNode has type 'listHead' then his target and targetProperty is artificial,
        // and we can't include this id in chain
        const trustableTrgProp = (index === 0 || blankNode.blankType.value !== 'listHead');

        const sourceId = index > 0 ? '?inst' + (index - 1) : '<' + blankNode.blankSrc.value + '>';
        const sourcePropId = trustableTrgProp ?
            (index > 0 ? '?blankTrgProp' + (index - 1) : '<' + blankNode.blankSrcProp.value + '>') :
            '?anyType' + index;

        const instPostfix = index === maxIndex ? '' : index.toString();

        const targetPropId = trustableTrgProp ? '<' + blankNode.blankTrgProp.value + '>' : '?anyType0' + index;

        const firstRelation = index === 0 && blankNode.blankType.value === 'listHead' ?
            `
            ?blankSrc${index} rdf:rest*/rdf:first ?inst${instPostfix}.
            ` :
            `?blankSrc${index} ${targetPropId} ?inst${instPostfix}.`;

        return ` 
            # ======================
            ${sourceId} ${sourcePropId} ?blankSrc${index}.
            ${firstRelation}
            BIND (<${blankNode.blankTrgProp.value}> as ?blankSrcProp${index}).
            FILTER (ISBLANK(?inst${instPostfix})).
            {
                ?inst${instPostfix} ?blankTrgProp${instPostfix} ?blankTrg${instPostfix}.
                BIND("blankNode" as ?blankType${instPostfix}).
                FILTER NOT EXISTS { ?inst${instPostfix} rdf:first _:smth1${index} }.
            } UNION {
                ?inst${instPostfix} rdf:rest*/rdf:first ?blankTrg${instPostfix}.
                ?blankSrc${index} ?blankSrcProp${index} ?inst${instPostfix}.
                _:smth2${index} rdf:first ?blankTrg${instPostfix}.
                BIND(?blankSrcProp${index} as ?blankTrgProp${instPostfix})
                BIND("listHead" as ?blankType${instPostfix})
                FILTER NOT EXISTS { _:smth3${index} rdf:rest ?inst${instPostfix} }.
            }
            OPTIONAL {
                ?inst${instPostfix} rdf:type ?class${instPostfix}.
            }
        `;
    }

    const body = blankNodes.map((bn, index) => getQueryBlock(bn, index, blankNodes.length - 1)).join('\n');
    const query = `SELECT ?inst ?class ?label ?blankTrgProp ?blankTrg ?blankType
        WHERE {
           ${body}
        }
    `;
    return query;
}

export function elementInfo(elementIds: string[]): SparqlResponse<ElementBinding> {
    const ids = elementIds.filter(id => isBlunkNodeId(id));

    return {
        head: undefined,
        results: { bindings: getElementBindings(ids) },
    };
}

export function linksInfo(elementIds: string[]): SparqlResponse<LinkBinding> {
    return {
        head: undefined,
        results: { bindings: getLinkBinding(elementIds) },
    };
}

export function linkTypesOf(params: { elementId: string; }): SparqlResponse<LinkCountBinding> {
    return {
        head: undefined,
        results: { bindings: getLinkCountBinding(params.elementId) },
    };
}

export function filter(params: FilterParams): SparqlResponse<ElementBinding> {
    const filterResponse: SparqlResponse<ElementBinding> = {
        head: undefined,
        results: { bindings: [] },
    };
    if (params.limit === 0) { params.limit = 100; }

    if (params.elementTypeId) {
        filterResponse.results.bindings = [];
    } else if (params.refElementId && params.refElementLinkId) {
        filterResponse.results.bindings = getAllRelatedByLinkTypeElements(
            params.refElementId,
            params.refElementLinkId,
            params.linkDirection,
        );
    } else if (params.refElementId) {
        filterResponse.results.bindings = getAllRelatedElements(params.refElementId);
    }

    if (params.text && filterResponse.results.bindings.length !== 0) {
        filterResponse.results.bindings =
            filterResponse.results.bindings.filter(be => be.inst.value.toLowerCase().indexOf(params.text) !== -1);
    }

    return filterResponse;
};

function getAllRelatedByLinkTypeElements(
    refElementId: string, refElementLinkId: string, linkDirection: string,
): ElementBinding[] {
    const blankElements = (decodeId(refElementId) || [])
        .concat(decodeId(refElementLinkId) || []);
    let bindings: ElementBinding[] = [];
    if (blankElements.length > 0) {
        for (const be of blankElements) {
            if (linkDirection === 'in') {
                if (
                    be.inst.value === refElementId &&
                    (isRdfIri(be.blankSrc) || isRdfBlank(be.blankSrc)) &&
                    refElementLinkId === be.blankSrcProp.value
                ) {
                    if (isRdfIri(be.blankSrc)) {
                        bindings.push({
                            inst: be.blankSrc,
                        });
                    } else {
                        bindings = bindings.concat(decodeId(be.blankSrc.value) || [{inst: be.blankSrc}]);
                    }
                } else if (
                    be.blankTrg.value === refElementId &&
                    refElementLinkId === be.blankTrgProp.value
                ) {
                    bindings.push(be);
                }
            } else {
                if (
                    be.inst.value === refElementId &&
                    (isRdfIri(be.blankTrg) || isRdfBlank(be.blankTrg)) &&
                    refElementLinkId === be.blankTrgProp.value
                ) {
                    if (isRdfIri(be.blankTrg)) {
                        bindings.push({
                            inst: be.blankTrg,
                        });
                    } else {
                        bindings = bindings.concat(decodeId(be.blankTrg.value) || [{inst: be.blankTrg}]);
                    }
                } else if (
                    be.blankSrc.value === refElementId &&
                    refElementLinkId === be.blankSrcProp.value
                ) {
                    bindings.push(be);
                }
            }
        }
    }
    return bindings;
}

function getAllRelatedElements(id: string): ElementBinding[] {
    const blankElements = decodeId(id);
    let bindings: ElementBinding[] = [];
    if (blankElements) {
        for (const be of blankElements) {
            if (be.inst.value === id || id === be.blankSrc.value || id === be.blankTrg.value) {
                bindings.push(be);
                if (isRdfIri(be.blankSrc)) {
                    bindings.push({inst: be.blankSrc});
                } else if (isRdfBlank(be.blankSrc)) {
                    bindings = bindings.concat(decodeId(be.blankSrc.value) || [{inst: be.blankSrc}]);
                }
                if (isRdfIri(be.blankTrg)) {
                    bindings.push({inst: be.blankTrg});
                } else if (isRdfBlank(be.blankTrg)) {
                    bindings = bindings.concat(decodeId(be.blankTrg.value) || [{inst: be.blankTrg}]);
                }
            }
        }
    }
    return bindings;
}

function getElementBindings(ids: string[]): ElementBinding[] {
    let blankElements: BlankBinding[] = [];
    for (const id of ids) {
        const blankBindings = decodeId(id);
        if (blankBindings) {
            blankElements = blankElements.concat(decodeId(id));
        }
    }
    return blankElements.filter(be => {
        return ids.indexOf(be.inst.value) !== -1;
    });
}

function getLinkBinding(ids: string[]): LinkBinding[] {
    let blankElements: BlankBinding[] = [];
    for (const id of ids) {
        const blankBindings = decodeId(id);
        if (blankBindings) {
            blankElements = blankElements.concat(decodeId(id));
        }
    }

    const bindings: LinkBinding[] = [];
    for (const be of blankElements) {
        if (ids.indexOf(be.inst.value) !== -1) {
            if (
                (isRdfIri(be.blankSrc) || isRdfBlank(be.blankSrc)) &&
                isRdfIri(be.blankSrcProp) &&
                ids.indexOf(be.blankSrc.value) !== -1
            ) {
                bindings.push({
                    source: be.blankSrc,
                    type: be.blankSrcProp,
                    target: be.inst,
                });
            }
            if (
                (isRdfIri(be.blankTrg) || isRdfBlank(be.blankTrg)) &&
                isRdfIri(be.blankTrgProp) &&
                ids.indexOf(be.blankTrg.value) !== -1
            ) {
                bindings.push({
                    source: be.inst,
                    type: be.blankTrgProp,
                    target: be.blankTrg,
                });
            }
        }
    }
    return bindings;
}

// todo: improve comparing
export function compareNodes(nodeA: BlankBinding, nodeB: BlankBinding): boolean {
    return nodeA.inst.value === nodeB.inst.value &&
        (
            nodeA.blankSrc && nodeB.blankSrc && nodeA.blankSrc.value === nodeB.blankSrc.value ||
            !nodeA.blankSrc || !nodeB.blankSrc
        ) &&
        (
            nodeA.blankSrcProp && nodeB.blankSrcProp && nodeA.blankSrcProp.value === nodeB.blankSrcProp.value ||
            !nodeA.blankSrcProp || !nodeB.blankSrcProp
        ) &&
        nodeA.blankTrg.value === nodeB.blankTrg.value &&
        nodeA.blankTrgProp.value === nodeB.blankTrgProp.value &&
        (
            nodeA.propType && nodeB.propType && nodeA.propType.value === nodeB.propType.value ||
            !nodeA.propType && !nodeB.propType
        ) &&
        (
            nodeA.class && nodeB.class && nodeA.class.value === nodeB.class.value ||
            !nodeA.class && !nodeB.class
        );
}

function getLinkCountBinding(id: string): LinkCountBinding[] {
    const blankElements = decodeId(id);

    const bindings: LinkBinding[] = [];
    const dictionary: Dictionary<LinkCountBinding> = {};

    for (const be of blankElements) {
        if (id === be.inst.value) {
            if (
                (isRdfIri(be.blankTrg) || isRdfBlank(be.blankTrg)) &&
                isRdfIri(be.blankTrgProp)
            ) {
                if (
                    (isRdfIri(be.blankSrc) || isRdfBlank(be.blankSrc)) &&
                    isRdfIri(be.blankSrcProp)
                ) {
                    if (!dictionary[be.blankSrcProp.value]) {
                        dictionary[be.blankSrcProp.value] = {
                            link: be.blankSrcProp,
                            inCount: {
                                type: 'literal',
                                value: '1',
                                'xml:lang': '',
                            },
                            outCount: {
                                type: 'literal',
                                value: '0',
                                'xml:lang': '',
                            },
                        };
                    }
                }
                if (!dictionary[be.blankTrgProp.value]) {
                    dictionary[be.blankTrgProp.value] = {
                        link: be.blankTrgProp,
                        inCount: {
                            type: 'literal',
                            value: '0',
                            'xml:lang': '',
                        },
                        outCount: {
                            type: 'literal',
                            value: '1',
                            'xml:lang': '',
                        },
                    };
                } else {
                    dictionary[be.blankTrgProp.value].outCount.value =
                        (+dictionary[be.blankTrgProp.value].outCount.value + 1).toString();
                }
            }
        }
    }
    return Object.keys(dictionary).map(k => dictionary[k]);
}
