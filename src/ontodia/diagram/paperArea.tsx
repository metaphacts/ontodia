import * as Backbone from 'backbone';
import * as joint from 'jointjs';
import * as React from 'react';
import { debounce } from 'lodash';

import { Indicator, WrapIndicator } from '../viewUtils/indicator';

import { DiagramModel } from './model';

export interface Props {
    model: DiagramModel;
    paper: joint.dia.Paper;
    preventTextSelection: () => void;
    zoomOptions?: {
        min?: number;
        max?: number;
        fitPadding?: number;
    };
    panningAlwaysActive?: boolean;
    onDragDrop?: (e: DragEvent, paperPosition: { x: number; y: number; }) => void;
}

export interface ZoomOptions {
    pivot?: { x: number; y: number; };
}

export class PaperArea extends React.Component<Props, {}> {
    private readonly listener = new Backbone.Model();

    private area: HTMLDivElement;
    private paper: joint.dia.Paper;

    private indicator: WrapIndicator;
    private loadingIndicator: Indicator;

    private pageSize: { x: number; y: number; };

    private padding = {x: 0, y: 0};
    private center: { x: number; y: number; };

    private isPanning = false;
    private panningOrigin: { pageX: number; pageY: number; };
    private panningScrollOrigin: { scrollLeft: number; scrollTop: number; };

    render() {
        return <div className='paper-area'
            ref={area => this.area = area}
            onMouseDown={this.onAreaPointerDown}
            onWheel={this.onWheel}>
        </div>;
    }

    componentDidMount() {
        this.paper = this.props.paper;

        this.pageSize = {
            x: this.paper.options.width,
            y: this.paper.options.height,
        };
        (this.paper.svg as any as HTMLElement).style.overflow = 'visible';
        this.area.appendChild(this.paper.el);
        this.updatePaperMargins();
        this.centerTo();

        this.listener.listenTo(this.paper, 'scale', this.onPaperScale);
        this.listener.listenTo(this.paper, 'resize', this.onPaperResize);
        this.listener.listenTo(this.paper, 'blank:pointerdown', (e: MouseEvent) => {
            if (this.shouldStartPanning(e)) {
                e.preventDefault();
                this.startPanning(e);
            }
        });
        this.listener.listenTo(this.paper, 'render:done', () => {
            this.adjustPaper();
            this.centerTo();
        });
        this.listener.listenTo(this.paper, 'cell:pointerdown', () => {
            this.props.preventTextSelection();
        });
        // automatic paper adjust on element dragged
        this.listener.listenTo(this.paper, 'cell:pointerup', this.adjustPaper);
        this.listener.listenTo(this.paper.options.model,
            'add remove change:position', debounce(this.adjustPaper, 50));
        this.listener.listenTo(this.paper, 'ontodia:adjustSize', this.adjustPaper);

        this.area.addEventListener('dragover', this.onDragOver);
        this.area.addEventListener('drop', this.onDragDrop);

        const model = this.props.model;
        this.listener.listenTo(model, 'state:beginLoad', () => this.showIndicator());
        this.listener.listenTo(model, 'state:endLoad',
            (elementCount: number) => this.renderLoadingIndicator(elementCount));
        this.listener.listenTo(model, 'state:loadError',
            (error: any) => this.renderLoadingIndicator(undefined, error));
        this.listener.listenTo(model, 'state:renderStart', () => {
            if (this.loadingIndicator) { this.loadingIndicator.remove(); }
        });
        this.listener.listenTo(model, 'state:dataLoaded', () => {
            this.zoomToFit();
        });
    }

    shouldComponentUpdate() {
        return false;
    }

    componentWillUnmount() {
        this.stopPanning();
        this.listener.stopListening();
        this.area.removeEventListener('dragover', this.onDragOver);
        this.area.removeEventListener('drop', this.onDragDrop);
    }

    clientToPaperCoords(areaClientX: number, areaClientY: number) {
        const ctm = this.paper.viewport.getCTM();
        let x = areaClientX + this.area.scrollLeft - this.padding.x - ctm.e;
        x /= ctm.a;
        let y = areaClientY + this.area.scrollTop - this.padding.y - ctm.f;
        y /= ctm.d;
        return {x, y};
    }

