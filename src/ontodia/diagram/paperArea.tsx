import * as React from 'react';

import { Debouncer, Cancellation, animateInterval, delay, easeInOutBezier } from '../viewUtils/async';
import { EventObserver, Events, EventSource, PropertyChange } from '../viewUtils/events';
import { isIE11 } from '../viewUtils/polyfills';
import { PropTypes } from '../viewUtils/react';
import { ToSVGOptions, ToDataURLOptions, toSVG, toDataURL, fitRectKeepingAspectRatio } from '../viewUtils/toSvg';

import { RestoreGeometry } from './commands';
import { Element, Link, Cell, LinkVertex } from './elements';
import { Vector, Rect, computePolyline, findNearestSegmentIndex } from './geometry';
import { Batch } from './history';
import { DiagramView, RenderingLayer, WidgetDescription, WidgetAttachment } from './view';
import { Paper, PaperTransform } from './paper';

export interface PaperAreaProps {
    view: DiagramView;
    zoomOptions?: ZoomOptions;
    hideScrollBars?: boolean;
    watermarkSvg?: string;
    watermarkUrl?: string;
    onDragDrop?: (e: DragEvent, paperPosition: { x: number; y: number }) => void;
    onZoom?: (scaleX: number, scaleY: number) => void;
}

export interface ZoomOptions {
    min?: number;
    max?: number;
    step?: number;
    /** Used when zooming to fit to limit zoom of small diagrams */
    maxFit?: number;
    fitPadding?: number;
    requireCtrl?: boolean;
}

export interface PaperAreaEvents {
    pointerDown: PointerEvent;
    pointerMove: PointerEvent;
    pointerUp: PointerUpEvent;
    scroll: { source: PaperArea };
    changeAnimatingGraph: PropertyChange<PaperArea, boolean>;
}

export interface PointerEvent {
    source: PaperArea;
    sourceEvent: React.MouseEvent<Element> | MouseEvent;
    target: Cell | undefined;
    panning: boolean;
}

export interface PointerUpEvent extends PointerEvent {
    triggerAsClick: boolean;
}

export interface PaperWidgetProps {
    paperArea?: PaperArea;
    paperTransform?: PaperTransform;
}

export interface State {
    readonly paperWidth?: number;
    readonly paperHeight?: number;
    readonly originX?: number;
    readonly originY?: number;
    readonly scale?: number;
    readonly paddingX?: number;
    readonly paddingY?: number;
    readonly renderedWidgets?: ReadonlyArray<WidgetDescription>;
}

export interface PaperAreaContextWrapper {
    ontodiaPaperArea: PaperAreaContext;
}

export interface PaperAreaContext {
    paperArea: PaperArea;
    view: DiagramView;
}

export const PaperAreaContextTypes: { [K in keyof PaperAreaContextWrapper]: any } = {
    ontodiaPaperArea: PropTypes.anything,
};

interface PointerMoveState {
    pointerMoved: boolean;
    target: Cell | undefined;
    panning: boolean;
    origin: {
        readonly pageX: number;
        readonly pageY: number;
    };
    batch: Batch;
    restoreGeometry: RestoreGeometry;
}

interface ViewportState {
    /** Center of the viewport in paper coordinates. */
    readonly center: Vector;
    readonly scale: Vector;
}

interface ViewportAnimation {
    readonly from: ViewportState;
    readonly to: ViewportState;
    readonly cancellation: Cancellation;
}

export interface ViewportOptions {
    /**
     * True if operation should be animated.
     * If duration is not provided assumes default one.
     */
    animate?: boolean;
    /**
     * Animation duration in milliseconds.
     * Implicitly sets `animate: true` if greater than zero.
     */
    duration?: number;
    /**
     * Elements to apply layout and zoomToFit operations.
     * (In other words we narrowing down viewPort to selected elements)
     */
    elements?: ReadonlySet<Element>;
}

export interface ScaleOptions extends ViewportOptions {
    pivot?: { x: number; y: number };
}

