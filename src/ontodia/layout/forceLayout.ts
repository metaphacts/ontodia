import * as cola from 'webcola';

export interface LayoutNode {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface LayoutLink {
    source: number;
    target: number;
}

export function forceLayout(params: {
    nodes: LayoutNode[];
    links: LayoutLink[];
}) {
    const layout = new cola.Layout()
        .nodes(params.nodes)
        .links(params.links)
        .avoidOverlaps(true)
        .convergenceThreshold(1e-9)
        .linkDistance(200)
        .handleDisconnected(true);
    layout.start(30, 0, 10, undefined, false);
}
