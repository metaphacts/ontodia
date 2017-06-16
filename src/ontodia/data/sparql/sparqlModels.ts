export type RdfNode = RdfBlank | RdfIri | RdfLiteral;

export interface RdfBlank {
    readonly type: 'bnode';
    readonly value: string;
}

export interface RdfIri {
    readonly type: 'uri';
    readonly value: string;
}

export interface RdfLiteral {
    readonly type: 'literal';
    readonly value: string;
    readonly datatype?: string;
    readonly 'xml:lang': string;
}

export interface Triple {
    readonly subject: RdfNode;
    readonly predicate: RdfNode;
    readonly object: RdfNode;
}

export interface ElementBinding {
    inst: RdfLiteral;
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
    bsource: RdfLiteral;
    btarget: RdfLiteral;
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