const CLASS_NAME = 'ontodia-paper-area';
const DEFAULT_ANIMATION_DURATION = 500;
const LEFT_MOUSE_BUTTON = 0;

export class PaperArea extends React.Component<PaperAreaProps, State> {
    static childContextTypes = PaperAreaContextTypes;

    private readonly listener = new EventObserver();
    private readonly source = new EventSource<PaperAreaEvents>();
    readonly events: Events<PaperAreaEvents> = this.source;

    private outer: HTMLDivElement;
    private area: HTMLDivElement;
    private widgets: { [key: string]: WidgetDescription } = {};

    private readonly pageSize = {x: 1500, y: 800};

    private viewportAnimation: ViewportAnimation | undefined;
    private cssAnimations = 0;

    private movingState: PointerMoveState | undefined;
    private panningScrollOrigin: { scrollLeft: number; scrollTop: number };
    private movingElementOrigin: {
        pointerX: number;
        pointerY: number;
        elementX: number;
        elementY: number;
    };

    private delayedPaperAdjust = new Debouncer();
    private scrollBeforeUpdate: undefined | {
        left: number;
        top: number;
    };

    private get zoomOptions(): ZoomOptions {
        const {
            min = 0.2, max = 2, step = 0.1, maxFit = 1, fitPadding = 20, requireCtrl = true,
        } = this.props.zoomOptions || {};
        return {min, max, step, maxFit, fitPadding, requireCtrl};
    }

    constructor(props: PaperAreaProps, context: any) {
        super(props, context);
        this.state = {
            paperWidth: this.pageSize.x,
            paperHeight: this.pageSize.y,
            originX: 0,
            originY: 0,
            scale: 1,
            paddingX: 0,
            paddingY: 0,
            renderedWidgets: [],
        };
    }

    getChildContext(): PaperAreaContextWrapper {
        const {view} = this.props;
        const ontodiaPaperArea: PaperAreaContext = {paperArea: this, view};
        return {ontodiaPaperArea};
    }

    render() {
        const {view, watermarkSvg, watermarkUrl} = this.props;
        const {
            paperWidth, paperHeight, originX,
            originY, scale, paddingX, paddingY,
            renderedWidgets
        } = this.state;
        const paperTransform: PaperTransform = {
            width: paperWidth, height: paperHeight,
            originX, originY, scale, paddingX, paddingY,
        };
        const widgetProps: PaperWidgetProps = {paperArea: this, paperTransform};

        let areaClass = `${CLASS_NAME}__area`;
        if (this.props.hideScrollBars) {
            areaClass += ` ${CLASS_NAME}--hide-scrollbars`;
        }

        let componentClass = CLASS_NAME;
        if (this.isAnimatingGraph()) {
            componentClass += ` ${CLASS_NAME}--animated`;
        }

        return (
            <div className={componentClass} ref={this.onOuterMount}>
                <div className={areaClass}
                    ref={this.onAreaMount}
                    onMouseDown={this.onAreaPointerDown}>
                    <Paper view={view}
                        paperTransform={paperTransform}
                        onPointerDown={this.onPaperPointerDown}
                        linkLayerWidgets={
                            <div className={`${CLASS_NAME}__widgets`} onMouseDown={this.onWidgetsMouseDown}>
                                {renderedWidgets.filter(w => w.attachment === WidgetAttachment.OverLinks).map(
                                    widget => React.cloneElement(widget.element, widgetProps)
                                )}
                            </div>
                        }
                        elementLayerWidgets={
                            <div className={`${CLASS_NAME}__widgets`} onMouseDown={this.onWidgetsMouseDown}>
                                {renderedWidgets.filter(w => w.attachment === WidgetAttachment.OverElements).map(
                                    widget => React.cloneElement(widget.element, widgetProps)
                                )}
                            </div>
                        } />
                    {watermarkSvg ? (
                        <a href={watermarkUrl} target='_blank' rel='noopener'>
                            <img className={`${CLASS_NAME}__watermark`} src={watermarkSvg} draggable={false} />
                        </a>
                    ) : null}
                </div>
                {renderedWidgets.filter(w => w.attachment === WidgetAttachment.Viewport).map(widget => {
                    return React.cloneElement(widget.element, widgetProps);
                })}
            </div>
        );
    }

