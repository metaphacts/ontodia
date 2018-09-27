import * as cola from 'webcola';

import { DiagramModel } from '../diagram/model';
import { boundsOf, Vector, computeGrouping } from '../diagram/geometry';
import { Element } from '../diagram/elements';
import { EventObserver } from './events';
import { getContentFittingBox } from '../diagram/paperArea';

export interface LayoutNode {
    id?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    bounds?: any;
    fixed?: number;
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
    avoidOvelaps?: boolean;
}) {
    const layout = new cola.Layout()
        .nodes(params.nodes)
        .links(params.links)
        .avoidOverlaps(params.avoidOvelaps)
        .convergenceThreshold(1e-9)
        .jaccardLinkLengths(params.preferredLinkLength)
        .handleDisconnected(true);
    layout.start(30, 0, 10, undefined, false);
}

export function removeOverlaps(nodes: LayoutNode[]) {
    const nodeRectangles: cola.Rectangle[] = [];
    for (const node of nodes) {
        nodeRectangles.push(new cola.Rectangle(
            node.x, node.x + node.width,
            node.y, node.y + node.height));
    }

    cola.removeOverlaps(nodeRectangles);

    for (let i = 0; i < nodeRectangles.length; i++) {
        const node = nodes[i];
        const rectangle = nodeRectangles[i];
        node.x = rectangle.x;
        node.y = rectangle.y;
    }
}

export function translateToPositiveQuadrant(nodes: ReadonlyArray<LayoutNode>, offset: Vector) {
    let minX = Infinity, minY = Infinity;
    for (const node of nodes) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
    }

    const {x, y} = offset;
    for (const node of nodes) {
        node.x = node.x - minX + x;
        node.y = node.y - minY + y;
    }
}

export function uniformGrid(params: {
    rows: number;
    cellSize: Vector;
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
    padding: { x: number; y: number } | undefined,
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

export function recursiveLayout(params: {
    model: DiagramModel;
    layoutFunction: (nodes: LayoutNode[], links: LayoutLink[], group: string) => void;
    fixedElementIds?: ReadonlySet<string>;
    group?: string;
}) {
    const grouping = computeGrouping(params.model.elements);
    const {layoutFunction, model, fixedElementIds} = params;
    internalRecursion(params.group);

    function internalRecursion(group: string) {
        const elements = group
            ? grouping.get(group)
            : model.elements.filter(el => el.group === undefined);

        for (const element of elements) {
            if (grouping.has(element.id)) {
                internalRecursion(element.id);
            }
        }

        const nodes: LayoutNode[] = [];
        const nodeById: { [id: string]: LayoutNode } = {};
        for (const element of elements) {
            const {x, y, width, height} = boundsOf(element);
            const node: LayoutNode = {
                id: element.id,
                x, y, width, height,
                fixed: fixedElementIds && fixedElementIds.has(element.id) ? 1 : 0,
            };
            nodeById[element.id] = node;
            nodes.push(node);
        }

        const links: LayoutLink[] = [];
        for (const link of model.links) {
            if (!model.isSourceAndTargetVisible(link)) {
                continue;
            }
            const source = model.sourceOf(link);
            const target = model.targetOf(link);
            const sourceNode = nodeById[source.id];
            const targetNode = nodeById[target.id];
            if (sourceNode && targetNode) {
                links.push({source: sourceNode, target: targetNode});
            }
        }
        layoutFunction(nodes, links, group);

        if (group) {
            const offset = getContentFittingBox(elements, []);
            translateToPositiveQuadrant(nodes, offset);
        }

        for (const node of nodes) {
            const element = model.getElement(node.id);
            element.setPosition({x: node.x, y: node.y});
        }
    }
}

export function placeElementsAround(params: {
    model: DiagramModel;
    elements: ReadonlyArray<Element>;
    prefferedLinksLength: number;
    targetElement: Element;
    startAngle?: number;
}) {
    const {model, elements, targetElement, prefferedLinksLength} = params;
    const targetElementBounds = boundsOf(targetElement);
    const targetPosition: Vector = {
        x: targetElementBounds.x + targetElementBounds.width / 2,
        y: targetElementBounds.y + targetElementBounds.height / 2,
    };
    let outgoingAngle = 0;
    if (targetElement.links.length > 0) {
        let xSum = 0;
        let ySum = 0;
        for (const link of targetElement.links) {
            const linkSource = model.sourceOf(link);
            const source = linkSource !== targetElement ? linkSource : model.targetOf(link);
            xSum += source.position.x + source.size.width / 2;
            ySum += source.position.y + source.size.height / 2;
        }
        const averageSourcePosition: Vector = {
            x: xSum / targetElement.links.length, y: ySum / targetElement.links.length,
        };
        const vectorDiff: Vector = {
            x: targetPosition.x - averageSourcePosition.x, y: targetPosition.y - averageSourcePosition.y,
        };
        if (vectorDiff.x !== 0 || vectorDiff.y !== 0) {
            outgoingAngle = Math.atan2(vectorDiff.y, vectorDiff.x);
        }
    }

    const step = Math.min(Math.PI / elements.length, Math.PI / 6);
    const elementsSteck: Element[]  = [].concat(elements);

    const placeElementFromSteck = (curAngle: number, element: Element) => {
        if (element) {
            const size = element.size;
            element.setPosition({
                x: targetPosition.x + prefferedLinksLength * Math.cos(curAngle) - size.width / 2,
                y: targetPosition.y + prefferedLinksLength * Math.sin(curAngle) - size.height / 2,
            });
        }
    };

    const isOddLength = elementsSteck.length % 2 === 0;
    if (isOddLength) {
        for (let angle = step / 2; elementsSteck.length > 0; angle += step) {
            placeElementFromSteck(outgoingAngle - angle, elementsSteck.pop());
            placeElementFromSteck(outgoingAngle + angle, elementsSteck.pop());
        }
    } else {
        placeElementFromSteck(outgoingAngle, elementsSteck.pop());
        for (let angle = step; elementsSteck.length > 0; angle += step) {
            placeElementFromSteck(outgoingAngle - angle, elementsSteck.pop());
            placeElementFromSteck(outgoingAngle + angle, elementsSteck.pop());
        }
    }

    return new Promise(resolve => {
        const listener = new EventObserver();
        listener.listen(model.events, 'changeCells', () => {
            listener.stopListening();

            recursiveRemoveOverlaps({
                model,
                padding: { x: 15, y: 15 },
            });
            resolve();
        });
    });
}

export function recursiveRemoveOverlaps(params: {
    model: DiagramModel;
    fixedElementIds?: ReadonlySet<string>;
    padding?: Vector;
    group?: string;
}) {
    const {padding, model, group, fixedElementIds} = params;
    recursiveLayout({
        model,
        group,
        fixedElementIds,
        layoutFunction: (nodes) => {
            padded(nodes, padding, () => removeOverlaps(nodes));
        },
    });
}
