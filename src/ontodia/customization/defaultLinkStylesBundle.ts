import { Link } from '../diagram/elements';
import * as joint from 'jointjs';

export type LinkStyleResolver = (link: Link) => joint.dia.LinkAttributes;

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
            stroke: '#61cba8',
            'stroke-width': 2,
        },
        '.marker-target': {
            fill: '#61cba8',
            stroke: '#5da88f',
        },
    },
};

const LINK_RANGE = {
    attrs: {
        '.connection': {
            stroke: '#61cba8',
            'stroke-width': 2,
        },
        '.marker-target': {
            fill: '#61cba8',
            stroke: '#5da88f',
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

export const DEFAULT_LINK_STYLE_BUNDLE: LinkStyleResolver[] = [
    link => {
        if (link.get('typeId') === 'http://www.w3.org/2000/01/rdf-schema#subClassOf') {
            return LINK_SUB_CLASS_OF;
        } else {
            return undefined;
        }
    },
    link => {
        if (link.get('typeId') === 'http://www.w3.org/2000/01/rdf-schema#domain') {
            return LINK_DOMAIN;
        } else {
            return undefined;
        }
    },
    link => {
        if (link.get('typeId') === 'http://www.w3.org/2000/01/rdf-schema#range') {
            return LINK_RANGE;
        } else {
            return undefined;
        }
    },
    link => {
        if (link.get('typeId') === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
            return LINK_TYPE_OF;
        } else {
            return undefined;
        }
    },
];
