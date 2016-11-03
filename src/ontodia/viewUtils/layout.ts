import * as cola from 'webcola';

export interface LayoutNode {
    id: string;
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
    nodes: LayoutNode[];
    links: LayoutLink[];
    preferredLinkLength: number;
}) {
    const layout = new cola.Layout()
        .nodes(params.nodes)
        .links(params.links)
        .avoidOverlaps(true)
        .convergenceThreshold(1e-9)
        .jaccardLinkLengths(params.preferredLinkLength)
        .handleDisconnected(true);
    layout.start(30, 0, 10, undefined, false);
}

export function flowLayout<Link extends LayoutLink>(params: {
    nodes: LayoutNode[];
    links: Link[];
    preferredLinkLength: number;
    route: (link: Link, path: any[]) => void
}) {
    const layout = new cola.Layout()
        .nodes(params.nodes)
        .links(params.links)
        .avoidOverlaps(true)
        .flowLayout('x', params.preferredLinkLength)
        .jaccardLinkLengths(params.preferredLinkLength);
    layout.start(30, 0, 10, undefined, false);

    for (const node of params.nodes) {
        node.innerBounds = node.bounds.inflate(-50);
    }

    layout.prepareEdgeRouting(50 / 3);
    for (const link of params.links) {
        params.route(link, layout.routeEdge(link, undefined));
    }
}
