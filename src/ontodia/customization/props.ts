import { ComponentClass } from 'react';

import { Dictionary, Property } from '../data/model';

export type TypeStyleResolver = (types: string[]) => CustomTypeStyle | undefined;
export type LinkStyleResolver = (type: string) => LinkStyle | undefined;
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
    props?: Dictionary<Property[]>;
}

export type PropArray = Array<{
    id: string;
    name: string;
    properties: Property[];
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
    labels?: LinkLabelStyle[];
    connector?: {
        name?: string;
        args?: {
            radius?: number;
        };
    };
    router?: {
        name?: string;
        args?: {
            startDirections?: string[];
            endDirections?: string[];
            excludeTypes?: string[];
        };
    };
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
        };
    };
}
