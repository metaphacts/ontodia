import * as d3 from 'd3';
import * as Backbone from 'backbone';
import * as $ from 'jquery';
import * as joint from 'jointjs';

import * as svgui from '../../svgui/svgui';
import { Indicator, WrapIndicator } from '../../svgui/indicator';

import { ElementModel, LocalizedString, ClassModel } from '../data/model';

import { Element, Link } from './elements';
import { DiagramModel, chooseLocalizedText, uri2name } from './model';

import { PaperArea } from '../viewUtils/paperArea';
import { printPaper } from '../viewUtils/printPaper';
import {
    toSVG, toSVGOptions, toDataURL, toDataURLOptions,
} from '../viewUtils/toSvg';
import { UIElementView, LinkView } from './elementViews';

export interface DiagramViewOptions {
    elementColor?: (elementModel: ElementModel) => string;
    customLinkStyle?: (link: Link) => joint.dia.LinkAttributes;
}

/**
 * Properties:
 *     language: string
 */
export class DiagramView extends Backbone.Model {
    readonly paper: joint.dia.Paper;
    paperArea: PaperArea;

    readonly selection = new Backbone.Collection<Element>();

    private $svg: JQuery;
    private $documentBody: JQuery;
    private indicator: WrapIndicator;
    private colorSeed = 0x0BADBEEF;

    public dragAndDropElements: { [id: string]: Element };

    private toSVGOptions: toSVGOptions = {
        elementsToRemoveSelector: '.link-tools, .marker-vertices',
        blacklistedCssAttributes: [
            '-webkit-column-rule-color',
            '-webkit-tap-highlight-color',
            '-webkit-text-emphasis-color',
            '-webkit-text-fill-color',
            '-webkit-text-stroke-color',
            '-webkit-user-select',
            'cursor',
            'white-space',
            'box-sizing',
            'line-height',
            'outline-color',
        ],
    };

    readonly options: DiagramViewOptions;

    constructor(public model: DiagramModel, rootElement: HTMLElement, options?: DiagramViewOptions) {
        super();
        this.setLanguage('en');
        this.paper = new joint.dia.Paper({
            model: this.model.graph,
            gridSize: 1,
            elementView: UIElementView,
            linkView: LinkView,
            width: 1500,
            height: 800,
            async: true,
            preventContextMenu: false,
        });
        this.paper['diagramView'] = this;
        this.$svg = this.paper.$('svg');
        this.options = options || {};

        this.setupTextSelectionPrevention();
        this.configureArea(rootElement);
        this.configureSelection();
        this.enableDragAndDropSupport();

        $('html').keyup(this.onKeyUp);

        let indicator: Indicator;
        const onLoaded = (elementCount?: number, error?: any) => {
            if (this.indicator) {
                this.indicator.remove();
            }
            const createTemporaryIndicator = (status?: string) => {
                const paperRect = this.$svg.get(0).getBoundingClientRect();
                const x = status ? paperRect.width / 4 : paperRect.width / 2;
                indicator = Indicator.create(d3.select(this.$svg.get(0)), {
                    position: {x: x, y: paperRect.height / 2 },
                });
                indicator.status(status);
            };
            const WARN_ELEMENT_COUNT = 70;
            if (error) {
                createTemporaryIndicator(error.statusText || error.message);
                indicator.error();
            } else if (elementCount > WARN_ELEMENT_COUNT) {
                createTemporaryIndicator(
                    `The diagram contains more than ${WARN_ELEMENT_COUNT} ` +
                    `elements. Please wait until it is fully loaded.`);
            } else {
                createTemporaryIndicator();
            }
            indicator.run();
        };
        this.listenTo(model, 'state:beginLoad', this.showIndicator);
        this.listenTo(model, 'state:endLoad', onLoaded);
        this.listenTo(model, 'state:loadError', (error: any) => onLoaded(null, error));
        this.listenTo(model, 'state:renderStart', () => {
            if (indicator) { indicator.remove(); }
        });
        this.listenTo(this.paper, 'render:done', () => {
            this.model.trigger('state:renderDone');
        });
        this.listenTo(model, 'state:dataLoaded', () => {
            this.model.resetHistory();
            this.zoomToFit();
        });
    }

    getLanguage(): string { return this.get('language'); }
    setLanguage(value: string) { this.set('language', value); }

    cancelSelection() { this.selection.reset([]); }

    print() {
        const $html = $(document.documentElement);
        printPaper(this.paper, {
            beforePrint: () => $html.addClass('print-ready'),
            afterPrint: () => $html.removeClass('print-ready'),
            printFinished: () => this.zoomToFit(),
        });
    }
    exportSVG(): Promise<string> {
        return new Promise<string>(resolve => {
            toSVG(this.paper, resolve, this.toSVGOptions);
        });
    }
    exportPNG(options?: toDataURLOptions): Promise<string> {
        options = options || {};
        options.svgOptions = options.svgOptions || this.toSVGOptions;
        return new Promise<string>(resolve => {
            toDataURL(this.paper, resolve, options);
        });
    }

