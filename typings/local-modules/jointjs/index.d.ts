// Type definitions for Joint JS 0.6
// Project: http://www.jointjs.com/
// Definitions by: Aidan Reel <http://github.com/areel>, David Durman <http://github.com/DavidDurman>
// Definitions: https://github.com/borisyankov/DefinitelyTyped

declare module 'jointjs' {
    import * as Backbone from 'backbone';

namespace joint {

    namespace dia {

        interface IElementSize {
            width: number;
            height: number;
        }

        /**
         * The model holding all the cells (elements and links) of the diagram.
         * The collection of all the cells is stored in the property cells.
         */
        class Graph extends Backbone.Model {
            initialize();
            fromJSON(json: any);
            clear();
            /**
             * Add a new cell to the graph. If cell is an array, all the cells in the array will be added to the graph.
             */
            addCell(cell: Cell, options?: any);
            /**
             * Add new cells to the graph. This is just a syntactic sugar to the addCell method.
             * Calling addCell with an array of cells is an equivalent to calling addCells.
             */
            addCells(cells: Cell[], options?: any);
            getConnectedLinks(cell: Cell, options?: any): Link[];
            disconnectLinks(cell: Cell);
            removeLinks(cell: Cell[]);
            getElements(): Element[];
            getLinks(): Link[];
            /**
             * Reset cells in the graph. Update all the cells in the graph in one bulk.
             * This is a more efficient method of adding cells to the graph if you you want to
             * replace all the cells in one go.
             * @param cells
             * @param options optionally contain additional data that is passed over to
             *        the event listeners of the graph reset event
             */
            resetCells(cells: Cell[], options?: any);
        }

        class Cell extends Backbone.Model {
            toJSON();
            remove(options?: any);
            toFront();
            toBack();
            embed(cell: Cell);
            unembed(cell: Cell);
            getEmbeddedCells(): Cell[];
            clone(opt?: any): Backbone.Model;      // @todo: return can either be Cell or Cell[].
            attr(attrs: any): Cell;
            attr(path: string, value: any);
        }

        class Element extends Cell {
            position(x: number, y: number): Element;
            translate(tx: number, ty?: number): Element;
            resize(width: number, height: number): Element;
            rotate(angle: number, absolute): Element;
        }

        class Link extends Cell {
            defaults(): any;
            disconnect(): Link;
            label(idx?: number, value?: LinkLabelAttributes): any;   // @todo: returns either a label under idx or Link if both idx and value were passed
        }

        export interface LinkLabelAttributes {
            position?: number;
            attrs?: {
                rect?: {
                    fill?: string;
                    'stroke'?: string;
                    'stroke-width'?: number;
                };
                text?: {
                    fill?: string;
                    'stroke'?: string;
                    'stroke-width'?: number;
                };
            };
        }

        export interface LinkAttributes {
            attrs?: {
                '.connection'?: {
                    fill?: string;
                    stroke?: string;
                    'stroke-width'?: number;
                    'stroke-dasharray'?: string;
                },
                '.marker-source'?: {
                    fill?: string;
                    stroke?: string;
                    'stroke-width'?: number;
                    d?: string;
                },
                '.marker-target'?: {
                    fill?: string;
                    stroke?: string;
                    'stroke-width'?: number;
                    d?: string;
                }
            };
            labels?: LinkLabelAttributes[];
            connector?: {
                name?: string;
                args?: {
                    radius?: number;
                };
            };
            router?: {
                name?: string;
                args?: {
                    startDirections?: string[];
                    endDirections?: string[];
                    excludeTypes?: string[];
                };
            };
            z?: number;
        }

        interface IOptions {
            width: number;
            height: number;
            gridSize: number;
            perpendicularLinks: boolean;
            elementView: ElementView;
            linkView: LinkView;
            origin: {x: number; y: number}
        }
        interface PaperFitToContentOptions {
            gridWidth?: number;
            gridHeight?: number;
            padding?: number | {top: number; right: number; bottom: number; left: number;}
            allowNewOrigin?: string; // one of ['negative'|'positive'|'any']
            minWidth?: number;
            minHeight?: number;
            maxWidth?: number;
            maxHeight?: number;
        }
        interface PaperScaleToFitOptions {
            padding?: number;
            preserveAspectRatio?: boolean;
            minScale?: number;
            maxScale?: number;
            minScaleX?: number;
            minScaleY?: number;
            maxScaleX?: number;
            maxScaleY?: number;
            scaleGrid?: number;
            fittingBBox?: {x?: number; y?: number; width?: number; height?: number;}
        }
        interface PaperOptions extends Backbone.ViewOptions<Backbone.Model> {
            gridSize?: number;
            elementView?: typeof ElementView;
            linkView?: typeof LinkView;
            width?: number;
            height?: number;
            origin?: { x: number; y: number; };
            async?: boolean;
            preventContextMenu?: boolean;
        }
        class Paper extends Backbone.View<Backbone.Model> {
            constructor(options?: PaperOptions);
            options: IOptions;
            svg: SVGElement;
            viewport: SVGGElement;
            setDimensions(width: number, height: number);
            scale(sx: number, sy?: number, ox?: number, oy?: number): Paper;
            rotate(deg: number, ox?: number, oy?: number): Paper;      // @todo not released yet though it's in the source code already
            findView(el: any): CellView;
            findViewByModel(modelOrId: any): CellView;
            findViewsFromPoint(p: { x: number; y: number; }): CellView[];
            findViewsInArea(r: { x: number; y: number; width: number; height: number; }): CellView[];
            fitToContent(opt?: PaperFitToContentOptions);
            snapToGrid(p): { x: number; y: number; };
            scaleContentToFit(opt?: PaperScaleToFitOptions);
            toPNG(callback: (string) => void);
            toSVG(callback: (string) => void);
            openAsSVG();
            print();
            getContentBBox(): g.rect;
            setOrigin(x: number, y: number);
        }

