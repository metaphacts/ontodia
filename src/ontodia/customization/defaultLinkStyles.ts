import { LinkStyle, LinkStyleResolver } from './props';

const LINK_SUB_CLASS_OF: LinkStyle = {
    connection: {
        stroke: '#f8a485',
        'stroke-width': 2,
    },
    markerTarget: {
        fill: '#f8a485',
        stroke: '#cf8e76',
    },
};

const LINK_DOMAIN: LinkStyle = {
    connection: {
        stroke: '#34c7f3',
        'stroke-width': 2,
    },
    markerTarget: {
        fill: '#34c7f3',
        stroke: '#38b5db',
    },
};

const LINK_RANGE: LinkStyle = {
    connection: {
        stroke: '#34c7f3',
        'stroke-width': 2,
    },
    markerTarget: {
        fill: '#34c7f3',
        stroke: '#38b5db',
    },
};

const LINK_TYPE_OF: LinkStyle = {
    connection: {
        stroke: '#8cd965',
        'stroke-width': 2,
    },
    markerTarget: {
        fill: '#8cd965',
        stroke: '#5b9a3b',
    },
};

export const DefaultLinkStyleBundle: LinkStyleResolver[] = [
    type => {
        if (type === 'http://www.w3.org/2000/01/rdf-schema#subClassOf') {
            return link => LINK_SUB_CLASS_OF;
        } else if (type === 'http://www.w3.org/2000/01/rdf-schema#domain') {
            return link => LINK_DOMAIN;
        } else if (type === 'http://www.w3.org/2000/01/rdf-schema#range') {
            return link => LINK_RANGE;
        } else if (type === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
            return link => LINK_TYPE_OF;
        } else {
            return link => undefined;
        }
    },
];
