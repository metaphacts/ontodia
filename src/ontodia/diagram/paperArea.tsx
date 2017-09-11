import * as Backbone from 'backbone';
import * as joint from 'jointjs';
import * as React from 'react';
import {
    render as reactDOMRender,
    unmountComponentAtNode,
    unstable_renderSubtreeIntoContainer,
} from 'react-dom';
import { debounce } from 'lodash';

import { Spinner, Props as SpinnerProps } from '../viewUtils/spinner';
import { fitRectKeepingAspectRatio } from '../viewUtils/toSvg';

import { Element, Link } from './elements';
import { ElementLayer } from './elementLayer';
import { DiagramModel } from './model';
import { DiagramView } from './view';
import { Paper } from './paper';

export interface Props {
    view: DiagramView;
    preventTextSelection: () => void;
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

interface State {
    readonly paperWidth?: number;
    readonly paperHeight?: number;
    readonly originX?: number;
    readonly originY?: number;
    readonly scale?: number;
    readonly paddingX?: number;
    readonly paddingY?: number;
}

export class PaperArea extends React.Component<Props, State> {
    private readonly listener = new Backbone.Model();

    private area: HTMLDivElement;
    private paper: Paper;

    private spinnerElement: SVGGElement;

    private readonly pageSize = {x: 1500, y: 800};

    // private padding = {x: 0, y: 0};
    private center: { x: number; y: number; };
    private previousOrigin: { x: number; y: number; };

    private listeningToPointerMove = false;

    private isPanning = false;
    private panningOrigin: { pageX: number; pageY: number; };
    private panningScrollOrigin: { scrollLeft: number; scrollTop: number; };

    private childContainers: HTMLElement[] = [];

