export type Dictionary<T> = { [key: string]: T; };

export interface LocalizedString {
    text: string;
    lang: string;
}

export type Property = { type: 'string'; values: LocalizedString[]; };

export type ElementIri = string & { readonly elementBrand: void };
export type ClassIri = string & { readonly classBrand: void };
export type LinkTypeIri = string & { readonly linkTypeBrand: void };
export type PropertyTypeIri = string & { readonly propertyTypeBrand: void };

export interface ElementModel {
    id: ElementIri;
    types: ClassIri[];
    label: { values: LocalizedString[] };
    image?: string;
    properties: { [id: string]: Property };
    sources?: string[];
}

export interface LinkModel {
    linkTypeId: LinkTypeIri;
    sourceId: ElementIri;
    targetId: ElementIri;
    properties?: { [id: string]: Property };
}

export interface ClassModel {
    id: ClassIri;
    label: { values: LocalizedString[] };
    count?: number;
    children: ClassModel[];
}

export interface LinkCount {
    id: LinkTypeIri;
    inCount: number;
    outCount: number;
}

export interface LinkType {
    id: LinkTypeIri;
    label: { values: LocalizedString[] };
    count: number;
}

export interface PropertyModel {
    id: PropertyTypeIri;
    label: { values: LocalizedString[] };
}
