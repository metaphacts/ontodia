export type Dictionary<T> = { [key: string]: T; };

export interface LocalizedString {
    text: string;
    lang: string;
}

export type Property = { type: 'string'; values: LocalizedString[]; };

export interface ElementModel {
    id: string;
    types: string[];
    label: { values: LocalizedString[] };
    image?: string;
    properties: { [id: string]: Property };
}

export interface LinkModel {
    linkTypeId: string;
    sourceId: string;
    targetId: string;
    properties?: { [id: string]: Property };
}

export interface ClassModel {
    id: string;
    label: { values: LocalizedString[] };
    count: number;
    children: ClassModel[];
}

export interface LinkCount {
    id: string;
    inCount: number;
    outCount: number;
}

export interface LinkType {
    id: string;
    label: { values: LocalizedString[] };
    count: number;
}

export interface PropertyModel {
    id: string;
    label: { values: LocalizedString[] };
}
