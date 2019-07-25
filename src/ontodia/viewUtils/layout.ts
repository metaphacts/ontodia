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
    fixedElements?: ReadonlySet<Element>;
    group?: string;
    selectedElements?: ReadonlySet<Element>;
}) {
    const grouping = computeGrouping(params.model.elements);
    const {layoutFunction, model, fixedElements, selectedElements} = params;

    if (selectedElements && selectedElements.size <= 1) {
        return;
    }
    internalRecursion(params.group);

    function internalRecursion(group: string) {
        const elementsToProcess = group
            ? grouping.get(group)
            : model.elements.filter(el => el.group === undefined);
        const elements = selectedElements
            ? elementsToProcess.filter(el => selectedElements.has(el))
            : elementsToProcess;

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
                fixed: fixedElements && fixedElements.has(element) ? 1 : 0,
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
            const offset: Vector = getContentFittingBox(elements, []);
            translateToPositiveQuadrant(nodes, offset);
        }

        const averagePosition = calcAveragePosition(elements);
        for (const node of nodes) {
            const element = model.getElement(node.id);
            element.setPosition({x: node.x, y: node.y});
        }

        if (selectedElements) {
            const newAveragePosition = calcAveragePosition(elements);
            const averageDiff = {
                x: averagePosition.x - newAveragePosition.x,
                y: averagePosition.y - newAveragePosition.y,
            };
            for (const node of nodes) {
                const element = model.getElement(node.id);
                element.setPosition({
                    x: node.x + averageDiff.x,
                    y: node.y + averageDiff.y,
                });
            }
        }
    }
}

export function calcAveragePosition(elements: ReadonlyArray<Element>): Vector {
    let xSum = 0;
    let ySum = 0;
    for (const element of elements) {
        xSum += element.position.x + element.size.width / 2;
        ySum += element.position.y + element.size.height / 2;
    }
    return {
        x: xSum / elements.length,
        y: ySum / elements.length,
    };
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
        const averageSourcePosition = calcAveragePosition(
            targetElement.links.map(link => {
                const linkSource = model.sourceOf(link);
                return linkSource !== targetElement ? linkSource : model.targetOf(link);
            }),
        );
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
    fixedElements?: ReadonlySet<Element>;
    padding?: Vector;
    group?: string;
}) {
    const {padding, model, group, fixedElements} = params;
    recursiveLayout({
        model,
        group,
        fixedElements,
        layoutFunction: (nodes) => {
            padded(nodes, padding, () => removeOverlaps(nodes));
        },
    });
}

export function recursiveForceLayout(params: {
    model: DiagramModel;
    fixedElements?: ReadonlySet<Element>;
    group?: string;
    selectedElements?: ReadonlySet<Element>;
}) {
    const {model, group, fixedElements, selectedElements} = params;
    recursiveLayout({
        model,
        group,
        fixedElements,
        selectedElements,
        layoutFunction: (nodes, links) => {
            if (fixedElements && fixedElements.size > 0) {
                padded(nodes, {x: 50, y: 50}, () => forceLayout({
                    nodes, links, preferredLinkLength: 200,
                    avoidOvelaps: true,
                }));
            } else {
                forceLayout({nodes, links, preferredLinkLength: 200});
                padded(nodes, {x: 50, y: 50}, () => removeOverlaps(nodes));
            }
        },
    });
}
