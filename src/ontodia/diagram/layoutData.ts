import { pick } from 'lodash';

export interface LayoutData {
    readonly cells: LayoutCell[];
}

export type LayoutCell = LayoutElement | LayoutLink;

export interface LayoutElement {
    type: 'element';
    id: string;
    position: { x: number; y: number; };
    size?: any;
    angle?: number;
    isExpanded?: boolean;
}

export interface LayoutLink {
    type: 'link';
    id: string;
    typeId: string;
    source: { id: string };
    target: { id: string };
    vertices?: Array<{ x: number; y: number; }>;
}

const serializedCellProperties = [
    'id', 'type',                              // common properties
    'size', 'angle', 'isExpanded', 'position', // element properties
    'typeId', 'source', 'target', 'vertices',  // link properties
];

export function normalizeImportedCell<Cell extends LayoutCell>(cell: Cell): Cell {
    let newCell: any = pick(cell, serializedCellProperties);
    if (newCell.type === 'Ontodia.Element') {
        newCell.type = 'element';
    }
    return newCell;
}

export function cleanExportedLayout(layout: LayoutData): LayoutData {
    const cells = layout.cells.map(cell => pick(cell, serializedCellProperties) as LayoutCell);
    return {cells};
}
