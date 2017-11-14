import * as React from 'react';
import { ReactElement } from 'react';

import { EventObserver } from '../viewUtils/events';
import { Spinner, Props as SpinnerProps } from '../viewUtils/spinner';
import { ToSVGOptions, ToDataURLOptions, toSVG, toDataURL, fitRectKeepingAspectRatio } from '../viewUtils/toSvg';

import { Debouncer } from './dataFetchingThread';
import { Element, Link } from './elements';
import { ElementLayer } from './elementLayer';
import { Vector, computePolyline, findNearestSegmentIndex } from './geometry';
import { DiagramModel } from './model';
import { DiagramView, RenderingLayer } from './view';
import { Paper, Cell, LinkVertex, isLinkVertex } from './paper';

export interface Props {
    view: DiagramView;
    zoomOptions?: ZoomOptions;
    panningRequireModifiers?: boolean;
    onDragDrop?: (e: DragEvent, paperPosition: { x: number; y: number; }) => void;
    onZoom?: (scaleX: number, scaleY: number) => void;
}

export interface ZoomOptions {
    min?: number;
    max?: number;
    step?: number;
    /** Used when zooming to fit to limit zoom of small diagrams */
    maxFit?: number;
    fitPadding?: number;
}

export interface ScaleOptions {
    pivot?: { x: number; y: number; };
}

export interface PaperWidgetProps {
    paperArea?: PaperArea;
}

export interface State {
    readonly paperWidth?: number;
    readonly paperHeight?: number;
    readonly originX?: number;
    readonly originY?: number;
    readonly scale?: number;
    readonly paddingX?: number;
    readonly paddingY?: number;
    readonly renderedWidgets?: ReadonlyArray<ReactElement<any>>;
}

const CLASS_NAME = 'ontodia-paper-area';

export class PaperArea extends React.Component<Props, State> {
    private readonly listener = new EventObserver();

    private area: HTMLDivElement;
    private widgets: { [key: string]: ReactElement<any> } = {};

    private readonly pageSize = {x: 1500, y: 800};

    private center: { x: number; y: number; };
    private previousOrigin: { x: number; y: number; };

    private listeningToPointerMove = false;
    private pointerMovedWhileListening = false;
    private pointerDownTarget: Cell | undefined;
    private pointerMoveOrigin: { pageX: number; pageY: number; };

    private isPanning = false;
    private panningScrollOrigin: { scrollLeft: number; scrollTop: number; };

    private movingElement: Element | undefined;
    private movingPaperOrigin: {
        pointerX: number;
        pointerY: number;
        elementX: number;
        elementY: number;
    };

    private movingVertex: LinkVertex | undefined;

    private delayedPaperAdjust = new Debouncer();
    private scrollBeforeUpdate: undefined | {
        left: number;
        top: number;
    };

    private get zoomOptions(): ZoomOptions {
        const {
            min = 0.2, max = 2, step = 0.1, maxFit = 1, fitPadding = 20,
        } = this.props.zoomOptions || {};
        return {min, max, step, maxFit, fitPadding};
    }