    zoomIn() { this.paperArea.zoom(0.2, { max: 2 }); }
    zoomOut() { this.paperArea.zoom(-0.2, { min: 0.2 }); }
    zoomToFit() {
        if (this.model.graph.get('cells').length > 0) {
            this.paperArea.zoomToFit({
                minScale: 0.2,
                maxScale: 2,
            });
            this.paperArea.zoom(-0.1, { min: 0.2 });
        } else {
            this.paperArea.center();
        }
    }

    showIndicator(operation?: Promise<any>) {
        this.paperArea.center();
        const svgElement: SVGElement = <any>this.paper.$('svg').get(0);
        const svgBoundingRect = svgElement.getBoundingClientRect();
        this.indicator = WrapIndicator.wrap(d3.select(svgElement), {
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

    private onKeyUp = (e: KeyboardEvent) => {
        const DELETE_KEY_CODE = 46;
        if (e.keyCode === DELETE_KEY_CODE) {
            const elementsToRemove = this.selection.toArray();
            if (elementsToRemove.length === 0) { return; }

            this.cancelSelection();
            this.model.graph.trigger('batch:start');
            for (const element of elementsToRemove) {
                element.remove();
            }
            this.model.graph.trigger('batch:stop');
        }
    }

    private setupTextSelectionPrevention() {
        this.$documentBody = $(document.body);
        this.paper.on('cell:pointerdown', () => {
            this.preventTextSelection();
        });
        document.addEventListener('mouseup', () => {
            this.$documentBody.removeClass('unselectable');
        });
        if ('onselectstart' in document) { // IE unselectable fix
            document.addEventListener('selectstart', () => {
                const unselectable = this.$documentBody.hasClass('unselectable');
                return !unselectable;
            });
        }
    }

    preventTextSelection() {
        this.$documentBody.addClass('unselectable');
    }

    private configureArea(rootElement: HTMLElement) {
        this.paperArea = new PaperArea({paper: this.paper});
        this.paper.on('blank:pointerdown', (evt) => {
            if (evt.ctrlKey || this.model.isViewOnly()) {
                this.preventTextSelection();
                this.cancelSelection();
                this.paperArea.startPanning(evt);
            }
        });
        $(rootElement).append(this.paperArea.render().el);

        this.listenTo(this.paper, 'render:done', () => {
            this.paperArea.adjustPaper();
            this.paperArea.center();
        });

        // automatic paper adjust on element dragged
        this.listenTo(this.paper, 'cell:pointerup', () => {
            this.paperArea.adjustPaper();
        });
    }

    private configureSelection() {
        if (this.model.isViewOnly()) { return; }

        this.paper.on('cell:pointerup', (cellView: joint.dia.CellView, evt: MouseEvent) => {
            // We don't want a Halo for links.
            if (cellView.model instanceof joint.dia.Link) { return; }
            if (evt.ctrlKey || evt.metaKey) { return; }
            const element = cellView.model as Element;
            this.selection.reset([element]);
            element.addToFilter();
        });
    }

    private enableDragAndDropSupport() {
        const svg = this.$svg.get(0);
        svg.addEventListener('dragover', (e: DragEvent) => {
            if (e.preventDefault) { e.preventDefault(); } // Necessary. Allows us to drop.
            e.dataTransfer.dropEffect = 'move';
            return false;
        });
        svg.addEventListener('dragenter', function (e) { /* nothing */});
        svg.addEventListener('dragleave', function (e) { /* nothing */ });
        svg.addEventListener('drop', (e: DragEvent) => {
            e.preventDefault();
            let elementIds: string[];
            try {
                elementIds = JSON.parse(e.dataTransfer.getData('application/x-ontodia-elements'));
            } catch (ex) {
                try {
                    elementIds = JSON.parse(e.dataTransfer.getData('text')); // IE fix
                } catch (ex) {
                    const uriFromTree = e.dataTransfer.getData('text/uri-list');
                    elementIds = [uriFromTree.substr(uriFromTree.indexOf('#') + 1, uriFromTree.length)];
                }
            }
            if (!elementIds) { return; }

            this.model.initBatchCommand();

            let elementsToSelect: Element[] = [];

            let totalXOffset = 0;
            for (const elementId of elementIds) {
                const element = this.getDragAndDropElement(elementId);
                if (element) {
                    const currentOffset = this.paperArea.$el.offset();
                    const relX = e.pageX - currentOffset.left;
                    const relY = e.pageY - currentOffset.top;
                    const graphPoint = this.paperArea.toLocalPoint(relX, relY);
                    element.set('presentOnDiagram', true);
                    element.set('selectedInFilter', false);
                    const size: { width: number; height: number; } = element.get('size');
                    if (elementIds.length === 1) {
                        graphPoint.x -= size.width / 2;
                        graphPoint.y -= size.height / 2;
                    }
                    element.set('position', {
                        x: graphPoint.x + totalXOffset,
                        y: graphPoint.y,
                    }, <any>{ignoreCommandManager: true});
                    totalXOffset += size.width + 20;

                    elementsToSelect.push(element);
                }
            }

            this.selection.reset(elementsToSelect);
            if (elementsToSelect.length === 1) {
                elementsToSelect[0].addToFilter();
            }

            this.model.storeBatchCommand();
        });
    }

    private getDragAndDropElement(elementId: string): Element {
        if (this.model.elements[elementId]) {
            return this.model.elements[elementId];
        } else if (this.dragAndDropElements && this.dragAndDropElements[elementId]) {
            const element = this.dragAndDropElements[elementId];
            this.model.initializeElement(element, {requestData: true});
            return element;
        } else {
            return this.model.createElement({
                id: elementId,
                types: [],
                label: {values: [{lang: '', text: elementId}]},
                properties: {},
            });
        }
    }

    public getLocalizedText(texts: LocalizedString[]): LocalizedString {
        return chooseLocalizedText(texts, this.getLanguage());
    }

    public getElementTypeString(elementModel: ElementModel): string {
        return elementModel.types.map((typeId: string) => {
            const type = this.model.classesById[typeId];
            return type ? this.getElementTypeLabel(type).text : uri2name(typeId);
        }).join(', ');
    }

    public getElementTypeLabel(type: ClassModel): LocalizedString {
        const label = this.getLocalizedText(type.label.values);
        return label ? label : { text: uri2name(type.id), lang: '' };
    }

    public getLinkLabel(linkTypeId: string): LocalizedString {
        const type = this.model.linkTypes[linkTypeId];
        const label = type ? this.getLocalizedText(type.label.values) : null;
        return label ? label : { text: uri2name(linkTypeId), lang: '' };
    }

    public getElementColor(elementModel: ElementModel): { h: number; c: number; l: number; } {
        let color = this.options.elementColor ? this.options.elementColor(elementModel) : undefined;

        if (color) {
            return d3.hcl(color);
        } else {
            // elementModel.types MUST BE sorted; see DiagramModel.normalizeData()
            const hue = getHueFromClasses(elementModel.types, this.colorSeed);
            return {h: hue, c: 40, l: 75};
        }
    }

    public getRandomPositionInViewport() {
        const margin = { left: 100, top: 60, right: 100, bottom: 60 };
        const offset = this.getCanvasPageOffset();
        return {
            x: offset.x + margin.left + Math.random() * (
                this.$svg.width() - margin.left - margin.right),
            y: offset.y + margin.top + Math.random() * (
                this.$svg.height() - margin.top - margin.bottom),
        };
    }

    private getCanvasPageOffset(): svgui.Vector {
        const boundingBox = this.$svg.get(0).getBoundingClientRect();
        const xScroll = (typeof window.pageXOffset !== 'undefined') ? window.pageXOffset
            : (<any> document.documentElement || document.body.parentNode || document.body).scrollLeft;
        const yScroll = (typeof window.pageYOffset !== 'undefined') ? window.pageYOffset
            : (<any> document.documentElement || document.body.parentNode || document.body).scrollTop;
        return {x: boundingBox.left + xScroll, y: boundingBox.top + yScroll};
    }

    public getOptions(): DiagramViewOptions {
        return this.options;
    }
}

function getHueFromClasses(classes: string[], seed?: number): number {
    let hash = seed;
    for (const name of classes) {
        hash = hashFnv32a(name, hash);
    }
    const MAX_INT32 = 0x7fffffff;
    return 360 * ((hash === undefined ? 0 : hash) / MAX_INT32);
}

/**
 * Calculate a 32 bit FNV-1a hash
 * Found here: https://gist.github.com/vaiorabbit/5657561
 * Ref.: http://isthe.com/chongo/tech/comp/fnv/
 *
 * @param {string} str the input value
 * @param {boolean} [asString=false] set to true to return the hash value as
 *     8-digit hex string instead of an integer
 * @param {integer} [seed] optionally pass the hash of the previous chunk
 * @returns {integer | string}
 */
function hashFnv32a(str: string, seed = 0x811c9dc5): number {
    /* tslint:disable:no-bitwise */
    let i, l, hval = seed & 0x7fffffff;

    for (i = 0, l = str.length; i < l; i++) {
        hval ^= str.charCodeAt(i);
        hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
    }
    return hval >>> 0;
    /* tslint:enable:no-bitwise */
}

export default DiagramView;
