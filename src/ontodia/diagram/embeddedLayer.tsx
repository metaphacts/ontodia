import * as React from 'react';

import { Dictionary, ElementModel } from '../data/model';
import { Paper } from './paper';
import { PaperAreaContextTypes, PaperAreaContextWrapper } from './paperArea';
import { Element, Cell } from './elements';
import { ElementLayer, ElementContextWrapper, ElementContextTypes } from './elementLayer';
import { EventObserver } from '../viewUtils/events';
import {
    LayoutNode,
    LayoutLink,
    forceLayout,
    padded,
    removeOverlaps,
    translateToPositiveQuadrant,
} from '../viewUtils/layout';

import { Vector } from './geometry';
import { getContentFittingBox } from './paperArea';
import { DiagramView } from './view';

export interface State {
    paperWidth?: number;
    paperHeight?: number;
    offsetX?: number;
    offsetY?: number;
}

export class EmbeddedLayer extends React.Component<{}, State> {
    static contextTypes = {...ElementContextTypes, ...PaperAreaContextTypes};

    context: ElementContextWrapper & PaperAreaContextWrapper;

    private readonly listener = new EventObserver();

    private layerOffsetLeft = 0;
    private layerOffsetTop = 0;

    private isApplyingParentMove = false;
    private isNestedElementMoving = false;
    private previousPositions: Array<{ id: string; position: Vector; }> = [];

    constructor(props: {}) {
        super(props);
        this.state = {paperWidth: 0, paperHeight: 0, offsetX: 0, offsetY: 0};
    }

