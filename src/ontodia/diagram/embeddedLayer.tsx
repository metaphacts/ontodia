import * as React from 'react';

import { DiagramView } from './view';
import { Paper, Cell } from './paper';
import { Element } from './elements';
import { ElementLayer } from './elementLayer';
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

export interface Props {
    view: DiagramView;
    element: Element;
}

export class EmbeddedLayer extends React.Component<Props, void> {
    private readonly listener = new EventObserver();
    private layer: HTMLDivElement;
    private elements: Element[] = [];
    private offset: { x: number; y: number } = {x: 0, y: 0};
    private paperBox: {
        x: number; y: number; width: number; height: number;
    } = {x: 0, y: 0, width: 0, height: 0};

    private movingElement: Element;

    componentDidMount() {
        const {element} = this.props;

        document.addEventListener('mouseup', this.onMouseUp);

        this.listener.listenTo(element, 'change', () => {
            for (const changedKey in element.changed) {
                if (!element.changed.hasOwnProperty(changedKey)) { continue; }

                if (changedKey === 'position') {
                    this.setOffset(this.movingElement === undefined);
                    this.updateAll();
                }
            }
        });

        this.loadEmbeddedElements();
    }

    componentWillUnmount() {
        document.removeEventListener('mouseup', this.onMouseUp);
        this.listener.stopListening();
    }

    private onMouseUp = () => {
        this.movingElement = undefined;
    }

    private loadEmbeddedElements = () => {
        const {view, element} = this.props;
        const {id, template} = element;

        view.loadEmbeddedElements(id, template.id).then(res => {
            this.elements = Object.keys(res).map(key => view.model.createElement(res[key]));
            this.elements.forEach(this.listenElement);

            view.model.requestElementData(this.elements);
            view.model.requestLinksOfType().then(() => {
                this.forceLayout();
                this.setOffset();

                this.paperBox = getContentFittingBox(this.elements, []);
                this.props.element.trigger('state:loaded');

                this.updateAll();
            });
        });
    }

    private listenElement = (element: Element) => {
        this.listener.listenTo(element, 'change', () => {
            if (!this.movingElement || this.movingElement.id !== element.id) { return; }

            for (const changedKey in element.changed) {
                if (!element.changed.hasOwnProperty(changedKey)) { continue; }

                if (changedKey === 'position') {
                    this.onChangePosition();
                }
            }
        });
    }

    private onChangePosition = () => {
        this.paperBox = getContentFittingBox(this.elements, []);

        const {x, y} = this.paperBox;
        const {offsetLeft, offsetTop} = this.layer;

        this.props.element.set('position', {x: x - offsetLeft, y: y - offsetTop});
        this.props.element.trigger('state:loaded');

        this.updateAll();
    }

    private updateAll = () => this.forceUpdate();

    private forceLayout = () => {
        const {view} = this.props;

        const nodeById: { [id: string]: LayoutNode } = {};
        const nodes: LayoutNode[] = [];
        for (const element of this.elements) {
            const size = element.get('size');
            const position = element.get('position');

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
            view.model.getElement(node.id).position(node.x, node.y);
        }
    }

    private setOffset = (updatePositions = true) => {
        const {x: elementX, y: elementY} = this.props.element.get('position');
        const {offsetLeft, offsetTop} = this.layer;
        const {x: offsetX, y: offsetY} = this.offset;

        const newOffsetX = elementX + offsetLeft;
        const newOffsetY = elementY + offsetTop;

        this.offset = {x: newOffsetX, y: newOffsetY};

        if (updatePositions) {
            const diffX = newOffsetX - offsetX;
            const diffY = newOffsetY - offsetY;

            this.elements.forEach(element => {
                const {x, y} = element.get('position') || {x: 0, y: 0};
                const newPosition = {x: x + diffX, y: y + diffY};
                element.set('position', newPosition);
            });
        }
    }

    private onPaperPointerDown = (e: React.MouseEvent<HTMLElement>, cell: Cell | undefined) => {
        if (e.button !== 0 /* left mouse button */) {
            return;
        }

        if (cell && cell instanceof Element) {
            e.preventDefault();
            this.movingElement = cell;
        }
    }

    render() {
        const {view, element} = this.props;
        const {x: offsetX, y: offsetY} = this.offset;
        const {width, height} = this.paperBox;

        const style = {
            position: 'absolute', left: -offsetX, top: -offsetY,
        };

        return (
            <div className="ontodia-embedded-layer" ref={layer => this.layer = layer}>
                <Paper view={view}
                       width={width}
                       height={height}
                       originX={-offsetX}
                       originY={-offsetY}
                       scale={1}
                       paddingX={0}
                       paddingY={0}
                       onPointerDown={this.onPaperPointerDown}
                       group={element.id}>
                    <ElementLayer view={view} group={element.id} style={style} />
                </Paper>
            </div>
        );
    }
}
