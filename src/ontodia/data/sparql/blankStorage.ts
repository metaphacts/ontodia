import 'whatwg-fetch';
import * as N3 from 'n3';
import { DataProvider, FilterParams } from '../provider';
import { Dictionary, ClassModel, LinkType, ElementModel, LinkModel, LinkCount, PropertyModel } from '../model';

import {
    ClassBinding, ElementBinding, LinkBinding, PropertyBinding, BlankBinding, isRdfIri,
    LinkCountBinding, LinkTypeBinding, ElementImageBinding, SparqlResponse, Triple, RdfNode,
} from './sparqlModels';

import { executeSparqlQuery } from './sparqlDataProvider';

export class BlankStorage {
    blankElements: BlankBinding[] = [];
    constructor() {
        /* */
    }

    isBlunkNodeId(id: string): boolean {
        for (const bn of this.blankElements) {
            if (bn.inst.value === id) {
                return true;
            }
        }
        return false;
    }

    putNode(binding: BlankBinding) {
        let contain = false;
        for (const be of this.blankElements) {
            if (
                be.inst.value === binding.inst.value &&
                // be.propType.value === binding.propType.value &&
                // be.class.value === binding.class.value &&
                be.blankSrc.value === binding.blankSrc.value &&
                be.blankTrg.value === binding.blankTrg.value &&
                be.blankSrcProp.value === binding.blankSrcProp.value &&
                be.blankTrgProp.value === binding.blankTrgProp.value
            ) {
                contain = true;
            }
        }
        if (!contain) {
            this.blankElements.push(binding);
        }
    }

    putAllNodes(bindings: BlankBinding[]) {
        for (const binding of bindings) {
            this.blankElements.push(binding);
        }
    }

    elementInfo(params: { elementIds: string[]; }): SparqlResponse<ElementBinding> {
        const elementIds = params.elementIds.filter(id => this.isBlunkNodeId(id));

        return {
            head: undefined,
            results: { bindings: this.getElementBindings(elementIds) },
        };
    }

    linksInfo(params: {
        elementIds: string[];
        linkTypeIds: string[];
    }): SparqlResponse<LinkBinding> {
        return {
            head: undefined,
            results: { bindings: this.getLinkBinding(params.elementIds) },
        };
    }

    linkTypesOf(params: { elementId: string; }): SparqlResponse<LinkCountBinding> {
        return {
            head: undefined,
            results: { bindings: this.getLinkCountBinding(params.elementId) },
        };
    }

    linkElements(params: {
        elementId: string;
        linkId: string;
        limit: number;
        offset: number;
        direction?: 'in' | 'out';
    }): SparqlResponse<ElementBinding> {
        return this.filter({
            refElementId: params.elementId,
            refElementLinkId: params.linkId,
            linkDirection: params.direction,
            limit: params.limit,
            offset: params.offset,
            languageCode: ''});
    }

    filter(params: FilterParams): SparqlResponse<ElementBinding> {
        const filterResponse: SparqlResponse<ElementBinding> = {
            head: undefined,
            results: { bindings: [] },
        };
        if (params.limit === 0) { params.limit = 100; }

        if (params.elementTypeId) {
            filterResponse.results.bindings = this.getAllElementsWithType(params.elementTypeId);
        } else if (params.refElementId && params.refElementLinkId) {
            filterResponse.results.bindings = this.getAllRelatedByLinkTypeElements(
                params.refElementId,
                params.refElementLinkId,
                params.linkDirection,
            );
        } else if (params.refElementId) {
            filterResponse.results.bindings = this.getAllRelatedElements(params.refElementId);
        }

        if (params.text && filterResponse.results.bindings.length !== 0) {
            filterResponse.results.bindings =
                filterResponse.results.bindings.filter(be => be.inst.value.toLowerCase().indexOf(params.text) !== -1);
        }

        return filterResponse;
    };

    private getAllElementsWithType(elementTypeId: string): ElementBinding[] {
        const bindings: ElementBinding[] = [];
        for (const be of this.blankElements) {
            if (isRdfIri(be.blankSrc) && elementTypeId === be.blankSrcProp.value) {
                bindings.push({
                    inst: be.blankSrc,
                });
            }
            if (isRdfIri(be.blankTrg) && elementTypeId === be.blankTrgProp.value) {
                bindings.push({
                    inst: be.blankTrg,
                });
            }
        }
        return bindings;
    }

    private getAllRelatedByLinkTypeElements(
        refElementId: string, refElementLinkId: string, linkDirection: string,
    ): ElementBinding[] {
        const bindings: ElementBinding[] = [];
        for (const be of this.blankElements) {
            if (linkDirection === 'in') {
                if (
                    be.inst.value === refElementId &&
                    isRdfIri(be.blankSrc) &&
                    refElementLinkId === be.blankSrcProp.value
                ) {
                    bindings.push({
                        inst: be.blankSrc,
                    });
                } else if (
                    be.blankTrg.value === refElementId &&
                    refElementLinkId === be.blankTrgProp.value
                ) {
                    bindings.push(be);
                }
            } else {
                if (
                    be.inst.value === refElementId &&
                    isRdfIri(be.blankTrg) &&
                    refElementLinkId === be.blankTrgProp.value
                ) {
                    bindings.push({
                        inst: be.blankTrg,
                    });
                } else if (
                    be.blankSrc.value === refElementId &&
                    refElementLinkId === be.blankSrcProp.value
                ) {
                    bindings.push(be);
                }
            }
        }
        return bindings;
    }

    private getAllRelatedElements(id: string): ElementBinding[] {
        const bindings: ElementBinding[] = [];
        for (const be of this.blankElements) {
            if (be.inst.value === id || id === be.blankSrc.value || id === be.blankTrg.value) {
                bindings.push(be);
                if (isRdfIri(be.blankSrc)) {
                    bindings.push({
                        inst: be.blankSrc,
                    });
                }
                if (isRdfIri(be.blankTrg)) {
                    bindings.push({
                        inst: be.blankTrg,
                    });
                }
            }
        }
        return bindings;
    }

    private getElementBindings(ids: string[]): ElementBinding[] {
        return this.blankElements.filter(be => {
            return ids.indexOf(be.inst.value) !== -1;
        });
    }

    private getLinkBinding(ids: string[]): LinkBinding[] {
        const bindings: LinkBinding[] = [];
        for (const be of this.blankElements) {
            if (ids.indexOf(be.inst.value) !== -1) {
                if (
                    isRdfIri(be.blankSrc) &&
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
                    isRdfIri(be.blankTrg) &&
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

    private getLinkCountBinding(id: string): LinkCountBinding[] {
        const bindings: LinkBinding[] = [];
        const dictionary: Dictionary<LinkCountBinding> = {};

        for (const be of this.blankElements) {
            if (id === be.inst.value) {
                if (
                    isRdfIri(be.blankSrc) &&
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
                    } else {
                        dictionary[be.blankSrcProp.value].inCount.value =
                            (+dictionary[be.blankSrcProp.value].inCount.value + 1).toString();
                    }
                }
                if (
                    isRdfIri(be.blankTrg) &&
                    isRdfIri(be.blankTrgProp)
                ) {
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
                        dictionary[be.blankTrgProp.value].inCount.value =
                            (+dictionary[be.blankTrgProp.value].outCount.value + 1).toString();
                    }
                }
            }
        }
        return Object.keys(dictionary).map(k => dictionary[k]);
    }
}

export default BlankStorage;