    componentDidMount() {
        const {element} = this.context.ontodiaElement;
        const {paperArea} = this.context.ontodiaPaperArea;

        this.listener.listen(element.events, 'changePosition', () => {
            if (this.isNestedElementMoving) { return; }

            const {offsetX, offsetY} = this.getOffset();
            const {x, y} = this.getContentFittingBox();

            const diffX = offsetX - x;
            const diffY = offsetY - y;
            this.moveNestedElements(diffX, diffY);

            this.setState({offsetX, offsetY});
        });

        this.listener.listen(paperArea.events, 'pointerUp', e => {
            this.isNestedElementMoving = false;
        });

        const nestedElements = this.getNestedElements();
        nestedElements.forEach(this.listenNestedElement);

        if (nestedElements.length > 0) {
            const {
                x: offsetX,
                y: offsetY,
                width: paperWidth,
                height: paperHeight,
            } = this.getContentFittingBox();
            this.setState({offsetX, offsetY, paperWidth, paperHeight}, () => element.redraw());
        } else {
            this.loadEmbeddedElements();
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.removeElements();
        this.setState({paperWidth: 0, paperHeight: 0, offsetX: 0, offsetY: 0});
    }

    private getNestedElements = () => {
        const {view, element} = this.context.ontodiaElement;
        return view.model.elements.filter(el => el.group === element.id);
    }

    private getContentFittingBox = (): { x: number; y: number; width: number; height: number; } => {
        const nestedElements = this.getNestedElements();
        return getContentFittingBox(nestedElements, []);
    }

    private removeElements = () => {
        const {view} = this.context.ontodiaElement;
        const batch = view.model.history.startBatch();
        for (const element of this.getNestedElements()) {
            view.model.removeElement(element.id);
        }
        batch.discard();
    }

    private loadEmbeddedElements = () => {
        const {view, element} = this.context.ontodiaElement;

        view.loadEmbeddedElements(element.iri).then(models => {
            const batch = view.model.history.startBatch();
            const elementIris = Object.keys(models);
            const elements = elementIris.map(
                key => view.model.createElement(models[key], element.id)
            );
            batch.discard();

            elements.forEach(this.listenNestedElement);

            Promise.all([
                view.model.requestElementData(elementIris),
                view.model.requestLinksOfType(),
            ]).then(() => {
                view.performSyncUpdate();
                this.forceLayout();

                const {offsetX, offsetY} = this.getOffset();
                this.moveNestedElements(offsetX, offsetY);
            });
        });
    }

    private getOffset = (): { offsetX: number; offsetY: number; } => {
        const {element} = this.context.ontodiaElement;
        const {x: elementX, y: elementY} = element.position;

        const offsetX = elementX + this.layerOffsetLeft;
        const offsetY = elementY + this.layerOffsetTop;

        return {offsetX, offsetY};
    }

    private moveNestedElements = (offsetX: number, offsetY: number) => {
        this.isApplyingParentMove = true;
        try {
            for (const element of this.getNestedElements()) {
                const {x, y} = element.position;
                const newPosition = {x: x + offsetX, y: y + offsetY};
                element.setPosition(newPosition);
            }
        } finally {
            this.isApplyingParentMove = false;
            this.recomputeSelfBounds();
        }
    }

    private listenNestedElement = (element: Element) => {
        this.listener.listen(element.events, 'changePosition', this.recomputeSelfBounds);
        this.listener.listen(element.events, 'changeSize', this.recomputeSelfBounds);
    }

    private recomputeSelfBounds = () => {
        if (this.isApplyingParentMove) { return; }

        const {element} = this.context.ontodiaElement;
        const {x: offsetX, y: offsetY, width: paperWidth, height: paperHeight} = this.getContentFittingBox();

        if (this.isNestedElementMoving) {
            const position = {
                x: offsetX - this.layerOffsetLeft,
                y: offsetY - this.layerOffsetTop,
            };
            element.setPosition(position);
        }

        this.setState({offsetX, offsetY, paperWidth, paperHeight}, () => element.redraw());
    }

    private forceLayout = () => {
        const {view} = this.context.ontodiaElement;
        const elements = this.getNestedElements();

        const nodeById: { [id: string]: LayoutNode } = {};
        const nodes: LayoutNode[] = [];
        for (const element of elements) {
            const size = element.size;
            const position = element.position;

            const node: LayoutNode = {
                id: element.id,
                x: position.x,
                y: position.y,
                width: size.width,
                height: size.height,
            };
            nodeById[element.id] = node;
            nodes.push(node);
        }

        const links: LayoutLink[] = [];
        for (const link of view.model.links) {
            if (!view.model.isSourceAndTargetVisible(link)) { continue; }

            const source = view.model.sourceOf(link);
            const target = view.model.targetOf(link);

            const sourceNode = nodeById[source.id];
            const targetNode = nodeById[target.id];

            if (!sourceNode || !targetNode) { continue; }

            links.push({source: sourceNode, target: targetNode});
        }

        forceLayout({nodes, links, preferredLinkLength: 200});
        padded(nodes, {x: 10, y: 10}, () => removeOverlaps(nodes));
        translateToPositiveQuadrant({nodes, padding: {x: 0, y: 0}});

        for (const node of nodes) {
            const element = view.model.getElement(node.id);
            element.setPosition({x: node.x, y: node.y});
        }
    }

    private onPaperPointerDown = (e: React.MouseEvent<HTMLElement>, cell: Cell | undefined) => {
        if (e.button !== 0 /* left mouse button */) {
            return;
        }

        if (cell && cell instanceof Element) {
            e.preventDefault();
            this.isNestedElementMoving = true;
        }
    }

    private getParentElement = (layer: HTMLElement): HTMLElement => {
        const parent = layer.parentElement;

        if (parent.hasAttribute('data-element-id')) {
            return parent;
        }

        return this.getParentElement(parent);
    }

    private calculateOffset = (layer: HTMLElement): { left: number; top: number; } => {
        const {scale} = this.context.ontodiaElement;
        const parent = this.getParentElement(layer);
        const {left, top} = layer.getBoundingClientRect();
        const {left: parentLeft, top: parentTop} = parent.getBoundingClientRect();

        return {left: (left - parentLeft) / scale, top: (top - parentTop) / scale};
    }

    private onLayerInit = (layer: HTMLElement) => {
        if (!layer) { return; }

        const {left, top} = this.calculateOffset(layer);

        this.layerOffsetLeft = left;
        this.layerOffsetTop = top;
    }

    render() {
        const {view, element, scale} = this.context.ontodiaElement;
        const {paperWidth, paperHeight, offsetX, offsetY} = this.state;

        const style = {
            position: 'absolute', left: -offsetX, top: -offsetY,
        };

        return (
            <div className='ontodia-embedded-layer' ref={this.onLayerInit}>
                <Paper view={view}
                    width={paperWidth}
                    height={paperHeight}
                    originX={-offsetX}
                    originY={-offsetY}
                    scale={1}
                    paddingX={0}
                    paddingY={0}
                    onPointerDown={this.onPaperPointerDown}
                    group={element.id}>
                    <ElementLayer view={view} scale={scale} group={element.id} style={style} />
                </Paper>
            </div>
        );
    }
}