    constructor(props: Props, context: any) {
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

    render() {
        const {view} = this.props;
        const {paperWidth, paperHeight, originX, originY, scale, paddingX, paddingY, renderedWidgets} = this.state;
        const paperTransformStyle = {
            position: 'absolute', left: 0, top: 0,
            transform: `scale(${scale},${scale})translate(${originX}px,${originY}px)`,
        };
        return (
            <div className={CLASS_NAME}
                ref={area => this.area = area}
                onMouseDown={this.onAreaPointerDown}
                onWheel={this.onWheel}>
                <Paper view={view}
                    width={paperWidth}
                    height={paperHeight}
                    originX={originX}
                    originY={originY}
                    scale={scale}
                    paddingX={paddingX}
                    paddingY={paddingY}
                    onPointerDown={this.onPaperPointerDown}>
                    <ElementLayer view={view} style={paperTransformStyle} />
                    <div className={`${CLASS_NAME}__widgets`} onMouseDown={this.onWidgetsMouseDown}>
                        {renderedWidgets.map(widget => {
                            const props: PaperWidgetProps = {paperArea: this};
                            return React.cloneElement(widget, props);
                        })}
                    </div>
                </Paper>
            </div>
        );
    }

    componentDidMount() {
        // this.paper = this.props.paper;
        // this.renderChildren();

        // this.pageSize = {
        //     x: this.paper.options.width,
        //     y: this.paper.options.height,
        // };
        // (this.paper.svg as any as HTMLElement).style.overflow = 'visible';
        // this.area.appendChild(this.paper.el);
        this.updatePaperMargins();
        this.centerTo();

        // this.spinnerElement = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        // this.paper.svg.appendChild(this.spinnerElement);

        // this.listener.listenTo(this.paper, 'scale', this.onPaperScale);
        // this.listener.listenTo(this.paper, 'resize', this.onPaperResize);
        // this.listener.listenTo(this.paper, 'translate', this.onPaperTranslate);
        // this.listener.listenTo(this.paper, 'blank:pointerdown', (e: MouseEvent) => {
        //     if (this.shouldStartPanning(e)) {
        //         e.preventDefault();
        //         this.startPanning(e);
        //     }
        // });
        // this.listener.listenTo(this.paper, 'render:done', () => {
        //     this.adjustPaper();
        //     this.centerTo();
        // });
        // this.listener.listenTo(this.paper, 'cell:pointerdown', () => {
        //     this.props.preventTextSelection();
        // });
        // // automatic paper adjust on element dragged
        // this.listener.listenTo(this.paper, 'cell:pointerup', this.adjustPaper);
        this.listener.listenTo(this.props.view.model.graph, 'add remove change:position', () => {
            this.delayedPaperAdjust.call(this.adjustPaper);
        });
        this.listener.listenTo(this.props.view.model, 'state:dataLoaded', () => {
            this.delayedPaperAdjust.call(this.adjustPaper);
        });
        this.listener.listen(this.props.view.syncUpdate, ({layer}) => {
            if (layer !== RenderingLayer.PaperArea) { return; }
            this.delayedPaperAdjust.runSynchronously();
        });
        this.listener.listen(this.props.view.updateWidgets, ({widgets}) => {
            this.updateWidgets(widgets);
        });
        // this.listener.listenTo(this.props.model.graph, 'change:size', this.adjustPaper);
        // this.listener.listenTo(this.paper, 'ontodia:adjustSize', this.adjustPaper);

        this.area.addEventListener('dragover', this.onDragOver);
        this.area.addEventListener('drop', this.onDragDrop);

        // const model = this.props.model;
        // this.listener.listenTo(model, 'state:beginLoad', () => this.showIndicator());
        // this.listener.listenTo(model, 'state:endLoad',
        //     (elementCount: number) => this.renderLoadingIndicator(elementCount));
        // this.listener.listenTo(model, 'state:loadError',
        //     (error: any) => this.renderLoadingIndicator(undefined, error));
        // this.listener.listenTo(model, 'state:renderStart', () => {
        //     unmountComponentAtNode(this.spinnerElement);
        // });
        // this.listener.listenTo(model, 'state:dataLoaded', () => {
        //     this.zoomToFit();
        // });
    }

    componentDidUpdate(prevProps: Props, prevState: State) {
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
    }

    private updateWidgets(update: { [key: string]: ReactElement<any> }) {
        this.widgets = {...this.widgets, ...update};
        const renderedWidgets = Object.keys(this.widgets).map(key => {
            const widget = this.widgets[key];
            return widget ? React.cloneElement(widget, {key}) : undefined;
        }).filter(widget => widget !== undefined);
        this.setState({renderedWidgets});
    }

    private onWidgetsMouseDown = (e: React.MouseEvent<any>) => {
        // prevent PaperArea from generating click on a blank area
        e.stopPropagation();
    }

    private pageToPaperCoords(pageX: number, pageY: number) {
        const {offsetLeft, offsetTop} = this.area;
        return this.clientToPaperCoords(pageX - offsetLeft, pageY - offsetTop);
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
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        const model = this.props.view.model;
        for (const element of model.elements) {
            const {x, y} = element.get('position');
            const size = element.get('size') || {width: 0, height: 0};
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + size.width);
            maxY = Math.max(maxY, y + size.height);
        }

        for (const link of model.links) {
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

    /** Returns paper size in paper coordinates. */
    getPaperSize(): { width: number; height: number; } {
        // const scale = this.getScale();
        // const {width, height} = this.paper.options;
        const {paperWidth: width, paperHeight: height, scale} = this.state;
        return {width: width / scale, height: height / scale};
    }

    computeAdjustedBox(): Partial<State> {
        // this.center = this.clientToPaperCoords(
        //     this.area.clientWidth / 2, this.area.clientHeight / 2);

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

        // if (newOrigin.x !== oldOrigin.x || newOrigin.y !== oldOrigin.y) {
        //     this.paper.setOrigin(newOrigin.x, newOrigin.y);
        // }

        // const oldWidth = this.paper.options.width;
        // const oldHeight = this.paper.options.height;
        const paperWidth = Math.max(bboxGrid.right - bboxGrid.left, 1) * gridWidth;
        const paperHeight = Math.max(bboxGrid.bottom - bboxGrid.top, 1) * gridHeight;
        // if (newWidth !== oldWidth || newHeight !== oldHeight) {
        //     this.paper.setDimensions(newWidth, newHeight);
        // }

        return {paperWidth, paperHeight, originX, originY};
    }

    adjustPaper = () => {
        const {clientWidth, clientHeight} = this.area;
        const adjusted: Partial<State> = {
            ...this.computeAdjustedBox(),
            paddingX: Math.ceil(clientWidth * 0.75),
            paddingY: Math.ceil(clientHeight * 0.75),
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
            //console.log(`width ${Math.floor(newWidth)}; origin ${Math.floor(newOrigin.x)}; padding: ${Math.floor(paddingX)}`);
            this.scrollBeforeUpdate = {
                left: this.area.scrollLeft,
                top: this.area.scrollTop,
            };
            this.setState(adjusted);
        }

        // this.updatePaperMargins();
    }

    private updatePaperMargins() {
        // const previousPadding = this.padding;
        // this.padding = {
        //     x: Math.ceil(this.area.clientWidth * 0.75),
        //     y: Math.ceil(this.area.clientHeight * 0.75),
        // };

        // const paddingUnchanged =
        //     this.padding.x === previousPadding.x &&
        //     this.padding.y === previousPadding.y;
        // if (paddingUnchanged) { return; }

        // const paperElement: HTMLElement = this.paper.el;
        // paperElement.style.marginLeft = `${this.padding.x}px`;
        // paperElement.style.marginRight = `${this.padding.x}px`;
        // paperElement.style.marginTop = `${this.padding.y}px`;
        // paperElement.style.marginBottom = `${this.padding.y}px`;

        // if (previousPadding) {
        //     this.area.scrollLeft += this.padding.x - previousPadding.x;
        //     this.area.scrollTop += this.padding.y - previousPadding.y;
        // }
    }

    // private onPaperScale = (scaleX: number, scaleY: number, originX: number, originY: number) => {
    //     this.adjustPaper();
    //     if (originX !== undefined || originY !== undefined) {
    //         this.centerTo({x: originX, y: originY});
    //     }
    //     if (this.props.onZoom) {
    //         this.props.onZoom(scaleX, scaleY);
    //     }
    // };

    private onPaperResize = () => {
        if (this.center) {
            this.centerTo(this.center);
        }
    }

    private onPaperTranslate = (originX: number, originY: number) => {
        if (this.previousOrigin) {
            const {x, y} = this.previousOrigin;
            const translatedX = originX - x;
            const translatedY = originY - y;
            // update visible area when paper change origin without resizing
            // e.g. paper shrinks from left side and grows from right
            this.area.scrollLeft += translatedX;
            this.area.scrollTop += translatedY;
        }
        this.previousOrigin = {x: originX, y: originY};
    }

    private shouldStartPanning(e: MouseEvent | React.MouseEvent<any>) {
        const modifierPressed = e.ctrlKey || e.shiftKey;
        return Boolean(modifierPressed) === Boolean(this.props.panningRequireModifiers);
    }

    private onPaperPointerDown = (e: React.MouseEvent<HTMLElement>, cell: Cell | undefined) => {
        if (this.listeningToPointerMove || e.button !== 0 /* left mouse button */) {
            return;
        }

        if (cell) {
            if (cell instanceof Element) {
                e.preventDefault();
                this.startMoving(e, cell);
            } else if (cell instanceof Link) {
                e.preventDefault();
                const location = this.pageToPaperCoords(e.pageX, e.pageY);
                const vertexIndex = this.createLinkVertex(cell, location);
                this.movingVertex = {link: cell, vertexIndex};
                // prevent click on newly created vertex
                this.pointerMovedWhileListening = true;
            } else if (isLinkVertex(cell)) {
                this.movingVertex = cell;
            }
        } else if (this.shouldStartPanning(e)) {
            e.preventDefault();
            this.startPanning(e);
        }

        this.listenToPointerMove(e, cell);
    }

    private startMoving(e: React.MouseEvent<HTMLElement>, element: Element) {
        const {x: pointerX, y: pointerY} = this.pageToPaperCoords(e.pageX, e.pageY);
        const {x: elementX, y: elementY} = element.get('position');
        this.movingPaperOrigin = {pointerX, pointerY, elementX, elementY};
        this.movingElement = element;
    }

    private onAreaPointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === this.area) {
            if (this.shouldStartPanning(e)) {
                e.preventDefault();
                this.startPanning(e);
                this.listenToPointerMove(e, undefined);
            }
        }
    }

