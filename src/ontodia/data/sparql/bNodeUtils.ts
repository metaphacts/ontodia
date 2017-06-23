import 'whatwg-fetch';
import { getNameFromId } from './responseHandler';
import { Dictionary } from '../model';
import { FilterParams } from '../provider';

import {
    ElementBinding, LinkBinding, BlankBinding, isRdfIri, isRdfBlank,
    LinkCountBinding, SparqlResponse, RdfLiteral, RdfBlank,
} from './sparqlModels';

import { executeSparqlQuery } from './sparqlDataProvider';

export function isBlunkNodeId (id: string): boolean {
    const blankElements = decodeId(id);
    return blankElements !== undefined;
};

export function processBlankBindings(
    bindings: BlankBinding[],
    executeSparqlQuery: (query: string) => Promise<SparqlResponse<BlankBinding>>,
): Promise<BlankBinding[]> {

    const dictionary: Dictionary<BlankBinding[]> = {};
    const allBindings: BlankBinding[] = [];
    for (const binding of bindings) {
        if (binding.newInst) {
            binding.inst = binding.newInst;
        }
        if (!dictionary[binding.inst.value]) {
            dictionary[binding.inst.value] = [];
        }
        dictionary[binding.inst.value].push(binding);
        allBindings.push(binding);
    }

    const blankChildren: BlankBinding[][] = [];
    for (const b of allBindings) {
        if (isRdfBlank(b.blankTrg)) {
            blankChildren.push([b]);
        }
    }

    return getNextBNodeGeneration(blankChildren, executeSparqlQuery).then(bNodeIds => {
        const bindningLists = Object.keys(dictionary).map(key => dictionary[key]);
        for (const bnList of bindningLists) {
            const label = createLabel(bnList[0]);
            for (const bn of bnList) {
                bn.label = label;
                if (bNodeIds[bn.blankTrg.value]) {
                    bn.blankTrg.value = bNodeIds[bn.blankTrg.value];
                }
            }
            const structId = encodeId(bnList);
            for (const bn of bnList) {
                bn.inst.value = structId;
            }
        }
        return allBindings;
    });
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

export function encodeId (blankBindings: BlankBinding[]): string {
    function contains (list: BlankBinding[], binding: BlankBinding): boolean {
        for (const b of list) {
            if (compareNodes(b, binding)) {
                return true;
            }
        }
        return false;
    }

    const clearList: BlankBinding[] = [];
    for (const bind of blankBindings) {
        if (!contains(clearList, bind)) {
            clearList.push(bind);
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
    clearList.sort((a: BlankBinding, b: BlankBinding) => {
        const res1 = compareStrings(a.blankTrg.value, b.blankTrg.value);
        if (res1 !== 0) {
            return res1;
        }
        return compareStrings(a.blankTrgProp.value, b.blankTrgProp.value);
    });

    return encodeURI(JSON.stringify(clearList).replace(/\s/g, ''));
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

export function createLabel (bn: BlankBinding): RdfLiteral {
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

function getNextBNodeGeneration (
    blankNodes: BlankBinding[][],
    executeSparqlQuery: (query: string) => Promise<SparqlResponse<BlankBinding>>,
    deep?: number,
): Promise<Dictionary<string>> {
    if (deep > 1) {
        return Promise.resolve({});
    }
    function processBlankBinding (blankBindings: BlankBinding[]): Promise<{
        result: SparqlResponse<BlankBinding>,
        parents: BlankBinding[],
    }> {
        const query = getQueryForBlankNode(blankBindings);
        return executeSparqlQuery(query).then(response => ({
            result: response,
            parents: blankBindings,
        }));
    }
    const promises: Promise<{
        result: SparqlResponse<BlankBinding>,
        parents: BlankBinding[],
    }>[] = [];
    for (const bn of blankNodes) {
        promises.push(processBlankBinding(bn));
    }
    return Promise.all(promises)
        .then(responses => {
            const recursPromises: Promise<boolean>[] = [];
            const ids: Dictionary<string> = {};
            for (const response of responses) {
                const resp = response.result;
                if (resp.results.bindings.length > 0) {
                    const blankChildren: BlankBinding[][] = [];
                    for (const bind of resp.results.bindings) {
                        if (isRdfBlank(bind.blankTrg)) {
                            blankChildren.push(response.parents.concat([bind]));
                        }
                    }
                    recursPromises.push(
                        getNextBNodeGeneration(blankChildren, executeSparqlQuery, (deep + 1 || 1))
                            .then(bNodeIds => {
                                const devidedResults: Dictionary<BlankBinding[]> = {};
                                for (const bn of resp.results.bindings) {
                                    bn.label = createLabel(bn);
                                    if (bNodeIds[bn.blankTrg.value]) {
                                        bn.blankTrg.value = bNodeIds[bn.blankTrg.value];
                                    }
                                    if (!devidedResults[bn.inst.value]) {
                                        devidedResults[bn.inst.value] = [];
                                    }
                                    devidedResults[bn.inst.value].push(bn);
                                }
                                Object.keys(devidedResults).forEach(key => {
                                    const bn = devidedResults[key];
                                    const originalId = bn[0].inst.value;
                                    const structId = encodeId(bn);
                                    for (const subResult of bn) {
                                        subResult.inst.value = structId;
                                    }
                                    ids[originalId] = structId;
                                });
                                return true;
                            }),
                    );
                }
            }
            return Promise.all(recursPromises).then(() => {
                return ids;
            });
        });
}

function getQueryForBlankNode (blankNodes: BlankBinding[]): string {
    function getQueryBlock (
        blankNode: BlankBinding,
        index: number,
        maxIndex: number,
    ) {
        const trustableTrgProp = (index === 0 || blankNode.blankType.value !== 'listHead');
        const sourceId = index > 0 ? '?inst' + (index - 1) : '<' + blankNode.blankSrc.value + '>';
        const sourcePropId = trustableTrgProp ?
            (index > 0 ? '?blankTrgProp' + (index - 1) : '<' + blankNode.blankSrcProp.value + '>') :
            '?anyType' + index;
        const instPostfix = index === maxIndex ? '' : index.toString();
        const targetPropId = trustableTrgProp ? '<' + blankNode.blankTrgProp.value + '>' : '?anyType0' + index;
        return ` 
            # ======================
            ${sourceId} ${sourcePropId} ?blankSrc${index}.
            ?blankSrc${index} ${targetPropId} ?inst${instPostfix}.
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
                ?inst${instPostfix} rdf:type${index} ?class${index}.
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
            !nodeA.blankSrc && !nodeB.blankSrc
        ) &&
        (
            nodeA.blankSrcProp && nodeB.blankSrcProp && nodeA.blankSrcProp.value === nodeB.blankSrcProp.value ||
            !nodeA.blankSrcProp && !nodeB.blankSrcProp
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
