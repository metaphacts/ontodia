export type RdfNode = RdfIri | RdfLiteral;

export interface RdfIri {
    type: 'uri';
    value: string;
}

export function isRdfIri(e: RdfNode): e is RdfIri {
    return e.type === 'uri';
}

export function isRdfLiteral(e: RdfNode): e is RdfLiteral {
    return e.type === 'literal';
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

export interface BlankElement extends ElementBinding {
    blankTrgProp?: RdfNode;
    blankTrg?: RdfNode;
    blankSrc?: RdfNode;
    blankSrcProp?: RdfNode;
}

export function isBlank(e: (ElementBinding | BlankElement)): e is BlankElement {
    return (<BlankElement> e).blankTrgProp  !== undefined ||
           (<BlankElement> e).blankTrg  !== undefined ||
           (<BlankElement> e).blankSrcProp  !== undefined ||
           (<BlankElement> e).blankSrc  !== undefined;
}

export interface ElementBinding {
    inst: RdfIri;
    class?: RdfLiteral;
    label?: RdfLiteral;
    propType?: RdfLiteral;
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
    source: RdfIri;
    type: RdfIri;
    target: RdfIri;
}

export interface LinkCountBinding {
    link: RdfIri;
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