    adjustPaper = () => {
        this.center = this.clientToPaperCoords(
            this.area.clientWidth / 2, this.area.clientHeight / 2);

        const scale = this.getScale();
        this.paper.fitToContent({
            gridWidth: this.pageSize.x * scale,
            gridHeight: this.pageSize.y * scale,
            allowNewOrigin: 'negative',
        });
        this.updatePaperMargins();
    }

    private updatePaperMargins() {
        this.padding = {
            x: this.area.clientWidth * 0.75,
            y: this.area.clientHeight * 0.75,
        };

        const paperElement: HTMLElement = this.paper.el;
        paperElement.style.marginLeft = `${this.padding.x}px`;
        paperElement.style.marginRight = `${this.padding.x}px`;
        paperElement.style.marginTop = `${this.padding.y}px`;
        paperElement.style.marginBottom = `${this.padding.y}px`;
    }

    private onPaperScale = (scaleX: number, scaleY: number, originX: number, originY: number) => {
        this.adjustPaper();
        if (originX !== undefined || originY !== undefined) {
            this.centerTo({x: originX, y: originY});
        }
    };

    private onPaperResize = () => {
        if (this.center) {
            this.centerTo(this.center);
        }
    };

    private shouldStartPanning(e: MouseEvent | React.MouseEvent<any>) {
        return e.ctrlKey || e.shiftKey || this.props.panningAlwaysActive;
    }

