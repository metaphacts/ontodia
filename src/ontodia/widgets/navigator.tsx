import * as React from 'react';
import { hcl } from 'd3-color';

import { Element } from '../diagram/elements';
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
    scalePadding?: number;
    expanded?: boolean;
}

interface NavigatorTransform {
    scale: number;
    canvasOffset: Vector;
    paneOffset: Vector;
}

const CLASS_NAME = 'ontodia-navigator';
const MIN_SCALE = 0.25;

interface State {
    expanded?: boolean;
}

export class Navigator extends React.Component<NavigatorProps, State> {
    static defaultProps: Partial<NavigatorProps> = {
        width: 300,
        height: 160,
        scalePadding: 0.2,
        expanded: true,
    };

    private readonly delayedRedraw = new Debouncer();
    private readonly listener = new EventObserver();
    private canvas: HTMLCanvasElement;

    private transform: NavigatorTransform;
    private isDraggingViewport: boolean;

    constructor(props: NavigatorProps, context: any) {
        super(props, context);
        this.state = {expanded: this.props.expanded};
    }

    componentDidMount() {
        const {view, paperArea} = this.props;
        this.listener.listen(view.events, 'changeHighlight', this.scheduleRedraw);
        this.listener.listen(view.model.events, 'changeCells', this.scheduleRedraw);
        this.listener.listen(view.model.events, 'elementEvent', this.scheduleRedraw);
        this.listener.listen(paperArea.events, 'pointerMove', this.scheduleRedraw);
        this.listener.listen(paperArea.events, 'scroll', this.scheduleRedraw);
    }

    shouldComponentUpdate(nextProps: NavigatorProps, nextState: State) {
        return nextState !== this.state;
    }

    componentWillUnmount() {
        this.delayedRedraw.dispose();
        this.listener.stopListening();
        this.stopDraggingViewport();
    }