    private onOuterMount = (outer: HTMLDivElement) => { this.outer = outer; };
    private onAreaMount = (area: HTMLDivElement) => { this.area = area; };

    componentDidMount() {
        this.adjustPaper(() => this.centerTo());

        const {view} = this.props;
        const delayedAdjust = () => this.delayedPaperAdjust.call(this.adjustPaper);
        this.listener.listen(view.model.events, 'changeCells', delayedAdjust);
        this.listener.listen(view.model.events, 'elementEvent', ({data}) => {
            if (data.changePosition || data.changeSize) {
                delayedAdjust();
            }
        });
        this.listener.listen(view.model.events, 'linkEvent', ({data}) => {
            if (data.changeVertices) {
                delayedAdjust();
            }
        });
        this.listener.listen(view.events, 'syncUpdate', ({layer}) => {
            if (layer !== RenderingLayer.PaperArea) { return; }
            this.delayedPaperAdjust.runSynchronously();
        });
        this.listener.listen(view.events, 'updateWidgets', ({widgets}) => {
            this.updateWidgets(widgets);
        });

        this.area.addEventListener('dragover', this.onDragOver);
        this.area.addEventListener('drop', this.onDragDrop);
        this.area.addEventListener('scroll', this.onScroll);
        this.area.addEventListener('wheel', this.onWheel, isIE11() ? false : {passive: false});
    }

    componentDidUpdate(prevProps: PaperAreaProps, prevState: State) {
        if (this.scrollBeforeUpdate) {
            const {scale, originX, originY, paddingX, paddingY} = this.state;
            const scrollX = (originX - prevState.originX) * scale + (paddingX - prevState.paddingX);
            const scrollY = (originY - prevState.originY) * scale + (paddingY - prevState.paddingY);

            const scrollLeft = this.scrollBeforeUpdate.left + scrollX;
            const scrollTop = this.scrollBeforeUpdate.top + scrollY;

            this.area.scrollLeft = scrollLeft;
            this.area.scrollTop = scrollTop;

            this.scrollBeforeUpdate = undefined;
        }
    }

    componentWillUnmount() {
        this.stopListeningToPointerMove();
        this.listener.stopListening();
        this.area.removeEventListener('dragover', this.onDragOver);
        this.area.removeEventListener('drop', this.onDragDrop);
        this.area.removeEventListener('scroll', this.onScroll);
        this.area.removeEventListener('wheel', this.onWheel);
    }

    private updateWidgets(update: { [key: string]: WidgetDescription }) {
        this.widgets = {...this.widgets, ...update};
        const renderedWidgets = Object.keys(this.widgets)
            .filter(key => this.widgets[key])
            .map(key => {
                const widget = this.widgets[key];
                const element = React.cloneElement(widget.element, {key});
                return {...widget, element};
            });
        this.setState({renderedWidgets});
    }

    private onWidgetsMouseDown = (e: React.MouseEvent<any>) => {
        // prevent PaperArea from generating click on a blank area
        e.stopPropagation();
    }

    pageToPaperCoords(pageX: number, pageY: number) {
        const {left, top} = this.area.getBoundingClientRect();
        return this.clientToPaperCoords(
            pageX - (left + window.pageXOffset),
            pageY - (top + window.pageYOffset),
        );
    }

    clientToPaperCoords(areaClientX: number, areaClientY: number) {
        const {x: paneX, y: paneY} = this.clientToScrollablePaneCoords(areaClientX, areaClientY);
        return this.scrollablePaneToPaperCoords(paneX, paneY);
    }