    private movingPaperOrigin: {
        pointerX: number;
        pointerY: number;
        elementX: number;
        elementY: number;
    };
    private movingElement: Element | undefined;
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
        };
    }

    render() {
        const {view, preventTextSelection} = this.props;
        const {paperWidth, paperHeight, originX, originY, scale, paddingX, paddingY} = this.state;
        return (
            <div className='paper-area'
                ref={area => this.area = area}
                onMouseDown={this.onAreaPointerDown}
                onWheel={this.onWheel}>
                <Paper ref={paper => this.paper = paper}
                    view={view}
                    width={paperWidth}
                    height={paperHeight}
                    originX={originX}
                    originY={originY}
                    scale={scale}
                    paddingX={paddingX}
                    paddingY={paddingY}
                    onPointerDown={this.onPaperPointerDown}>
                    <ElementLayer view={view} paper={view.paper}
                        origin={{x: originX, y: originY}}
                        scale={scale}
                    />
                    {this.props.children}
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
        this.listener.listenTo(this.props.view.model.graph,
            'add remove change:position', this.adjustPaper);
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

    // private renderChildren() {
    //     React.Children.forEach(this.props.children, child => {
    //         const container = document.createElement('div');
    //         this.paper.el.appendChild(container);
    //         this.childContainers.push(container);
    //         const wrapped = typeof child === 'object' ? child : <span>{child}</span>;
    //         if (unstable_renderSubtreeIntoContainer) {
    //             unstable_renderSubtreeIntoContainer(this, wrapped, container);
    //         } else {
    //             reactDOMRender(wrapped, container);
    //         }
    //     });
    // }

    // shouldComponentUpdate() {
    //     return false;
    // }

    componentDidUpdate(prevProps: Props, prevState: State) {
        if (this.scrollBeforeUpdate) {
            const {scale, originX, originY, paddingX, paddingY} = this.state;
            const scrollX = (originX - prevState.originX) * scale + (paddingX - prevState.paddingX);
            const scrollY = (originY - prevState.originY) * scale + (paddingY - prevState.paddingY);

            const scrollLeft = this.scrollBeforeUpdate.left + scrollX;
            const scrollTop = this.scrollBeforeUpdate.top + scrollY;

            //console.log('update before scroll', Math.floor(this.area.scrollLeft));
            if (this.area.scrollLeft !== scrollLeft) { this.area.scrollLeft = scrollLeft; }
            if (this.area.scrollTop !== scrollTop) { this.area.scrollTop = scrollTop; }

            this.scrollBeforeUpdate = undefined;
            //console.log('didUpdate: scroll(', Math.floor(scrollX), ') => ', Math.floor(this.area.scrollLeft), ' and resume events');
        }
    }

    componentWillUnmount() {
        this.stopListeningToPointerMove();
        this.listener.stopListening();
        this.area.removeEventListener('dragover', this.onDragOver);
        this.area.removeEventListener('drop', this.onDragDrop);
        unmountComponentAtNode(this.spinnerElement);
        for (const container of this.childContainers) {
            unmountComponentAtNode(container);
        }
    }

    private pageToPaperCoords(pageX: number, pageY: number) {
        const {offsetLeft, offsetTop} = this.area;
        return this.clientToPaperCoords(pageX - offsetLeft, pageY - offsetTop);
    }

    clientToPaperCoords(areaClientX: number, areaClientY: number) {
        // const ctm = this.paper.viewport.getCTM();
        // let x = areaClientX + this.area.scrollLeft - this.padding.x - ctm.e;
        // x /= ctm.a;
        // let y = areaClientY + this.area.scrollTop - this.padding.y - ctm.f;
        // y /= ctm.d;
        const {scale, paddingX, paddingY, originX, originY} = this.state;
        const x = (areaClientX + this.area.scrollLeft - paddingX) / scale - originX;
        const y = (areaClientY + this.area.scrollTop - paddingY) / scale - originY;
        return {x, y};
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
            const vertices: ReadonlyArray<{ x: number; y: number }> = link.get('vertices') || [];
            for (const {x, y} of vertices) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
        };
    }

    /** Returns paper size in paper coordinates. */
    getPaperSize(): { width: number; height: number; } {
        // const scale = this.getScale();
        // const {width, height} = this.paper.options;
        const {paperWidth: width, paperHeight: height, scale} = this.state;
        return {width: width / scale, height: height / scale};
    }

    adjustPaper = () => {
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
        const newOrigin = {
            x: -bboxGrid.left * gridWidth,
            y: -bboxGrid.top * gridHeight,
        };
        // if (newOrigin.x !== oldOrigin.x || newOrigin.y !== oldOrigin.y) {
        //     this.paper.setOrigin(newOrigin.x, newOrigin.y);
        // }

        // const oldWidth = this.paper.options.width;
        // const oldHeight = this.paper.options.height;
        const newWidth = Math.max(bboxGrid.right - bboxGrid.left, 1) * gridWidth;
        const newHeight = Math.max(bboxGrid.bottom - bboxGrid.top, 1) * gridHeight;
        // if (newWidth !== oldWidth || newHeight !== oldHeight) {
        //     this.paper.setDimensions(newWidth, newHeight);
        // }

        const previousState: State = {...this.state};
        const paddingX = Math.ceil(this.area.clientWidth * 0.75);
        const paddingY = Math.ceil(this.area.clientHeight * 0.75);

        const samePaperProps = (
            newWidth === this.state.paperWidth &&
            newHeight === this.state.paperHeight &&
            newOrigin.x === this.state.originX &&
            newOrigin.y === this.state.originY &&
            paddingX === this.state.paddingX &&
            paddingY === this.state.paddingY
        );
        if (!samePaperProps) {
            //console.log(`width ${Math.floor(newWidth)}; origin ${Math.floor(newOrigin.x)}; padding: ${Math.floor(paddingX)}`);
            this.scrollBeforeUpdate = {
                left: this.area.scrollLeft,
                top: this.area.scrollTop,
            };
            this.setState({
                paperWidth: newWidth,
                paperHeight: newHeight,
                originX: newOrigin.x,
                originY: newOrigin.y,
                paddingX,
                paddingY,
            });
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

    private onPaperScale = (scaleX: number, scaleY: number, originX: number, originY: number) => {
        this.adjustPaper();
        if (originX !== undefined || originY !== undefined) {
            this.centerTo({x: originX, y: originY});
        }
        if (this.props.onZoom) {
            this.props.onZoom(scaleX, scaleY);
        }
    };

    private onPaperResize = () => {
        if (this.center) {
            this.centerTo(this.center);
        }
    };

    private onPaperTranslate = (originX: number, originY: number) => {
        if (this.previousOrigin) {
            const {x, y} = this.previousOrigin;
            const translatedX = originX - x;
            const translatedY = originY - y;
            // update visible area when paper change origin without resizing
            // e.g. paper shinks from left side and grows from right
            this.area.scrollLeft += translatedX;
            this.area.scrollTop += translatedY;
        }
        this.previousOrigin = {x: originX, y: originY};
    }

    private shouldStartPanning(e: MouseEvent | React.MouseEvent<any>) {
        const modifierPressed = e.ctrlKey || e.shiftKey;
        return Boolean(modifierPressed) === Boolean(this.props.panningRequireModifiers);
    }

    private onPaperPointerDown = (e: React.MouseEvent<HTMLElement>, cell: Element | Link | undefined) => {
        if (e.button !== 0) {
            return;
        }

        this.props.preventTextSelection();
        if (cell) {
            if (cell instanceof Element) {
                e.preventDefault();
                this.startMoving(e, cell);
            }
        } else if (this.shouldStartPanning(e)) {
            e.preventDefault();
            this.startPanning(e);
        }
    }

    private startMoving(e: React.MouseEvent<HTMLElement>, element: Element) {
        const {x: pointerX, y: pointerY} = this.pageToPaperCoords(e.pageX, e.pageY);
        const {x: elementX, y: elementY} = element.get('position');
        this.movingPaperOrigin = {pointerX, pointerY, elementX, elementY};
        this.movingElement = element;
        this.listenToPointerMove();
    }

    private onAreaPointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === this.area) {
            if (this.shouldStartPanning(e)) {
                e.preventDefault();
                this.startPanning(e);
            }
        }
    }

    private startPanning(event: React.MouseEvent<any>) {
        this.props.preventTextSelection();

        const {pageX, pageY} = event;
        this.panningOrigin = {pageX, pageY};
        const {scrollLeft, scrollTop} = this.area;
        this.panningScrollOrigin = {scrollLeft, scrollTop};

        this.isPanning = true;
        this.listenToPointerMove();
    }

    private listenToPointerMove() {
        if (this.listeningToPointerMove) { return; }
        document.addEventListener('mousemove', this.onPointerMove);
        document.addEventListener('mouseup', this.stopListeningToPointerMove);
    }

    private onPointerMove = (e: MouseEvent) => {
        if (this.scrollBeforeUpdate) { return; }

        if (this.isPanning) {
            const offsetX = e.pageX - this.panningOrigin.pageX;
            const offsetY = e.pageY - this.panningOrigin.pageY;
            this.area.scrollLeft = this.panningScrollOrigin.scrollLeft - offsetX;
            this.area.scrollTop = this.panningScrollOrigin.scrollTop - offsetY;
        } else if (this.movingElement) {
            const {x, y} = this.pageToPaperCoords(e.pageX, e.pageY);
            // console.log('moving at', Math.floor(x), Math.floor(y), '; area scroll ', this.area.scrollLeft);
            const {pointerX, pointerY, elementX, elementY} = this.movingPaperOrigin;
            this.movingElement.set('position', {
                x: elementX + x - pointerX,
                y: elementY + y - pointerY,
            });
        }
    }

    private stopListeningToPointerMove = () => {
        if (this.isPanning) {
            this.isPanning = false;
        } else if (this.movingElement) {
            this.movingElement = undefined;
        }

        if (this.listeningToPointerMove) {
            this.listeningToPointerMove = false;
            document.removeEventListener('mousemove', this.onPointerMove);
            document.removeEventListener('mouseup', this.stopListeningToPointerMove);
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

        this.setState({scale}, () => this.centerTo(pivot));
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

        this.setState({scale}, () => this.centerContent());

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
            const {offsetLeft, offsetTop} = this.area;
            const paperPosition = this.clientToPaperCoords(
                e.pageX - offsetLeft, e.pageY - offsetTop);
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
    };
}
