export interface Field {
    type: string;
    value: string;
}

export interface Label extends Field {
    'xml:lang': string;
}

export interface TypedField extends Field {
    datatype: string;
}

export interface TreeNode {
    class: Field;
    instcount?: TypedField;
    label?: Label;
    parent?: Field;
}

export interface LinkType {
    link: Field;
    instcount?: TypedField;
    label?: Label;
}

export interface ElementInfo {
    inst: Field;
    class?: Field;
    label?: Label;
    propType?: Field;
    propValue?: TypedField;
}

export interface LinkTypeInfo {
    typeId: Field;
    label?: Label;
    instcount?: TypedField;
}

export interface LinkInfo {
    source: Field;
    type: Field;
    target: Field;
}

export interface ConstructElement {
    subject: Field;
    predicate: Field;
    object: Field;
}

export interface ImageLink {
    inst: Field;
    linkType: Field;
    image: Field;
}

export interface SparqlResponse {
    head: { vars: string[] };
    results: { bindings: any };
}

export interface TreeResponse extends SparqlResponse {
    results: { bindings: TreeNode[] };
};

export interface LinkTypesResponse extends SparqlResponse {
    results: { bindings: LinkType[] };
};

export interface ElementsInfoResponse extends SparqlResponse  {
    results: { bindings: ElementInfo[] };
};

export interface LinkTypesInfoResponse extends SparqlResponse  {
    results: { bindings: LinkTypeInfo[] };
};

export interface LinksInfoResponse extends SparqlResponse  {
    results: { bindings: LinkInfo[] };
};

export interface LinkTypesOfResponse extends SparqlResponse  {
    results: { bindings: LinkType[] };
};

export interface FilterResponse extends SparqlResponse  {
    results: { bindings: ElementInfo[] };
};

export interface ConstructResponse extends SparqlResponse  {
    results: { bindings: ConstructElement[] };
};

export interface ImageResponse extends SparqlResponse  {
    results: { bindings: ImageLink[] };
};
