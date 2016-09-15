export type Dictionary<T> = { [key: string]: T; };

export interface LocalizedString {
    text: string;
    lang: string;
}

export type Property = { type: 'string'; value: LocalizedString; };

export interface ElementModel {
    id: string;
    types: string[];
    label: { values: LocalizedString[] };
    image?: string;
    properties: { [id: string]: Property[] };
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

export interface LinkStyle {
    attrs?: {
        '.connection'?: {
            fill?: string;
            stroke?: string;
            'stroke-width'?: number;
        },
        '.marker-source'?: {
            fill?: string;
            stroke?: string;
            'stroke-width'?: number;
            d?: string;
        },
        '.marker-target'?: {
            fill?: string;
            stroke?: string;
            'stroke-width'?: number;
            d?: string;
        }
    };
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
    z?: number;
}