    private onAreaPointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === this.area) {
            if (this.shouldStartPanning(e)) {
                e.preventDefault();
                this.startPanning(e);
            }
        }
    };

    private startPanning(event: { pageX: number; pageY: number; }) {
        this.props.preventTextSelection();

        const {pageX, pageY} = event;
        this.panningOrigin = {pageX, pageY};
        const {scrollLeft, scrollTop} = this.area;
        this.panningScrollOrigin = {scrollLeft, scrollTop};

        this.isPanning = true;
        document.addEventListener('mousemove', this.onPointerMove);
        document.addEventListener('mouseup', this.stopPanning);
    }

    private onPointerMove = (e: MouseEvent) => {
        if (this.isPanning) {
            const offsetX = e.pageX - this.panningOrigin.pageX;
            const offsetY = e.pageY - this.panningOrigin.pageY;
            this.area.scrollLeft = this.panningScrollOrigin.scrollLeft - offsetX;
            this.area.scrollTop = this.panningScrollOrigin.scrollTop - offsetY;
        }
    };

    private stopPanning = () => {
        if (this.isPanning) {
            this.isPanning = false;
            document.removeEventListener('mousemove', this.onPointerMove);
            document.removeEventListener('mouseup', this.stopPanning);
        }
    };

    private onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = Math.max(-1, Math.min(1, e.deltaY));
            const {offsetLeft, offsetTop} = this.area;
            const pivot = this.clientToPaperCoords(
                e.pageX - offsetLeft,
                e.pageY - offsetTop);
            this.zoomBy(-delta * 0.1, {pivot});
        }
    };

    centerTo(paperPosition?: { x: number; y: number; }) {
        const ctm = this.paper.viewport.getCTM();
        let clientX: number;
        let clientY: number;

        if (paperPosition) {
            const scale = ctm.a;
            clientX = paperPosition.x * scale;
            clientY = paperPosition.y * scale;
        } else {
            const x1 = -ctm.e;
            const y1 = -ctm.f;
            const x2 = x1 + this.paper.options.width;
            const y2 = y1 + this.paper.options.height;
            clientX = (x1 + x2) / 2;
            clientY = (y1 + y2) / 2;
        }

        const {clientWidth, clientHeight} = this.area;
        this.updatePaperMargins();
        this.area.scrollLeft = clientX - clientWidth / 2 + ctm.e + this.padding.x;
        this.area.scrollTop = clientY - clientHeight / 2 + ctm.f + this.padding.y;
    }

    centerContent() {
        const {x, y, width, height} = this.paper.viewport.getBBox();
        const viewportCenter = {
            x: x + width / 2,
            y: y + height / 2,
        };
        this.centerTo(viewportCenter);
    }

    getScale() {
        const ctm = this.paper.viewport.getCTM();
        // scale should be uniform (scaleX == scaleY)
        // and no rotation present, so
        // ctm.a == ctm.d and ctm.b == ctm.c == 0
        return ctm.a;
    }

    setScale(value: number, options: ZoomOptions = {}) {
        let scale = value;

        const {zoomOptions = {}} = this.props;
        const {min, max} = zoomOptions;
        if (min !== undefined) { scale = Math.max(scale, min); }
        if (max !== undefined) { scale = Math.min(scale, max); }

        const center = this.clientToPaperCoords(
            this.area.clientWidth / 2, this.area.clientHeight / 2);
        let pivot: { x: number; y: number; };
        if (options.pivot) {
            const {x, y} = options.pivot;
            const previousScale = this.getScale();
            const scaledBy = scale / previousScale;
            pivot = {
                x: x - (x - center.x) / scaledBy,
                y: y - (y - center.y) / scaledBy,
            };
        } else {
            pivot = center;
        }

        this.paper.scale(scale, scale);
        this.centerTo(pivot);
    }

    zoomBy(value: number, options: ZoomOptions = {}) {
        this.setScale(this.getScale() + value, options);
    }

    zoomToFit() {
        if (this.paper.options.model.get('cells').length === 0) {
            this.centerTo();
            return;
        }

        const {x: originX, y: originY} = this.paper.options.origin;
        const fittingBBox = {
            x: originX,
            y: originY,
            width: this.area.clientWidth,
            height: this.area.clientHeight,
        };
        const {zoomOptions = {}} = this.props;
        this.paper.scaleContentToFit({
            fittingBBox,
            padding: (this.props.zoomOptions || {}).fitPadding,
            minScale: zoomOptions.min,
            maxScale: zoomOptions.max,
        });
        this.paper.setOrigin(originX, originY);

        this.adjustPaper();
        this.centerContent();
    }

    private onDragOver = (e: DragEvent) => {
        // Necessary. Allows us to drop.
        if (e.preventDefault) { e.preventDefault(); }
        e.dataTransfer.dropEffect = 'move';
        return false;
    };

    private onDragDrop = (e: DragEvent) => {
        if (this.props.onDragDrop) {
            const {offsetLeft, offsetTop} = this.area;
            const paperPosition = this.clientToPaperCoords(
                e.pageX - offsetLeft, e.pageY - offsetTop);
            this.props.onDragDrop(e, paperPosition);
        }
    };

    showIndicator(operation?: Promise<any>) {
        this.centerTo();
        const svgBoundingRect = this.paper.svg.getBoundingClientRect();
        this.indicator = WrapIndicator.wrap(this.paper.svg, {
            position: {
                x: svgBoundingRect.width / 2,
                y: svgBoundingRect.height / 2,
            },
        });
        if (operation) {
            operation.then(() => {
                this.indicator.remove();
            }).catch(error => {
                console.error(error);
                this.indicator.status('Unknown error occured');
                this.indicator.error();
            });
        }
    }

    private renderLoadingIndicator(elementCount: number | undefined, error?: any) {
        if (this.indicator) {
            this.indicator.remove();
        }
        const createTemporaryIndicator = (status?: string) => {
            const paperRect = this.paper.svg.getBoundingClientRect();
            const x = status ? paperRect.width / 3 : paperRect.width / 2;
            this.loadingIndicator = new Indicator(this.paper.svg, {
                position: {x: x, y: paperRect.height / 2},
            });
            this.loadingIndicator.status(status);
        };
        const WARN_ELEMENT_COUNT = 70;
        if (error) {
            createTemporaryIndicator(error.statusText || error.message);
            this.loadingIndicator.error();
        } else if (elementCount > WARN_ELEMENT_COUNT) {
            createTemporaryIndicator(
                `The diagram contains more than ${WARN_ELEMENT_COUNT} ` +
                `elements. Please wait until it is fully loaded.`);
        } else {
            createTemporaryIndicator();
        }
        this.loadingIndicator.run();
    };
}