    private startPanning(event: React.MouseEvent<any>) {
        const {scrollLeft, scrollTop} = this.area;
        this.panningScrollOrigin = {scrollLeft, scrollTop};
        this.isPanning = true;
    }

    /** @returns created vertex index */
    private createLinkVertex(link: Link, location: Vector) {
        const previous = link.vertices;
        const vertices = previous ? [...previous] : [];
        const model = this.props.view.model;
        const polyline = computePolyline(
            model.getElement(link.sourceId),
            model.getElement(link.targetId),
            vertices,
        );
        const segmentIndex = findNearestSegmentIndex(polyline, location);
        vertices.splice(segmentIndex, 0, location);
        link.setVertices(vertices);
        return segmentIndex;
    }

    private listenToPointerMove(event: React.MouseEvent<any>, cell: Cell | undefined) {
        if (this.listeningToPointerMove) { return; }
        const {pageX, pageY} = event;
        this.pointerMoveOrigin = {pageX, pageY};
        this.pointerDownTarget = cell;
        this.listeningToPointerMove = true;
        this.pointerMovedWhileListening = false;
        document.addEventListener('mousemove', this.onPointerMove);
        document.addEventListener('mouseup', this.stopListeningToPointerMove);
    }

    private onPointerMove = (e: MouseEvent) => {
        if (this.scrollBeforeUpdate) { return; }

        const pageOffsetX = e.pageX - this.pointerMoveOrigin.pageX;
        const pageOffsetY = e.pageY - this.pointerMoveOrigin.pageY;
        if (Math.abs(pageOffsetX) >= 1 && Math.abs(pageOffsetY) >= 1) {
            this.pointerMovedWhileListening = true;
        }

        if (this.isPanning) {
            this.area.scrollLeft = this.panningScrollOrigin.scrollLeft - pageOffsetX;
            this.area.scrollTop = this.panningScrollOrigin.scrollTop - pageOffsetY;
        } else if (this.movingElement) {
            const {x, y} = this.pageToPaperCoords(e.pageX, e.pageY);
            const {pointerX, pointerY, elementX, elementY} = this.movingPaperOrigin;
            this.movingElement.set('position', {
                x: elementX + x - pointerX,
                y: elementY + y - pointerY,
            });
            this.props.view.performSyncUpdate();
        } else if (this.movingVertex) {
            const {link, vertexIndex} = this.movingVertex;
            const location = this.pageToPaperCoords(e.pageX, e.pageY);
            const vertices = [...link.vertices];
            vertices.splice(vertexIndex, 1, location);
            link.setVertices(vertices);
            this.props.view.performSyncUpdate();
        }
    }

