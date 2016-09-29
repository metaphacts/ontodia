import { LinkStyleResolver } from './props';

const LINK_SUB_CLASS_OF = {
    attrs: {
        '.connection': {
            stroke: '#f8a485',
            'stroke-width': 2,
        },
        '.marker-target': {
            fill: '#f8a485',
            stroke: '#cf8e76',
        },
    },
};

const LINK_DOMAIN = {
    attrs: {
        '.connection': {
            stroke: '#34c7f3',
            'stroke-width': 2,
        },
        '.marker-target': {
            fill: '#34c7f3',
            stroke: '#38b5db',
        },
    },
};

const LINK_RANGE = {
    attrs: {
        '.connection': {
            stroke: '#34c7f3',
            'stroke-width': 2,
        },
        '.marker-target': {
            fill: '#34c7f3',
            stroke: '#38b5db',
        },
    },
};

const LINK_TYPE_OF = {
    attrs: {
        '.connection': {
            stroke: '#8cd965',
            'stroke-width': 2,
        },
        '.marker-target': {
            fill: '#8cd965',
            stroke: '#5b9a3b',
        },
    },
};

export const DefaultLinkStyleBundle: LinkStyleResolver[] = [
    type => {
        if (type === 'http://www.w3.org/2000/01/rdf-schema#subClassOf') {
            return LINK_SUB_CLASS_OF;
        }
    },
    type => {
        if (type === 'http://www.w3.org/2000/01/rdf-schema#domain') {
            return LINK_DOMAIN;
        }
    },
    type => {
        if (type === 'http://www.w3.org/2000/01/rdf-schema#range') {
            return LINK_RANGE;
        }
    },
    type => {
        if (type === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
            return LINK_TYPE_OF;
        }
    },
];
