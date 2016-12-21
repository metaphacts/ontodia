export type RdfNode = RdfIri | RdfLiteral;

export interface RdfIri {
    type: 'uri';
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
}

export interface LinkTypeBinding {
    link: RdfIri;
    instcount?: RdfLiteral;
    label?: RdfLiteral;
}

export interface LinkTypeInfoBinding {
    typeId: RdfIri;
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