    private scheduleRedraw = () => {
        if (this.state.expanded) {
            this.delayedRedraw.call(this.draw);
        }
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
            ctx.fillStyle = this.chooseElementColor(element);

            const {x: x1, y: y1} = canvasFromPaperCoords(position, pt, this.transform);
            const {x: x2, y: y2} = canvasFromPaperCoords({
                x: position.x + size.width,
                y: position.y + size.height,
            }, pt, this.transform);

            ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        });
    }

    private chooseElementColor(element: Element): string {
        const {view} = this.props;
        const isBlurred = view.highlighter && !view.highlighter(element);
        if (isBlurred) {
            return 'lightgray';
        }
        const {color: {h, c, l}} = view.getTypeStyle(element.data.types);
        return hcl(h, c, l).toString();
    }

    private drawViewport(ctx: CanvasRenderingContext2D) {
        const {paperArea, paperTransform: pt, width, height} = this.props;

        ctx.strokeStyle = '#337ab7';
        ctx.lineWidth = 2;

        const {clientWidth, clientHeight} = paperArea.getAreaMetrics();
        const viewportStart = paperArea.clientToScrollablePaneCoords(0, 0);
        const viewportEnd = paperArea.clientToScrollablePaneCoords(clientWidth, clientHeight);

        const {x: x1, y: y1} = canvasFromPaneCoords(viewportStart, pt, this.transform);
        const {x: x2, y: y2} = canvasFromPaneCoords(viewportEnd, pt, this.transform);

        // draw visible viewport rectangle
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        // draw "out of area" viewport borders
        ctx.beginPath();
        if (x1 < 0) {
            ctx.moveTo(0, y1);
            ctx.lineTo(0, y2);
        }
        if (y1 < 0) {
            ctx.moveTo(x1, 0);
            ctx.lineTo(x2, 0);
        }
        if (x2 > width) {
            ctx.moveTo(width, y1);
            ctx.lineTo(width, y2);
        }
        if (y2 > height) {
            ctx.moveTo(x1, height);
            ctx.lineTo(x2, height);
        }

        ctx.lineWidth = 4;
        ctx.strokeStyle = '#a0d2ff';
        ctx.setLineDash([5, 5]);
        ctx.stroke();
    }

    private calculateTransform() {
        const {paperArea, paperTransform: pt, width, height, scalePadding} = this.props;

        const box = paperArea.getContentFittingBox();
        const displayPadding: Vector = {
            x: Math.max(box.width, width / MIN_SCALE) * scalePadding,
            y: Math.max(box.height, height / MIN_SCALE) * scalePadding,
        };
        const displayStart = paneFromPaperCoords({
            x: box.x - displayPadding.x,
            y: box.y - displayPadding.y,
        }, pt);
        const displayEnd = paneFromPaperCoords({
            x: box.x + box.width + displayPadding.x,
            y: box.y + box.height + displayPadding.y,
        }, pt);
        const displaySize: Vector = {
            x: displayEnd.x - displayStart.x,
            y: displayEnd.y - displayStart.y,
        };

        const scale = Math.min(width / displaySize.x, height / displaySize.y);
        const canvasOffset: Vector = {
            x: (width - displaySize.x * scale) / 2,
            y: (height - displaySize.y * scale) / 2,
        };
        this.transform = {scale, canvasOffset, paneOffset: displayStart};
    }

    private canvasFromPageCoords(pageX: number, pageY: number): Vector {
        const {top, left} = this.canvas.getBoundingClientRect();
        return {
            x: pageX - left - window.pageXOffset,
            y: pageY - top - window.pageYOffset,
        };
    }

    render() {
        const {width, height} = this.props;
        const {expanded} = this.state;
        return (
            <div className={`${CLASS_NAME} ${CLASS_NAME}--${expanded ? 'expanded' : 'collapsed'}`}
                style={expanded ? {width, height} : undefined}>
                <canvas ref={canvas => this.canvas = canvas}
                    width={width}
                    height={height}
                    onMouseDown={e => {
                        this.startDragginViewport();
                        this.onDragViewport(e);
                    }}
                    onWheel={this.onWheel}
                />
                <button className={`${CLASS_NAME}__toggle`}
                    title={expanded ? 'Collapse navigator' : 'Expand navigator'}
                    onClick={this.onToggleClick}>
                    <div className={`${CLASS_NAME}__toggle-icon`} />
                </button>
            </div>
        );
    }

    private startDragginViewport() {
        if (!this.isDraggingViewport) {
            this.isDraggingViewport = true;
            document.addEventListener('mousemove', this.onDragViewport);
            document.addEventListener('mouseup', this.onMouseUp);
        }
    }

    private stopDraggingViewport() {
        if (this.isDraggingViewport) {
            this.isDraggingViewport = false;
            document.removeEventListener('mousemove', this.onDragViewport);
            document.removeEventListener('mouseup', this.onMouseUp);
        }
    }

    private onDragViewport = (e: MouseEvent | React.MouseEvent<{}>) => {
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

    private onToggleClick = () => {
        this.setState(
            (state): State => ({expanded: !state.expanded}),
            this.scheduleRedraw
        );
    }
}

function canvasFromPaneCoords(pane: Vector, pt: PaperTransform, nt: NavigatorTransform): Vector {
    return {
        x: nt.canvasOffset.x + (pane.x - nt.paneOffset.x) * nt.scale,
        y: nt.canvasOffset.y + (pane.y - nt.paneOffset.y) * nt.scale,
    };
}

function canvasFromPaperCoords(paper: Vector, pt: PaperTransform, nt: NavigatorTransform): Vector {
    const pane = paneFromPaperCoords(paper, pt);
    return canvasFromPaneCoords(pane, pt, nt);
}

function paperFromCanvasCoords(canvas: Vector, pt: PaperTransform, nt: NavigatorTransform): Vector {
    const pane = {
        x: nt.paneOffset.x + (canvas.x - nt.canvasOffset.x) / nt.scale,
        y: nt.paneOffset.y + (canvas.y - nt.canvasOffset.y) / nt.scale,
    };
    return paperFromPaneCoords(pane, pt);
}
