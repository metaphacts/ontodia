import * as React from 'react';

import { Dictionary, ElementModel } from '../data/model';
import { Paper, Cell } from './paper';
import { Element } from './elements';
import { ElementLayer, ElementContext } from './elementLayer';
import { EventObserver } from '../viewUtils/events';
import {
    LayoutNode,
    LayoutLink,
    forceLayout,
    padded,
    removeOverlaps,
    translateToPositiveQuadrant,
} from '../viewUtils/layout';
import { getContentFittingBox } from './paperArea';
import { DiagramView } from './view';

export interface State {
    paperWidth?: number;
    paperHeight?: number;
    offsetX?: number;
    offsetY?: number;
}

export class EmbeddedLayer extends React.Component<{}, State> {
    static contextTypes = ElementContext;

    private readonly listener = new EventObserver();

    private layerOffsetLeft = 0;
    private layerOffsetTop = 0;

    private isNestedElementMoving: boolean = false;

    constructor(props: {}) {
        super(props);
        this.state = {paperWidth: 0, paperHeight: 0, offsetX: 0, offsetY: 0};
    }

    private open = () => {
        const element: Element = this.context.ontodiaElementContext.element;

        document.addEventListener('mouseup', this.onMouseUp);

        this.listener.listen(element.events, 'changePosition', () => {
            if (this.isNestedElementMoving) { return; }

            const {offsetX, offsetY} = this.getOffset();
            const {x, y} = this.getContentFittingBox();

            const diffX = offsetX - x;
            const diffY = offsetY - y;
            this.moveNestedElements(diffX, diffY);

            this.setState({offsetX, offsetY});
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

    private close = () => {
        document.removeEventListener('mouseup', this.onMouseUp);
        this.listener.stopListening();
        this.removeElements();
        this.setState({paperWidth: 0, paperHeight: 0, offsetX: 0, offsetY: 0});
    }

    componentDidMount() {
        this.open();
    }

    componentWillUnmount() {
        this.close();
    }

    private onMouseUp = () => {
        this.isNestedElementMoving = false;
    }

    private getNestedElements = () => {
        const {ontodiaElementContext} = this.context;
        const view: DiagramView = ontodiaElementContext.view;
        const element: Element = ontodiaElementContext.element;

        return view.model.elements.filter(el => el.group === element.id);
    }

    private getContentFittingBox = (): { x: number; y: number; width: number; height: number; } => {
        const nestedElements = this.getNestedElements();
        return getContentFittingBox(nestedElements, []);
    }

    private removeElements = () => {
        const view: DiagramView = this.context.ontodiaElementContext.view;

        this.getNestedElements().forEach((element: Element) =>
            view.model.removeElement(element.id)
        );
    }

    private loadEmbeddedElements = () => {
        const {ontodiaElementContext} = this.context;
        const view: DiagramView = ontodiaElementContext.view;
        const element: Element = ontodiaElementContext.element;
        const {id, data} = element;

        view.loadEmbeddedElements(data.id).then((res: Dictionary<ElementModel>) => {
            const elements = Object.keys(res).map(key => view.model.createElement(res[key], id));

            elements.forEach(this.listenNestedElement);

            view.model.requestElementData(elements);
            view.model.requestLinksOfType().then(() => {
                this.forceLayout();

                const {offsetX, offsetY} = this.getOffset();
                this.moveNestedElements(offsetX, offsetY);
            });
        });
    }

    private getOffset = (): { offsetX: number; offsetY: number; } => {
        const element: Element = this.context.ontodiaElementContext.element;
        const {x: elementX, y: elementY} = element.position;

        const offsetX = elementX + this.layerOffsetLeft;
        const offsetY = elementY + this.layerOffsetTop;

        return {offsetX, offsetY};
    }

    private moveNestedElements = (offsetX: number, offsetY: number) => {
        this.getNestedElements().forEach(element => {
            const {x, y} = element.position;
            const newPosition = {x: x + offsetX, y: y + offsetY};
            element.setPosition(newPosition);
        });
    }

    private listenNestedElement = (element: Element) => {
        this.listener.listen(element.events, 'changePosition', this.onNestedElementChange);
        this.listener.listen(element.events, 'changeSize', this.onNestedElementChange);
    }

    private onNestedElementChange = () => {
        const element: Element = this.context.ontodiaElementContext.element;
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
        const view: DiagramView = this.context.ontodiaElementContext.view;
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
        const scale: number = this.context.ontodiaElementContext.scale;
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
        const {ontodiaElementContext} = this.context;
        const view: DiagramView = ontodiaElementContext.view;
        const element: Element = ontodiaElementContext.element;
        const scale: number = ontodiaElementContext.scale;
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
