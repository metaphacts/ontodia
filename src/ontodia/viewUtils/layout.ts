import * as cola from 'webcola';

export interface LayoutNode {
    id?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    bounds?: any;
    innerBounds?: any;
}

export interface LayoutLink {
    source: LayoutNode;
    target: LayoutNode;
}

export function forceLayout(params: {
    iterations: number;
    nodes: LayoutNode[];
    links: LayoutLink[];
    preferredLinkLength: number;
}) {
    const layout = new cola.Layout()
        .nodes(params.nodes)
        .links(params.links)
        .convergenceThreshold(1e-9)
        .jaccardLinkLengths(params.preferredLinkLength)
        .handleDisconnected(true);
    layout.start(params.iterations, 0, params.iterations/3, undefined, false);
}

export function flowLayout(params: {
    iterations: number;
    nodes: LayoutNode[];
    links: LayoutLink[];
    preferredLinkLength: number;
}) {
    const layout = new cola.Layout()
        .flowLayout('y', 300)
        .nodes(params.nodes)
        .links(params.links)
        .convergenceThreshold(1e-9)
        .jaccardLinkLengths(params.preferredLinkLength)
        .handleDisconnected(true);
    layout.start(params.iterations, 0, params.iterations/3, undefined, false);
}

export function removeOverlaps(nodes: LayoutNode[]) {
    const nodeRectangles: cola.vpsc.Rectangle[] = [];
    for (const node of nodes) {
        nodeRectangles.push(new cola.vpsc.Rectangle(
            node.x, node.x + node.width,
            node.y, node.y + node.height));
    }

    cola.vpsc.removeOverlaps(nodeRectangles);

    for (let i = 0; i < nodeRectangles.length; i++) {
        const node = nodes[i];
        const rectangle = nodeRectangles[i];
        node.x = rectangle.x;
        node.y = rectangle.y;
    }
}

export function translateToPositiveQuadrant(params: {
    nodes: LayoutNode[];
    padding?: { x: number; y: number; };
}) {
    let minX = Infinity, minY = Infinity;
    for (const node of params.nodes) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
    }

    const {padding = {x: 0, y: 0}} = params;
    for (const node of params.nodes) {
        node.x = node.x - minX + padding.x;
        node.y = node.y - minY + padding.y;
    }
}

export function translateToCenter(params: {
    nodes: LayoutNode[];
    paperSize: { width: number; height: number; };
    contentBBox: { x: number, y: number, width: number; height: number; };
}) {
    const {paperSize, contentBBox} = params;
    const graphPos = {
        x: (paperSize.width - contentBBox.width) / 2 - contentBBox.x,
        y: (paperSize.height - contentBBox.height) / 2 - contentBBox.y,
    };

    for (const node of params.nodes) {
        node.x = graphPos.x + node.x;
        node.y = graphPos.y + node.y;
    }
}

export function uniformGrid(params: {
    rows: number;
    cellSize: { x: number; y: number; };
}): (cellIndex: number) => LayoutNode {
    return cellIndex => {
        const row = Math.floor(cellIndex / params.rows);
        const column = cellIndex - row * params.rows;
        return {
            x: column * params.cellSize.x,
            y: row * params.cellSize.y,
            width: params.cellSize.x,
            height: params.cellSize.y,
        };
    };
}

export function padded(
    nodes: LayoutNode[],
    padding: { x: number; y: number; } | undefined,
    transform: () => void,
) {
    if (padding) {
        for (const node of nodes) {
            node.x -= padding.x;
            node.y -= padding.y;
            node.width += 2 * padding.x;
            node.height += 2 * padding.y;
        }
    }

    transform();

    if (padding) {
        for (const node of nodes) {
            node.x += padding.x;
            node.y += padding.y;
            node.width -= 2 * padding.x;
            node.height -= 2 * padding.y;
        }
    }
}
