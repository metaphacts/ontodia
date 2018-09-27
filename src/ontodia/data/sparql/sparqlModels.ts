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

export interface BlankBinding extends ElementBinding {
    blankType: {
        value: 'listHead' | 'blankNode';
    };
    blankTrgProp: RdfNode;
    blankTrg: RdfNode;
    blankSrc?: RdfNode;
    blankSrcProp?: RdfNode;
    newInst?: RdfIri | RdfBlank;
}

export function isBlankBinding(binding: ElementBinding | BlankBinding): binding is BlankBinding {
    const blank = binding as BlankBinding;
    return blank.blankTrgProp !== undefined
        || blank.blankTrg !== undefined
        || blank.blankSrcProp !== undefined
        || blank.blankSrc !== undefined;
}

export interface ElementBinding {
    inst: RdfIri | RdfBlank;
    class?: RdfIri;
    label?: RdfLiteral;
    propType?: RdfIri;
    propValue?: RdfLiteral;
}

export interface ClassBinding {
    class: RdfIri;
    instcount?: RdfLiteral;
    label?: RdfLiteral;
    parent?: RdfIri;
}

export interface PropertyBinding {
    prop: RdfIri;
    label?: RdfLiteral;
}

export interface LinkBinding {
    source: RdfIri | RdfBlank;
    type: RdfIri;
    target: RdfIri | RdfBlank;
    propType?: RdfIri;
    propValue?: RdfLiteral;
}

export interface LinkCountBinding {
    link: RdfIri | RdfBlank;
    inCount: RdfLiteral;
    outCount: RdfLiteral;
}

export interface LinkTypeBinding {
    link: RdfIri;
    label?: RdfLiteral;
    instcount?: RdfLiteral;
}

export interface ElementImageBinding {
    inst: RdfIri;
    linkType: RdfIri;
    image: RdfIri;
}

export interface SparqlResponse<Binding> {
    head: { vars: string[] };
    results: { bindings: Binding[] };
}
