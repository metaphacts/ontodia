import { hashFnv32a } from '../data/utils';

export interface Dictionary<T> { [key: string]: T; }

export interface LocalizedString {
    text: string;
    lang: string;
}

// tslint:disable-next-line:interface-over-type-literal
export type Property = { type: 'string'; values: LocalizedString[] };

export type ElementIri = string & { readonly elementBrand: void };
export type ElementTypeIri = string & { readonly classBrand: void };
export type LinkTypeIri = string & { readonly linkTypeBrand: void };
export type PropertyTypeIri = string & { readonly propertyTypeBrand: void };

export interface ElementModel {
    id: ElementIri;
    types: ElementTypeIri[];
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
    id: ElementTypeIri;
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

export function sameLink(left: LinkModel, right: LinkModel) {
    return (
        left.linkTypeId === right.linkTypeId &&
        left.sourceId === right.sourceId &&
        left.targetId === right.targetId
    );
}

export function hashLink(link: LinkModel): number {
    const {linkTypeId, sourceId, targetId} = link;
    let hash = hashFnv32a(linkTypeId);
    hash = hash * 31 + hashFnv32a(sourceId);
    hash = hash * 31 + hashFnv32a(targetId);
    return hash;
}

export function sameElement(left: ElementModel, right: ElementModel): boolean {
    return (
        left.id === right.id &&
        isArraysEqual(left.types, right.types) &&
        isLocalizedStringsEqual(left.label.values, right.label.values) &&
        left.image === right.image &&
        isPropertiesEqual(left.properties, right.properties) &&
        (
            (!left.sources && !right.sources) ||
            (left.sources && right.sources && isArraysEqual(left.sources, right.sources))
        )
    );
}

function isArraysEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) { return false; }
    for (let i = 0; i < left.length; i++) {
        if (left[i] !== left[i]) { return false; }
    }
    return true;
}

function isLocalizedStringsEqual(left: LocalizedString[], right: LocalizedString[]): boolean {
    if (left.length !== right.length) { return false; }
    for (let i = 0; i < left.length; i++) {
        const leftValue = left[i];
        const rightValue = right[i];
        if (leftValue.text !== rightValue.text || leftValue.lang !== rightValue.lang) {
            return false;
        }
    }
    return true;
}

function isPropertiesEqual(left: { [id: string]: Property }, right: { [id: string]: Property }) {
    if (Object.keys(left).length !== Object.keys(right).length) { return false; }
    for (const key in left.properties) {
        if (left.properties.hasOwnProperty(key)) {
            const leftProperty = left[key];
            const rightProperty = right[key];
            if (!rightProperty || !isLocalizedStringsEqual(leftProperty.values, rightProperty.values)) {
                return false;
            }
        }
    }
    return true;
}
