import { LinkTemplate, LinkTemplateResolver } from './props';

export const LINK_SHOW_IRI: LinkTemplate = {
    renderLink: link => ({
        properties: [{
            position: 0.5,
            attrs: {
                text: {
                    text: [{
                        text: link.linkTypeId,
                        lang: '',
                    }],
                    fill: 'gray',
                    'font-size': 12,
                    'font-weight': 'lighter',
                },
            },
        }],
    }),
};

const LINK_SUB_CLASS_OF: LinkTemplate = {
    markerTarget: {
        fill: '#f8a485',
        stroke: '#cf8e76',
    },
    renderLink: () => ({
        connection: {
            stroke: '#f8a485',
            'stroke-width': 2,
        },
    }),
};

const LINK_DOMAIN: LinkTemplate = {
    markerTarget: {
        fill: '#34c7f3',
        stroke: '#38b5db',
    },
    renderLink: () => ({
        connection: {
            stroke: '#34c7f3',
            'stroke-width': 2,
        },
    }),
};

const LINK_RANGE: LinkTemplate = {
    markerTarget: {
        fill: '#34c7f3',
        stroke: '#38b5db',
    },
    renderLink: () => ({
        connection: {
            stroke: '#34c7f3',
            'stroke-width': 2,
        },
    }),
};

const LINK_TYPE_OF: LinkTemplate = {
    markerTarget: {
        fill: '#8cd965',
        stroke: '#5b9a3b',
    },
    renderLink: () => ({
        connection: {
            stroke: '#8cd965',
            'stroke-width': 2,
        },
    }),
};

export const DefaultLinkTemplateBundle: LinkTemplateResolver[] = [
    type => {
        if (type === 'http://www.w3.org/2000/01/rdf-schema#subClassOf') {
            return LINK_SUB_CLASS_OF;
        } else if (type === 'http://www.w3.org/2000/01/rdf-schema#domain') {
            return LINK_DOMAIN;
        } else if (type === 'http://www.w3.org/2000/01/rdf-schema#range') {
            return LINK_RANGE;
        } else if (type === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
            return LINK_TYPE_OF;
        } else {
            return undefined;
        }
    },
];