    clientToScrollablePaneCoords(areaClientX: number, areaClientY: number) {
        const {paddingX, paddingY} = this.state;
        const paneX = areaClientX + this.area.scrollLeft - paddingX;
        const paneY = areaClientY + this.area.scrollTop - paddingY;
        return {x: paneX, y: paneY};
    }

    scrollablePaneToPaperCoords(paneX: number, paneY: number) {
        const {scale, paddingX, paddingY, originX, originY} = this.state;
        const paperX = paneX / scale - originX;
        const paperY = paneY / scale - originY;
        return {x: paperX, y: paperY};
    }

    paperToScrollablePaneCoords(paperX: number, paperY: number) {
        const {scale, paddingX, paddingY, originX, originY} = this.state;
        const paneX = (paperX + originX) * scale;
        const paneY = (paperY + originY) * scale;
        return {x: paneX, y: paneY};
    }

    /** Returns bounding box of paper content in paper coordinates. */
    getContentFittingBox() {
        const {elements, links} = this.props.view.model;
        return getContentFittingBox(elements, links);
    }

    /** Returns paper size in paper coordinates. */
    getPaperSize(): { width: number; height: number } {
        const {paperWidth: width, paperHeight: height, scale} = this.state;
        return {width: width / scale, height: height / scale};
    }

    getAreaMetrics() {
        const {clientWidth, clientHeight, offsetWidth, offsetHeight} = this.area;
        return {clientWidth, clientHeight, offsetWidth, offsetHeight};
    }

    private computeAdjustedBox(): Partial<State> {
        // bbox in paper coordinates
        const bbox = this.getContentFittingBox();
        const bboxLeft = bbox.x;
        const bboxTop = bbox.y;
        const bboxRight = bbox.x + bbox.width;
        const bboxBottom = bbox.y + bbox.height;

        const {x: gridWidth, y: gridHeight} = this.pageSize;

        // bbox in integer grid coordinates (open-closed intervals)
        const bboxGrid = {
            left: Math.floor(bboxLeft / gridWidth),
            top: Math.floor(bboxTop / gridHeight),
            right: Math.ceil(bboxRight / gridWidth),
            bottom: Math.ceil(bboxBottom / gridHeight),
        };

        // const oldOrigin = this.paper.options.origin;
        const originX = -bboxGrid.left * gridWidth;
        const originY = -bboxGrid.top * gridHeight;

        const paperWidth = Math.max(bboxGrid.right - bboxGrid.left, 1) * gridWidth;
        const paperHeight = Math.max(bboxGrid.bottom - bboxGrid.top, 1) * gridHeight;

        return {paperWidth, paperHeight, originX, originY};
    }

    private adjustPaper = (callback?: () => void) => {
        const {clientWidth, clientHeight} = this.area;
        const adjusted: Partial<State> = {
            ...this.computeAdjustedBox(),
            paddingX: Math.ceil(clientWidth),
            paddingY: Math.ceil(clientHeight),
        };
        const previous = this.state;
        const samePaperProps = (
            adjusted.paperWidth === previous.paperWidth &&
            adjusted.paperHeight === previous.paperHeight &&
            adjusted.originX === previous.originX &&
            adjusted.originY === previous.originY &&
            adjusted.paddingX === previous.paddingX &&
            adjusted.paddingY === previous.paddingY
        );
        if (!samePaperProps) {
            this.scrollBeforeUpdate = {
                left: this.area.scrollLeft,
                top: this.area.scrollTop,
            };
            this.setState(adjusted, callback);
        } else if (callback) {
            callback();
        }
    }

    private shouldStartZooming(e: MouseEvent | React.MouseEvent<any>) {
        return Boolean(e.ctrlKey) && Boolean(this.zoomOptions.requireCtrl) || !this.zoomOptions.requireCtrl;
    }

    private shouldStartPanning(e: MouseEvent | React.MouseEvent<any>) {
        const modifierPressed = e.ctrlKey || e.shiftKey || e.altKey;
        return e.button === LEFT_MOUSE_BUTTON && !modifierPressed;
    }

