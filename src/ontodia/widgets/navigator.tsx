import * as React from 'react';
import { hcl } from 'd3-color';

import { DiagramView } from '../diagram/view';
import { PaperWidgetProps } from '../diagram/paperArea';

import { Debouncer } from '../viewUtils/async';
import { EventObserver } from '../viewUtils/events';
import {
    PaperTransform, totalPaneSize, paneTopLeft, paneFromPaperCoords, paperFromPaneCoords
} from '../diagram/paper';
import { Vector } from '../diagram/geometry';

export interface NavigatorProps extends PaperWidgetProps {
    view: DiagramView;
    width?: number;
    height?: number;
}

interface NavigatorTransform {
    scale: number;
    offset: Vector;
}

export class Navigator extends React.Component<NavigatorProps, {}> {
    static defaultProps: Partial<NavigatorProps> = {
        width: 300,
        height: 160,
    };

    private readonly delayedRedraw = new Debouncer();
    private readonly listener = new EventObserver();
    private canvas: HTMLCanvasElement;

    private transform: NavigatorTransform;
    private isDraggingViewport: boolean;

    componentDidMount() {
        const {view, paperArea} = this.props;
        this.listener.listen(view.model.events, 'changeCells', this.scheduleRedraw);
        this.listener.listen(view.model.events, 'elementEvent', this.scheduleRedraw);
        this.listener.listen(paperArea.events, 'pointerMove', this.scheduleRedraw);
        this.listener.listen(paperArea.events, 'scroll', this.scheduleRedraw);
    }

    shouldComponentUpdate() {
        return false;
    }

    componentWillUnmount() {
        this.delayedRedraw.dispose();
        this.listener.stopListening();
        this.stopDraggingViewport();
    }

    private scheduleRedraw = () => {
        this.delayedRedraw.call(this.draw);
    }

    private draw = () => {
        const {paperTransform: pt, width, height} = this.props;

        this.calculateTransform();

        const ctx = this.canvas.getContext('2d');
        ctx.fillStyle = '#EEEEEE';
        ctx.clearRect(0, 0, width, height);
        ctx.fillRect(0, 0, width, height);

        const paneStart = paneTopLeft(pt);
        const paneSize = totalPaneSize(pt);
        const paneEnd = {
            x: paneStart.x + paneSize.x,
            y: paneStart.y + paneSize.y,
        };

        const start = canvasFromPaneCoords(paneStart, pt, this.transform);
        const end = canvasFromPaneCoords(paneEnd, pt, this.transform);
        ctx.fillStyle = 'white';
        ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);

        ctx.save();

        this.drawElements(ctx);
        this.drawViewport(ctx);

        ctx.restore();
    }

    private drawElements(ctx: CanvasRenderingContext2D) {
        const {view, paperTransform: pt} = this.props;
        view.model.elements.forEach(element => {
            const {position, size} = element;
            const {color: {h, c, l}} = view.getTypeStyle(element.data.types);
            ctx.fillStyle = hcl(h, c, l).toString();

            const {x: x1, y: y1} = canvasFromPaperCoords(position, pt, this.transform);
            const {x: x2, y: y2} = canvasFromPaperCoords({
                x: position.x + size.width,
                y: position.y + size.height,
            }, pt, this.transform);

            ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        });
    }

    private drawViewport(ctx: CanvasRenderingContext2D) {
        const {paperArea, paperTransform: pt} = this.props;

        ctx.strokeStyle = '#337ab7';
        ctx.lineWidth = 2;

        const {clientWidth, clientHeight} = paperArea.getAreaMetrics();
        const viewportStart = paperArea.clientToScrollablePaneCoords(0, 0);
        const viewportEnd = paperArea.clientToScrollablePaneCoords(clientWidth, clientHeight);

        const {x: x1, y: y1} = canvasFromPaneCoords(viewportStart, pt, this.transform);
        const {x: x2, y: y2} = canvasFromPaneCoords(viewportEnd, pt, this.transform);

        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }

    private calculateTransform() {
        const {paperTransform: pt, width, height} = this.props;
        const paneSize = totalPaneSize(pt);
        const scaleX = width / paneSize.x;
        const scaleY = height / paneSize.y;
        const scale = Math.min(scaleX, scaleY);
        const offset = {
            x: (width - paneSize.x * scale) / 2,
            y: (height - paneSize.y * scale) / 2,
        };
        this.transform = {scale, offset};
    }

    private canvasFromPageCoords(pageX: number, pageY: number): Vector {
        const {top, left} = this.canvas.getBoundingClientRect();
        return {x: pageX - left, y: pageY - top};
    }

    render() {
        const {width, height} = this.props;
        return (
            <canvas ref={canvas => this.canvas = canvas}
                className='ontodia-navigator'
                width={width}
                height={height}
                onMouseDown={e => {
                    this.startDragginViewport();
                    this.onDragViewport(e);
                }}
                onMouseMove={this.onDragViewport}
                onWheel={this.onWheel}
            />
        );
    }

    private startDragginViewport() {
        if (!this.isDraggingViewport) {
            this.isDraggingViewport = true;
            document.addEventListener('mouseup', this.onMouseUp);
        }
    }

    private stopDraggingViewport() {
        if (this.isDraggingViewport) {
            this.isDraggingViewport = false;
            document.removeEventListener('mouseup', this.onMouseUp);
        }
    }

    private onDragViewport = (e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        if (this.isDraggingViewport) {
            const canvas = this.canvasFromPageCoords(e.pageX, e.pageY);
            const paper = paperFromCanvasCoords(canvas, this.props.paperTransform, this.transform);
            this.props.paperArea.centerTo(paper);
        }
    }

    private onMouseUp = () => {
        this.stopDraggingViewport();
    }

    private onWheel = (e: React.WheelEvent<{}>) => {
        e.preventDefault();
        const delta = Math.max(-1, Math.min(1, e.deltaY || e.deltaX));
        this.props.paperArea.zoomBy(-delta * 0.1);
    }
}

function canvasFromPaneCoords(pane: Vector, pt: PaperTransform, nt: NavigatorTransform): Vector {
    const start = paneTopLeft(pt);
    return {
        x: nt.offset.x + (pane.x - start.x) * nt.scale,
        y: nt.offset.y + (pane.y - start.y) * nt.scale,
    };
}

function canvasFromPaperCoords(paper: Vector, pt: PaperTransform, nt: NavigatorTransform): Vector {
    const pane = paneFromPaperCoords(paper, pt);
    return canvasFromPaneCoords(pane, pt, nt);
}

function paperFromCanvasCoords(canvas: Vector, pt: PaperTransform, nt: NavigatorTransform): Vector {
    const start = paneTopLeft(pt);
    const pane = {
        x: start.x + (canvas.x - nt.offset.x) / nt.scale,
        y: start.y + (canvas.y - nt.offset.y) / nt.scale,
    };
    return paperFromPaneCoords(pane, pt);
}
