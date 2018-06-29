import { pick } from 'lodash';

import { ElementIri, LinkTypeIri } from '../data/model';

import { Element as DiagramElement, Link as DiagramLink } from './elements';
import { Vector, Size } from './geometry';

export interface SerializedDiagram {
    '@context': any;
    '@type': 'Diagram';
    layoutData: LayoutData;
    linkTypeOptions: LinkTypeOptions[];
}

export interface LinkTypeOptions {
    '@type': 'LinkTypeOptions';
    property: LinkTypeIri;
    visible: boolean;
    showLabel?: boolean;
}

export interface LayoutData {
    '@type': 'Layout';
    readonly elements: LayoutElement[];
    readonly links: LayoutLink[];
}

export interface LayoutElement {
    '@type': 'Element';
    '@id': string;
    iri: ElementIri;
    position: Vector;
    size?: Size;
    angle?: number;
    isExpanded: boolean;
    group?: string;
}

export interface LayoutLink {
    '@type': 'Link';
    '@id': string;
    property: LinkTypeIri;
    source: { '@id': string };
    target: { '@id': string };
    vertices?: Array<Vector>;
}

const serializedCellProperties = [
    'id', 'type',                              // common properties
    'size', 'angle', 'isExpanded', 'position', 'iri', 'group', // element properties
    'typeId', 'source', 'target', 'vertices',  // link properties
];

export function emptyDiagram(): SerializedDiagram {
    return {
        ...diagramContextV1,
        ...{
            '@type': 'Diagram',
            layoutData: {'@type': 'Layout', elements: [], links: []},
            linkTypeOptions: []
        }};
}

export function convertToLatest(oldDiagramData: any): SerializedDiagram {
    // check if current by checking scheme version
    if (oldDiagramData['@context'] && oldDiagramData['@context'].ontodia === diagramContextV1['@context'].ontodia) {
        return oldDiagramData;
    }

    // older than JSONLD is version with cells. So we apply transformation for each cell:
    let elements: LayoutElement[] = [];
    let links: LayoutLink[] = [];

    for (const cell of oldDiagramData.cells) {

        // get rid of unused properties
        let newCell: any = pick(cell, serializedCellProperties);

        // normalize type
        if (newCell.type === 'Ontodia.Element') {
            newCell.type = 'element';
        }

        if (!newCell.iri) {
            newCell.iri = newCell.id;
        }

        // rename to @id and @type to match JSON-LD
        newCell['@id'] = newCell.id;
        delete newCell.id;

        newCell['@type'] = newCell.type;
        delete newCell.type;

        // make two separate lists
        switch (cell.type) {
            case 'element':
                elements.push(newCell);
                break;
            case 'link':
                // rename internal IDs
                newCell.source['@id'] = newCell.source.id;
                delete newCell.source.id;
                newCell.target['@id'] = newCell.target.id;
                delete newCell.target.id;
                // rename typeID to property
                newCell.property = newCell.typeId;
                delete newCell.typeId;
                links.push(newCell);
                break;
        }
    }
    return {...emptyDiagram(), ...{layoutData: {'@type': 'Layout', elements, links}}};
}

export function newSerializedDiagram(
        params: {layoutData: LayoutData, linkTypeOptions: LinkTypeOptions[]}
    ): SerializedDiagram {
    return {...emptyDiagram(), ...{layoutData: params.layoutData, linkTypeOptions: params.linkTypeOptions}};
}

export function exportLayoutData(
    modelElements: ReadonlyArray<DiagramElement>,
    modelLinks: ReadonlyArray<DiagramLink>,
): LayoutData {
    const elements = modelElements.map((element): LayoutElement => ({
        '@type': 'Element',
        '@id': element.id,
        iri: element.iri,
        position: element.position,
        size: element.size,
        isExpanded: element.isExpanded,
        group: element.group,
    }));
    const links = modelLinks.map((link): LayoutLink => ({
        '@type': 'Link',
        '@id': link.id,
        property: link.typeId,
        source: {'@id': link.sourceId},
        target: {'@id': link.targetId},
        vertices: [...link.vertices],
    }));
    return {'@type': 'Layout', elements, links};
}

export const diagramContextV1 = {
    '@context': {
        'ontodia': 'http://ontodia.org/schema/v1#',
        // classes
        'Diagram': 'ontodia:Diagram',
        'Element': 'ontodia:Element',
        'Link': 'ontodia:Link',
        'Layout': 'ontodia:Layout',
        'LinkTypeOptions': 'ontodia:LinkTypeOptions',
        // properties
        'layoutData': 'ontodia:layoutData',
        'elements': 'ontodia:hasElement',
        // 'linkTypeOptions': 'ontodia:linkTypeOptions',
        'links': 'ontodia:hasLink',
        // element
        'iri': {'@id': 'ontodia:resource', '@type': '@id'},
        'position': 'ontodia:position',
        'x': 'ontodia:xCoordValue',
        'y': 'ontodia:yCoordValue',
        'size': 'ontodia:size',
        'height': 'ontodia:height',
        'width': 'ontodia:width',
        'isExpanded': 'ontodia:isExpanded',
        // link
        'property': {'@id': 'ontodia:property', '@type': '@id'},
        'source': 'ontodia:source',
        'target': 'ontodia:target',
        'vertices': {'@id': 'ontodia:vertex', '@container' : '@list'},
        '@base': 'http://ontodia.org/data/',
        // link type options
        'visible': 'ontodia:visible',
        'showLabel': 'ontodia:showLabel',
    }
};