    private onPaperPointerDown = (e: React.MouseEvent<HTMLElement>, cell: Cell | undefined) => {
        if (this.movingState) { return; }

        const restore = RestoreGeometry.capture(this.props.view.model);
        const batch = this.props.view.model.history.startBatch(restore.title);

        if (cell && e.button === LEFT_MOUSE_BUTTON) {
            if (cell instanceof Element) {
                e.preventDefault();
                this.startMoving(e, cell);
                this.listenToPointerMove(e, cell, batch, restore);
            } else {
                e.preventDefault();
                this.listenToPointerMove(e, cell, batch, restore);
            }
        } else {
            e.preventDefault();
            this.listenToPointerMove(e, undefined, batch, restore);
        }
    }

    private onAreaPointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === this.area) {
            this.onPaperPointerDown(e, undefined);
        }
    }

    private startMoving(e: React.MouseEvent<HTMLElement>, element: Element) {
        const {x: pointerX, y: pointerY} = this.pageToPaperCoords(e.pageX, e.pageY);
        const {x: elementX, y: elementY} = element.position;
        this.movingElementOrigin = {pointerX, pointerY, elementX, elementY};
    }

    private startPanning(event: React.MouseEvent<any>) {
        const {scrollLeft, scrollTop} = this.area;
        this.panningScrollOrigin = {scrollLeft, scrollTop};
        this.clearTextSelectionInArea();
    }

    /** Clears accidental text selection in the diagram area. */
    private clearTextSelectionInArea() {
        if (document.getSelection) {
            const selection = document.getSelection();
            if (selection.removeAllRanges) {
                selection.removeAllRanges();
            }
        }
    }

    private generateLinkVertex(link: Link, location: Vector): LinkVertex {
        const previous = link.vertices;
        const vertices = previous ? [...previous] : [];
        const model = this.props.view.model;
        const polyline = computePolyline(
            model.getElement(link.sourceId),
            model.getElement(link.targetId),
            vertices,
        );
        const segmentIndex = findNearestSegmentIndex(polyline, location);
        return new LinkVertex(link, segmentIndex);
    }

    private listenToPointerMove(
        event: React.MouseEvent<any>,
        cell: Cell | undefined,
        batch: Batch,
        restoreGeometry: RestoreGeometry,
    ) {
        if (this.movingState) { return; }
        const panning = cell === undefined && this.shouldStartPanning(event);
        if (panning) {
            this.startPanning(event);
        }
        const {pageX, pageY} = event;
        this.movingState = {
            origin: {pageX, pageY},
            target: cell,
            panning,
            pointerMoved: false,
            batch,
            restoreGeometry,
        };
        document.addEventListener('mousemove', this.onPointerMove);
        document.addEventListener('mouseup', this.stopListeningToPointerMove);
        this.source.trigger('pointerDown', {
            source: this, sourceEvent: event, target: cell, panning,
        });
    }

    private onPointerMove = (e: MouseEvent) => {
        if (!this.movingState || this.scrollBeforeUpdate) { return; }

        const {origin, target, panning} = this.movingState;
        const pageOffsetX = e.pageX - origin.pageX;
        const pageOffsetY = e.pageY - origin.pageY;
        if (Math.abs(pageOffsetX) >= 1 && Math.abs(pageOffsetY) >= 1) {
            this.movingState.pointerMoved = true;
        }

        if (typeof target === 'undefined') {
            if (panning) {
                this.area.scrollLeft = this.panningScrollOrigin.scrollLeft - pageOffsetX;
                this.area.scrollTop = this.panningScrollOrigin.scrollTop - pageOffsetY;
            }
            this.source.trigger('pointerMove', {source: this, sourceEvent: e, target, panning});
        } else if (target instanceof Element) {
            const {x, y} = this.pageToPaperCoords(e.pageX, e.pageY);
            const {pointerX, pointerY, elementX, elementY} = this.movingElementOrigin;
            target.setPosition({
                x: elementX + x - pointerX,
                y: elementY + y - pointerY,
            });
            this.source.trigger('pointerMove', {source: this, sourceEvent: e, target, panning});
            this.props.view.performSyncUpdate();
        } else if (target instanceof Link) {
            const location = this.pageToPaperCoords(e.pageX, e.pageY);
            const linkVertex = this.generateLinkVertex(target, location);
            linkVertex.createAt(location);
            this.movingState.target = linkVertex;
        } else if (target instanceof LinkVertex) {
            const location = this.pageToPaperCoords(e.pageX, e.pageY);
            target.moveTo(location);
            this.source.trigger('pointerMove', {source: this, sourceEvent: e, target, panning});
            this.props.view.performSyncUpdate();
        }
    }

    private stopListeningToPointerMove = (e?: MouseEvent) => {
        const movingState = this.movingState;
        this.movingState = undefined;

        if (movingState) {
            document.removeEventListener('mousemove', this.onPointerMove);
            document.removeEventListener('mouseup', this.stopListeningToPointerMove);
        }

        if (e && movingState) {
            const {pointerMoved, target, batch, restoreGeometry} = movingState;
            this.source.trigger('pointerUp', {
                source: this,
                sourceEvent: e,
                target,
                panning: movingState.panning,
                triggerAsClick: !pointerMoved,
            });

            const restore = restoreGeometry.filterOutUnchanged();
            if (restore.hasChanges()) {
                batch.history.registerToUndo(restore);
            }
            batch.store();
        }
    }

    private onWheel = (e: MouseWheelEvent) => {
        if (this.shouldStartZooming(e)) {
            e.preventDefault();
            const delta = Math.max(-1, Math.min(1, e.deltaY || e.deltaX));
            const pivot = this.pageToPaperCoords(e.pageX, e.pageY);
            this.zoomBy(-delta * 0.1, {pivot});
        }
    }

    centerTo(paperPosition?: { x: number; y: number }, options: ViewportOptions = {}): Promise<void> {
        const {paperWidth, paperHeight} = this.state;
        const paperCenter = paperPosition || {x: paperWidth / 2, y: paperHeight / 2};
        const viewportState: Partial<ViewportState> = {
            center: paperCenter,
        };
        return this.setViewportState(viewportState, options);
    }

    centerContent(options: ViewportOptions = {}): Promise<void> {
        const bbox = this.getContentFittingBox();
        return this.centerTo({
            x: bbox.x + bbox.width / 2,
            y: bbox.y + bbox.height / 2,
        }, options);
    }

    getScale() {
        return this.state.scale;
    }

    setScale(value: number, options?: ScaleOptions): Promise<void> {
        let scale = value;

        const {min, max} = this.zoomOptions;
        scale = Math.max(scale, min);
        scale = Math.min(scale, max);

        let viewportState: Partial<ViewportState>;
        if (options && options.pivot) {
            const {x, y} = options.pivot;
            const paperCenter = this.clientToPaperCoords(this.area.clientWidth / 2, this.area.clientHeight / 2);
            const previousScale = this.state.scale;
            const scaledBy = scale / previousScale;
            viewportState = {
                center: {
                    x: x - (x - paperCenter.x) / scaledBy,
                    y: y - (y - paperCenter.y) / scaledBy,
                },
                scale: {x: scale, y: scale},
            };
        } else {
            viewportState = {
                scale: {x: scale, y: scale},
            };
        }
        return this.setViewportState(viewportState, options);
    }

    zoomBy(value: number, options?: ScaleOptions) {
        return this.setScale(this.getScale() + value, options);
    }

    zoomIn(scaleOptions?: ScaleOptions) {
        return this.zoomBy(this.zoomOptions.step, scaleOptions);
    }

    zoomOut(scaleOptions?: ScaleOptions) {
        return this.zoomBy(-this.zoomOptions.step, scaleOptions);
    }

    zoomToFit(options: ViewportOptions = {}): Promise<void> {
        if (options.elements && options.elements.size === 0) { return; }
        if (this.props.view.model.elements.length === 0) {
            return this.centerTo();
        }

        let bbox;
        let elements: ReadonlyArray<Element>;
        if (options.elements) {
            const selectionElements: Element[] = [];
            options.elements.forEach(el => selectionElements.push(el));
            elements = selectionElements;
        } else {
            elements = this.props.view.model.elements;
        }
        bbox = getContentFittingBox(elements, []);
        return this.zoomToFitRect(bbox, options);
    }

    zoomToFitRect(
        bbox: Rect, options: ViewportOptions = {},
    ) {
        const {clientWidth, clientHeight} = this.area;

        if (bbox.width === 0) { return; }

        const {width} = fitRectKeepingAspectRatio(
            bbox.width, bbox.height,
            clientWidth, clientHeight,
        );

        let scale = width / bbox.width;
        const {min, maxFit} = this.zoomOptions;
        scale = Math.max(scale, min);
        scale = Math.min(scale, maxFit);

        const center = {
            x: bbox.x + bbox.width / 2,
            y: bbox.y + bbox.height / 2,
        };

        const viewPortState: ViewportState = {
            center,
            scale: {x: scale, y: scale},
        };

        return this.setViewportState(viewPortState, options);
    }

    private onDragOver = (e: DragEvent) => {
        // Necessary. Allows us to drop.
        if (e.preventDefault) { e.preventDefault(); }
        e.dataTransfer.dropEffect = 'move';
        const {x, y} = clientCoordsFor(this.area, e);
        return false;
    }

    private onDragDrop = (e: DragEvent) => {
        if (this.props.onDragDrop) {
            const {x, y} = clientCoordsFor(this.area, e);
            const paperPosition = this.clientToPaperCoords(x, y);
            this.props.onDragDrop(e, paperPosition);
        }
    }

    private onScroll = () => {
        this.source.trigger('scroll', {source: this});
    }

    private makeToSVGOptions(): ToSVGOptions {
        const svg = this.area.querySelector('.ontodia-paper__canvas');
        if (!svg) {
            throw new Error('Cannot find SVG canvas to export');
        }
        return {
            model: this.props.view.model,
            paper: svg as SVGSVGElement,
            contentBox: this.getContentFittingBox(),
            getOverlayedElement: id => this.area.querySelector(`[data-element-id='${id}']`) as HTMLElement,
            preserveDimensions: true,
            convertImagesToDataUris: true,
            elementsToRemoveSelector: '.ontodia-link__vertex-tools',
            watermarkSvg: this.props.watermarkSvg,
        };
    }

    exportSVG(): Promise<string> {
        return toSVG(this.makeToSVGOptions());
    }

    exportPNG(options: ToDataURLOptions): Promise<string> {
        return toDataURL({...options, ...this.makeToSVGOptions()});
    }

    isAnimatingGraph(): boolean {
        return this.cssAnimations > 0;
    }

    /**
     * Starts animation for graph elements and links.
     *
     * @param setupChanges immediately called function to perform animatable changes on graph
     * @param duration animation duration in milliseconds (requires custom CSS to override)
     * @returns promise which resolves when this animation ends
     */
    animateGraph(setupChanges: () => void, duration?: number): Promise<void> {
        this.changeGraphAnimationCount(+1);
        setupChanges();

        const timeout = typeof duration === 'number' ? duration : DEFAULT_ANIMATION_DURATION;
        return delay(timeout).then(() => this.onGraphAnimationEnd());
    }

    private onGraphAnimationEnd() {
        this.changeGraphAnimationCount(-1);
    }

    private changeGraphAnimationCount(change: number) {
        const newValue = this.cssAnimations + change;
        if (newValue < 0) { return; }

        const previous = this.isAnimatingGraph();
        this.cssAnimations = newValue;

        const current = this.isAnimatingGraph();
        if (previous !== current) {
            this.forceUpdate();
            this.source.trigger('changeAnimatingGraph', {source: this, previous});
        }
    }

    private get viewportState(): ViewportState {
        const {clientWidth, clientHeight} = this.area;
        const {originX, originY, paddingX, paddingY, scale} = this.state;

        const scrollCenterX = this.area.scrollLeft + clientWidth / 2 - paddingX;
        const scrollCenterY = this.area.scrollTop + clientHeight / 2 - paddingY;
        const paperCenter = {
            x: scrollCenterX / scale - originX,
            y: scrollCenterY / scale - originY,
        };

        return {
            center: paperCenter,
            scale: {
                x: scale,
                y: scale,
            }
        };
    }

    private setViewportState(state: Partial<ViewportState>, options?: ViewportOptions): Promise<void> {
        if (this.viewportAnimation) {
            this.viewportAnimation.cancellation.abort();
        }
        const from = this.viewportState;
        const to = {...from, ...state};
        const animate = options && (options.animate || options.duration > 0);
        if (animate) {
            const viewportAnimation: ViewportAnimation = {
                from, to, cancellation: new Cancellation(),
            };
            const durationMs = typeof options.duration === 'number'
                ? options.duration : DEFAULT_ANIMATION_DURATION;

            const awaitPromise = animateInterval(durationMs, progress => {
                const t = easeInOutBezier(progress);
                const computed: ViewportState = {
                    center: {
                        x: from.center.x + (to.center.x - from.center.x) * t,
                        y: from.center.y + (to.center.y - from.center.y) * t,
                    },
                    scale: {
                        x: from.scale.x + (to.scale.x - from.scale.x) * t,
                        y: from.scale.y + (to.scale.y - from.scale.y) * t,
                    },
                };
                this.applyViewportState(computed);
            }, viewportAnimation.cancellation);

            this.viewportAnimation = viewportAnimation;
            return awaitPromise.then(() => {
                this.viewportAnimation = undefined;
            });
        } else {
            this.applyViewportState(to);
            return Promise.resolve();
        }
    }

    applyViewportState = (targetState: ViewportState) => {
        const scale = targetState.scale.x;
        const paperCenter = targetState.center;

        this.setState({scale}, () => {
            const {originX, originY, paddingX, paddingY} = this.state;
            const scrollCenterX = (paperCenter.x + originX) * scale;
            const scrollCenterY = (paperCenter.y + originY) * scale;
            const {clientWidth, clientHeight} = this.area;

            this.area.scrollLeft = scrollCenterX - clientWidth / 2 + paddingX;
            this.area.scrollTop = scrollCenterY - clientHeight / 2 + paddingY;

            if (this.props.onZoom) {
                this.props.onZoom(scale, scale);
            }
        });
    }
}

function clientCoordsFor(container: HTMLElement, e: MouseEvent) {
    const target = (e.target instanceof SVGElement && e.target.ownerSVGElement !== null)
        ? e.target.ownerSVGElement : e.target as HTMLElement;
    const targetBox = target.getBoundingClientRect();
    const containerBox = container.getBoundingClientRect();
    return {
        x: e.offsetX + (targetBox.left - containerBox.left),
        y: e.offsetY + (targetBox.top - containerBox.top),
    };
}

export function getContentFittingBox(
    elements: ReadonlyArray<Element>, links: ReadonlyArray<Link>
): { x: number; y: number; width: number; height: number } {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const element of elements) {
        const {x, y} = element.position;
        const size = element.size;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + size.width);
        maxY = Math.max(maxY, y + size.height);
    }

    for (const link of links) {
        const vertices = link.vertices || [];
        for (const {x, y} of vertices) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }

    return {
        x: Number.isFinite(minX) ? minX : 0,
        y: Number.isFinite(minY) ? minY : 0,
        width: Number.isFinite(minX) && Number.isFinite(maxX) ? (maxX - minX) : 0,
        height: Number.isFinite(minY) && Number.isFinite(maxY) ? (maxY - minY) : 0,
    };
}
