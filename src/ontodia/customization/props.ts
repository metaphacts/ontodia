import { ComponentClass } from 'react';
import { LinkView } from '../diagram/linkView';

import { Dictionary, LinkModel, LocalizedString, Property } from '../data/model';

export type TypeStyleResolver = (types: string[]) => CustomTypeStyle | undefined;
export type LinkStyleResolver = (link: LinkModel) => LinkStyle | undefined;
export type TemplateResolver = (types: string[]) => ElementTemplate | undefined;

export interface CustomTypeStyle {
    color?: string;
    icon?: string;
}

export type ElementTemplate = ComponentClass<TemplateProps> | string;

export interface TemplateProps {
    types: string;
    label: string;
    color: any;
    icon: string;
    iri: string;
    imgUrl?: string;
    isExpanded?: boolean;
    propsAsList?: PropArray;
    props?: Dictionary<Property>;
}

export type PropArray = Array<{
    id: string;
    name: string;
    property: Property;
}>;

export interface LinkStyle {
    connection?: {
        fill?: string;
        stroke?: string;
        'stroke-width'?: number;
        'stroke-dasharray'?: string;
    };
    markerSource?: LinkMarkerStyle;
    markerTarget?: LinkMarkerStyle;
    label?: LinkLabelStyle;
    properties?: LinkLabelStyle[];
    connector?: {
        name?: string;
        args?: {
            radius?: number;
        };
    };
    router?: LinkRouter;
}

export type LinkRouter = RouterDescription | RouterFunction;

export type RouterFunction = (
    vertices: Vertex[],
    args: {},
    linkView: LinkView,
) => Vertex[];

export interface RouterDescription {
    name?: string;
    args?: {};
}

export interface Vertex {
    x: number;
    y: number;
}

export interface LinkMarkerStyle {
    fill?: string;
    stroke?: string;
    strokeWidth?: string;
    d?: string;
    width?: number;
    height?: number;
}

export interface LinkLabelStyle {
    position?: number;
    attrs?: {
        rect?: {
            fill?: string;
            'stroke'?: string;
            'stroke-width'?: number;
        };
        text?: {
            fill?: string;
            'stroke'?: string;
            'stroke-width'?: number;
            text?: LocalizedString[];
        };
    };
}
