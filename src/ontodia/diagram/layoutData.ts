import { pick } from 'lodash';

import { ElementIri, LinkTypeIri } from '../data/model';

import { Element as DiagramElement, Link as DiagramLink } from './elements';
import { Vector, Size } from './geometry';

export interface LayoutData {
    readonly cells: LayoutCell[];
}

export type LayoutCell = LayoutElement | LayoutLink;

export interface LayoutElement {
    type: 'element';
    id: string;
    iri: ElementIri;
    position: Vector;
    size?: Size;
    angle?: number;
    isExpanded?: boolean;
    group?: string;
}

export interface LayoutLink {
    type: 'link';
    id: string;
    typeId: LinkTypeIri;
    source: { id: string };
    target: { id: string };
    vertices?: Array<Vector>;
}

const serializedCellProperties = [
    'id', 'type',                              // common properties
    'size', 'angle', 'isExpanded', 'position', 'iri', 'group', // element properties
    'typeId', 'source', 'target', 'vertices',  // link properties
];

export function normalizeImportedCell<Cell extends LayoutCell>(cell: Cell): Cell {
    let newCell: any = pick(cell, serializedCellProperties);
    if (newCell.type === 'Ontodia.Element') {
        newCell.type = 'element';
    }
    if (!newCell.iri) {
        newCell.iri = newCell.id;
    }
    return newCell;
}

export function exportLayoutData(
    elements: ReadonlyArray<DiagramElement>,
    links: ReadonlyArray<DiagramLink>,
): LayoutData {
    const elementData = elements.map((element): LayoutElement => ({
        type: 'element',
        id: element.id,
        iri: element.iri,
        position: element.position,
        size: element.size,
        isExpanded: element.isExpanded,
        group: element.group,
    }));
    const linkData = links.map((link): LayoutLink => ({
        type: 'link',
        id: link.id,
        typeId: link.typeId,
        source: {id: link.sourceId},
        target: {id: link.targetId},
        vertices: [...link.vertices],
    }));
    const cells = [...elementData, ...linkData];
    return {cells};
}