    private stopListeningToPointerMove = (e?: MouseEvent) => {
        const targetCell = this.pointerDownTarget;
        const triggerPointerUp = e && this.listeningToPointerMove;
        const triggerAsClick = !this.pointerMovedWhileListening;

        if (this.listeningToPointerMove) {
            document.removeEventListener('mousemove', this.onPointerMove);
            document.removeEventListener('mouseup', this.stopListeningToPointerMove);
        }

        this.listeningToPointerMove = false;
        this.pointerMovedWhileListening = false;
        this.pointerDownTarget = undefined;
        this.isPanning = false;
        this.movingElement = undefined;
        this.movingVertex = undefined;

        if (triggerPointerUp && !isLinkVertex(targetCell)) {
            this.props.view.onPaperPointerUp(e, targetCell, triggerAsClick);
        }
    }

    private onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = Math.max(-1, Math.min(1, e.deltaY));
            const pivot = this.pageToPaperCoords(e.pageX, e.pageY);
            this.zoomBy(-delta * 0.1, {pivot});
        }
    }

    centerTo(paperPosition?: { x: number; y: number; }) {
        // const ctm = this.paper.viewport.getCTM();
        // let clientX: number;
        // let clientY: number;

        // if (paperPosition) {
        //     const scale = ctm.a;
        //     clientX = paperPosition.x * scale;
        //     clientY = paperPosition.y * scale;
        // } else {
        //     const x1 = -ctm.e;
        //     const y1 = -ctm.f;
        //     const x2 = x1 + this.paper.options.width;
        //     const y2 = y1 + this.paper.options.height;
        //     clientX = (x1 + x2) / 2;
        //     clientY = (y1 + y2) / 2;
        // }

        // const {clientWidth, clientHeight} = this.area;
        // this.updatePaperMargins();
        // this.area.scrollLeft = clientX - clientWidth / 2 + ctm.e + this.padding.x;
        // this.area.scrollTop = clientY - clientHeight / 2 + ctm.f + this.padding.y;

        const {paperWidth, paperHeight, scale, originX, originY, paddingX, paddingY} = this.state;
        const paperCenter = paperPosition || {x: paperWidth / 2, y: paperHeight / 2};
        const clientCenterX = (paperCenter.x + originX) * scale;
        const clientCenterY = (paperCenter.y + originY) * scale;
        const {clientWidth, clientHeight} = this.area;
        this.area.scrollLeft = clientCenterX - clientWidth / 2 + paddingX;
        this.area.scrollTop = clientCenterY - clientHeight / 2 + paddingY;
    }

    centerContent() {
        const bbox = this.getContentFittingBox();
        this.centerTo({
            x: bbox.x + bbox.width / 2,
            y: bbox.y + bbox.height / 2,
        });

        // const {x, y, width, height} = this.paper.viewport.getBBox();
        // const viewportCenter = {
        //     x: x + width / 2,
        //     y: y + height / 2,
        // };
        // this.centerTo(viewportCenter);
    }

    getScale() {
        // const ctm = this.paper.viewport.getCTM();
        // // scale should be uniform (scaleX == scaleY)
        // // and no rotation present, so
        // // ctm.a == ctm.d and ctm.b == ctm.c == 0
        // return ctm.a;
        return this.state.scale;
    }

    setScale(value: number, options: ScaleOptions = {}) {
        let scale = value;

        const {min, max} = this.zoomOptions;
        scale = Math.max(scale, min);
        scale = Math.min(scale, max);

        const center = this.clientToPaperCoords(
            this.area.clientWidth / 2, this.area.clientHeight / 2);
        let pivot: { x: number; y: number; };
        if (options.pivot) {
            const {x, y} = options.pivot;
            const previousScale = this.state.scale;
            const scaledBy = scale / previousScale;
            pivot = {
                x: x - (x - center.x) / scaledBy,
                y: y - (y - center.y) / scaledBy,
            };
        } else {
            pivot = center;
        }

        this.setState({scale}, () => {
            this.centerTo(pivot);
            if (this.props.onZoom) {
                this.props.onZoom(scale, scale);
            }
        });
    }

    zoomBy(value: number, options: ScaleOptions = {}) {
        this.setScale(this.getScale() + value, options);
    }

    zoomIn = () => {
        this.zoomBy(this.zoomOptions.step);
    }

    zoomOut = () => {
        this.zoomBy(-this.zoomOptions.step);
    }

    zoomToFit() {
        if (this.props.view.model.cells.length === 0) {
            this.centerTo();
            return;
        }

        const bbox = this.getContentFittingBox();

        const {clientWidth, clientHeight} = this.area;
        const {width, height} = fitRectKeepingAspectRatio(
            bbox.width, bbox.height,
            clientWidth, clientHeight,
        );

        let scale = width / bbox.width;
        const {min, max} = this.zoomOptions;
        scale = Math.max(scale, min);
        scale = Math.min(scale, max);

        this.setState({scale}, () => {
            this.centerContent();
            if (this.props.onZoom) {
                this.props.onZoom(scale, scale);
            }
        });

        // if (this.paper.options.model.get('cells').length === 0) {
        //     this.centerTo();
        //     return;
        // }

        // const {x: originX, y: originY} = this.paper.options.origin;
        // const fittingBBox = {
        //     x: originX,
        //     y: originY,
        //     width: this.area.clientWidth,
        //     height: this.area.clientHeight,
        // };
        // this.paper.scaleContentToFit({
        //     fittingBBox,
        //     padding: this.zoomOptions.fitPadding,
        //     minScale: this.zoomOptions.min,
        //     maxScale: this.zoomOptions.maxFit,
        // });
        // this.paper.setOrigin(originX, originY);

        // this.adjustPaper();
        // this.centerContent();
    }

    private onDragOver = (e: DragEvent) => {
        // Necessary. Allows us to drop.
        if (e.preventDefault) { e.preventDefault(); }
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    private onDragDrop = (e: DragEvent) => {
        if (this.props.onDragDrop) {
            const {x, y} = clientCoordsFor(this.area, e);
            const paperPosition = this.clientToPaperCoords(x, y);
            this.props.onDragDrop(e, paperPosition);
        }
    }

    private renderSpinner(props: SpinnerProps = {}) {
        // const paperRect = this.paper.svg.getBoundingClientRect();
        // const x = props.statusText ? paperRect.width / 3 : paperRect.width / 2;
        // const position = {x, y: paperRect.height / 2};
        // reactDOMRender(<Spinner position={position} {...props} />, this.spinnerElement);
    }

    showIndicator(operation?: Promise<any>) {
        // this.centerTo();
        // this.renderSpinner();

        // if (operation) {
        //     operation.then(() => {
        //         unmountComponentAtNode(this.spinnerElement);
        //     }).catch(error => {
        //         console.error(error);
        //         this.renderSpinner({statusText: 'Unknown error occured', errorOccured: true});
        //     });
        // }
    }

    private renderLoadingIndicator(elementCount: number | undefined, error?: any) {
        const WARN_ELEMENT_COUNT = 70;
        if (error) {
            this.renderSpinner({statusText: error.statusText || error.message, errorOccured: true});
        } else if (elementCount > WARN_ELEMENT_COUNT) {
            this.renderSpinner({statusText:
                `The diagram contains more than ${WARN_ELEMENT_COUNT} ` +
                `elements. Please wait until it is fully loaded.`});
        } else {
            this.renderSpinner();
        }
    }

    private makeToSVGOptions(): ToSVGOptions {
        return {
            model: this.props.view.model,
            paper: this.area.querySelector('svg'),
            contentBox: this.getContentFittingBox(),
            getOverlayedElement: id => this.area.querySelector(`[data-element-id='${id}']`) as HTMLElement,
            preserveDimensions: true,
            convertImagesToDataUris: true,
            elementsToRemoveSelector: '.ontodia-link__vertex-tools',
        };
    }

    exportSVG(): Promise<string> {
        return toSVG(this.makeToSVGOptions());
    }

    exportPNG(options: ToDataURLOptions): Promise<string> {
        return toDataURL({...options, ...this.makeToSVGOptions()});
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