        class ElementView extends CellView  {
            scale(sx: number, sy: number);
            resize();
            update(cell?: any, renderingOnlyAttrs?: any);
        }

        class CellView extends Backbone.View<Cell> {
            getBBox(): { x: number; y: number; width: number; height: number; };
            highlight(el?: any);
            unhighlight(el?: any);
            findMagnet(el: any);
            getSelector(el: any);
        }

        class LinkView extends CellView {
            getConnectionLength(): number;
            getPointAtLength(length: number): { x: number; y: number; };
        }

        /** Rappid only */
        class CommandManager extends Backbone.Model {
            constructor(options?: CommandManagerOptions);
            initialize();
            undo();
            initBatchCommand();
            storeBatchCommand();
            redo();
            reset();
        }

        /** Rappid only */
        interface CommandManagerOptions {
            graph: Graph;
            cmdBeforeAdd?: (cmdName: string, cell: Cell, graph: Graph, options: any) => boolean;
        }
    }

    namespace ui {
        /** Rappid only */
        class PaperScroller extends Backbone.View<Backbone.Model> {
            startPanning(evt): void;
            zoom(size: any, opts: any);
            zoomToFit(params: any);
            toLocalPoint(x: number, y: number): {x: number; y: number};
            center();
            adjustPaper(): void;
        }

        /** Rappid only */
        interface SnaplinesOptions extends Backbone.ViewOptions<Backbone.Model> {
            paper: joint.dia.Paper;
        }

        /** Rappid only */
        class Snaplines extends Backbone.View<Backbone.Model> {
            constructor(options: SnaplinesOptions);
            startListening();
        }

        /** Rappid only */
        interface SelectionViewOptions extends Backbone.ViewOptions<any> {
            paper: joint.dia.Paper;
            graph: joint.dia.Graph;
        }
        
        /** Rappid only */
        class SelectionView extends Backbone.View<any> {
            constructor(options: SelectionViewOptions);
            startSelecting(evt): void;
            cancelSelection();
            createSelectionBox(view: joint.dia.CellView);
            destroySelectionBox(view: joint.dia.CellView);
        }

        /** Rappid only */
        class Halo extends Backbone.View<Backbone.Model> {
            constructor(options: HaloOptions);
            options: HaloOptions;
            addHandle(options: { name:string; position: string; icon: string; });
            removeHandle(name: string): void;
            changeHandle(name: string, options: { position: string; icon: string; }): void;
        }

        /** Rappid only */
        interface HaloOptions {
            graph: joint.dia.Graph;
            paper: joint.dia.Paper;
            cellView: joint.dia.CellView;
            /**
             * The preferred side for a self-loop link created from Halo ("top"|"bottom"|"left"|"right"), default is "top"
             */
            linkLoopPreferredSide?: string;
            /**
             * The self-loop link width in pixels, default is 40
             */
            linkLoopWidth?: number;
            /**
             * The angle increments the rotate action snaps to, default is 15
             */
            rotateAngleGrid?: number;
            /**
             * A function that returns an HTML string with the content that will be used in the information box below the element.
             * Default is x,y,width,height coordinates and dimensions of the element.
             */
            boxContent?: boolean | ((cellView: joint.dia.CellView, boxDOMElement: HTMLElement) => string);
            /**
             * If set to true, the model position and dimensions will be used as a basis for the Halo tools position.
             * By default, this is set to false which causes the Halo tools position be based on the bounding box of
             * the element view. Sometimes though, your shapes can have certain SVG sub elements that stick out
             * of the view and you don't want these sub elements to affect the Halo tools position.
             * In this case, set the useModelGeometry to true.
             */
            useModelGeometry?: boolean;
        }
    }

    namespace shapes {
        module basic {
            class Generic extends joint.dia.Element { }
            class Rect extends Generic { }
            class Text extends Generic { }
            class Circle extends Generic { }
            class Image extends Generic { }
        }
    }

    namespace util {
        function uuid(): string;
        function guid(obj: any): string;
        function mixin(objects: any[]): any;
        function supplement(objects: any[]): any;
        function deepMixin(objects: any[]): any;
        function deepSupplement(objects: any, defaultIndicator?: any): any;
        function imageToDataUri(url: string, callback: (error: Error, dataUri: string) => void): void;
        function normalizeEvent(params: any): any;
    }

    function V(element: SVGElement): V;
    
    interface V {
        node: SVGAElement;
        attr(name: string): string;
        attr(name: string, value: string): void;
        attr(attrs: {}): void;
        scale(): {sx: number; sy: number;}
        bbox(withoutTransformations?: boolean, target?: Element): g.rect;
    }
    
    export namespace g {
        function point(x: number, y: number): point;
        function point(p: {x: number; y: number;}): point;
        interface point {
            x: number;
            y: number;
        }
        
        function rect(x: number, y: number, w: number, h: number): rect;
        interface rect {
            x: number;
            y: number;
            width: number;
            height: number;
            toString(): string;
            origin(): point;
            corner(): point;
            topRight(): point;
            bottomLeft(): point;
            center(): point;
            intersect(r: rect): boolean;
            /// @return 'left' | 'right' | 'top' | 'bottom'
            sideNearestToPoint(p: point): string;
            containsPoint(p: point): boolean;
            containsRect(r: rect): boolean;
            pointNearestToPoint(p: point): point;
            intersectionWithLineFromCenterToPoint(p: point, angle: number): point;
            moveAndExpand(r: rect): rect;
            round(decimals: number): rect;
            normalize(): rect;
            bbox(angle: number): rect;
        }
    }
}
	export = joint;
}
