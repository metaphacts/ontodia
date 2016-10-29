import * as joint from 'jointjs';
import { ComponentClass } from 'react';

import { Dictionary, Property } from '../data/model';

export type TypeStyleResolver = (types: string[]) => CustomTypeStyle | undefined;
export type LinkStyleResolver = (type: string) => joint.dia.LinkAttributes | undefined;
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
