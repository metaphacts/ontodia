export type RdfNode = RdfIri | RdfLiteral | RdfBlank;

export interface RdfIri {
    type: 'uri';
    value: string;
}

export interface RdfBlank {
    type: 'bnode';
    value: string;
}

export interface RdfLiteral {
    type: 'literal';
    value: string;
    datatype?: string;
    'xml:lang': string;
}

export interface Triple {
    subject: RdfNode;
    predicate: RdfNode;
    object: RdfNode;
}

export function isRdfBlank(e: RdfNode): e is RdfBlank {
    return e && e.type === 'bnode';
}

export function isRdfIri(e: RdfNode): e is RdfIri {
    return e && e.type === 'uri';
}

export function isRdfLiteral(e: RdfNode): e is RdfLiteral {
    return e && e.type === 'literal';
}

/** @hidden */
export interface BlankBinding extends ElementBinding {
    blankType: {
        value: 'listHead' | 'blankNode',
    };
    blankTrgProp: RdfNode;
    blankTrg: RdfNode;
    blankSrc?: RdfNode;
    blankSrcProp?: RdfNode;
    newInst?: RdfIri | RdfBlank;
}

/** @hidden */
export function isBlankBinding(binding: ElementBinding | BlankBinding): binding is BlankBinding {
    const blank = binding as BlankBinding;
    return blank.blankTrgProp !== undefined
        || blank.blankTrg !== undefined
        || blank.blankSrcProp !== undefined
        || blank.blankSrc !== undefined;
}

/** @hidden */
export interface ElementBinding {
    inst: RdfIri | RdfBlank;
    class?: RdfIri;
    label?: RdfLiteral;
    propType?: RdfIri;
    propValue?: RdfLiteral;
}

/** @hidden */
export interface ClassBinding {
    class: RdfIri;
    instcount?: RdfLiteral;
    label?: RdfLiteral;
    parent?: RdfIri;
}

/** @hidden */
export interface PropertyBinding {
    prop: RdfIri;
    label?: RdfLiteral;
}

/** @hidden */
export interface LinkBinding {
    source: RdfIri | RdfBlank;
    type: RdfIri;
    target: RdfIri | RdfBlank;
    propType?: RdfIri;
    propValue?: RdfLiteral;
}

/** @hidden */
export interface LinkCountBinding {
    link: RdfIri | RdfBlank;
    inCount: RdfLiteral;
    outCount: RdfLiteral;
}

/** @hidden */
export interface LinkTypeBinding {
    link: RdfIri;
    label?: RdfLiteral;
    instcount?: RdfLiteral;
}

/** @hidden */
export interface ElementImageBinding {
    inst: RdfIri;
    linkType: RdfIri;
    image: RdfIri;
}

/** @hidden */
export interface SparqlResponse<Binding> {
    head: { vars: string[] };
    results: { bindings: Binding[] };
}
