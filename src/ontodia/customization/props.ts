import { Dictionary, Property } from '../data/model';

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
