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
}

export interface ClassModel {
    id: string;
    label: { values: LocalizedString[] };
    count: number;
    children: ClassModel[];
}

export interface LinkCount {
    id: string;
    count: number;
}

export interface LinkType extends LinkCount {
    label: { values: LocalizedString[] };
}

export interface PropertyModel {
    id: string;
    label: { values: LocalizedString[] };
}
