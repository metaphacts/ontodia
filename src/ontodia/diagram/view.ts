import * as d3 from 'd3';
import * as Backbone from 'backbone';
import * as $ from 'jquery';
import * as joint from 'jointjs';

import { Indicator, WrapIndicator } from '../../svgui/indicator';

import {
    TypeStyleResolver,
    LinkStyleResolver,
    TemplateResolver,
    CustomTypeStyle,
    ElementTemplate,
} from '../customization/props';
import { DefaultTypeStyleBundle } from '../customization/defaultTypeStyles';
import { DefaultLinkStyleBundle } from '../customization/defaultLinkStyles';
import { DefaultTemplate } from '../customization/defaultTemplate';
import { DefaultTemplateBundle } from '../customization/templates/defaultTemplates';

import { PaperArea } from '../viewUtils/paperArea';
import { Halo } from '../viewUtils/halo';
import {
    toSVG, ToSVGOptions, toDataURL, ToDataURLOptions,
} from '../viewUtils/toSvg';

import { ElementModel, LocalizedString } from '../data/model';

import { DiagramModel, chooseLocalizedText, uri2name } from './model';
import { Element, FatClassModel } from './elements';

import { LinkView } from './elementViews';
import { TemplatedUIElementView } from './templatedElementView';

export interface DiagramViewOptions {
    typeStyleResolvers?: TypeStyleResolver[];
    linkStyleResolvers?: LinkStyleResolver[];
    templatesResolvers?: TemplateResolver[];
    disableDefaultHalo?: boolean;
}

export interface TypeStyle {
    color: { h: number; c: number; l: number; };
    icon?: string;
}

/**
 * Properties:
 *     language: string
 */
export class DiagramView extends Backbone.Model {
    private typeStyleResolvers: TypeStyleResolver[];
    private linkStyleResolvers: LinkStyleResolver[];
    private templatesResolvers: TemplateResolver[];

    readonly paper: joint.dia.Paper;
    paperArea: PaperArea;
    private halo: Halo;

    readonly selection = new Backbone.Collection<Element>();

    private $svg: JQuery;
    private $documentBody: JQuery;
    private indicator: WrapIndicator;
    private colorSeed = 0x0BADBEEF;

    public dragAndDropElements: { [id: string]: Element };

    private toSVGOptions: ToSVGOptions = {
        elementsToRemoveSelector: '.link-tools, .marker-vertices',
        convertImagesToDataUris: true,
    };

    readonly options: DiagramViewOptions;

    constructor(public model: DiagramModel, rootElement: HTMLElement, options: DiagramViewOptions = {}) {
        super();
        this.setLanguage('en');
        this.paper = new joint.dia.Paper({
            model: this.model.graph,
            gridSize: 1,
            elementView: TemplatedUIElementView,
            linkView: LinkView,
            width: 1500,
            height: 800,
            async: true,
            preventContextMenu: false,
        });
        this.paper['diagramView'] = this;
        this.$svg = this.paper.$('svg');
        this.options = options;

        this.typeStyleResolvers = options.typeStyleResolvers
            ? options.typeStyleResolvers : DefaultTypeStyleBundle;

        this.linkStyleResolvers = options.linkStyleResolvers
            ? this.options.linkStyleResolvers : DefaultLinkStyleBundle;

        this.templatesResolvers = options.templatesResolvers
            ? options.templatesResolvers : DefaultTemplateBundle;

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

        if (!this.options.disableDefaultHalo) {
            this.listenTo(this.selection, 'add remove reset', () => {

                if (this.selection.length === 1) {
                    const cellView = this.paper.findViewByModel(this.selection.first());
                    if (this.halo && cellView !== this.halo.options.cellView) {
                        this.halo.remove();
                        this.halo = undefined;
                    }
                    if (!this.halo) {
                        this.halo = new Halo({
                            paper: this.paper,
                            cellView: cellView,
                            onDelete: () => {
                                this.removeSelectedElements();
                            },
                            onExpand: () => {
                                cellView.model.set('isExpanded', !cellView.model.get('isExpanded'));
                            },
                            diagramView: this,
                        });
                    }
                } else if (this.halo && this.selection.length === 0) {
                    this.halo.remove();
                    this.halo = undefined;
                }
            });
        }
    }

    getLanguage(): string { return this.get('language'); }
    setLanguage(value: string) { this.set('language', value); }

    cancelSelection() { this.selection.reset([]); }

    print() {
        this.exportSVG().then(svg => {
            const printWindow = window.open('', undefined, 'width=1280,height=720');
            printWindow.document.write(svg);
            printWindow.print();
        });
    }
    exportSVG(): Promise<string> {
        return toSVG(this.paper, this.toSVGOptions);
    }
    exportPNG(options?: ToDataURLOptions): Promise<string> {
        options = options || {};
        options.svgOptions = options.svgOptions || this.toSVGOptions;
        return toDataURL(this.paper, options);
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
        const convertToAny: any = this.paper.$('svg').get(0);
        const svgElement: SVGElement = convertToAny;
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
        if (
            e.keyCode === DELETE_KEY_CODE &&
            document.activeElement.localName !== 'input'
        ) {
            this.removeSelectedElements();
        }
    };

    private removeSelectedElements() {
        const elementsToRemove = this.selection.toArray();
        if (elementsToRemove.length === 0) { return; }

        this.cancelSelection();
        this.model.graph.trigger('batch:start');
        for (const element of elementsToRemove) {
            element.remove();
        }
        this.model.graph.trigger('batch:stop');
    };

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
            if (!this.options.disableDefaultHalo) {
                element.addToFilter();
            }
            element.focus();
        });

        this.paper.on('blank:pointerclick', (object, evt: MouseEvent) => {
            this.selection.reset();
            (document.activeElement as HTMLElement).blur();
        });

        this.paper.on('blank:pointerclick', (object, evt: MouseEvent) => {
            this.selection.reset();
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
                    const convertToAny: any = {ignoreCommandManager: true};
                    element.set('position', {
                        x: graphPoint.x + totalXOffset,
                        y: graphPoint.y,
                    }, convertToAny);
                    totalXOffset += size.width + 20;

                    elementsToSelect.push(element);
                    element.focus();
                }
            }

            this.selection.reset(elementsToSelect);
            if (elementsToSelect.length === 1 && !this.options.disableDefaultHalo) {
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
            const type = this.model.getClassesById(typeId);
            return this.getElementTypeLabel(type).text;
        }).join(', ');
    }

    public getElementTypeLabel(type: FatClassModel): LocalizedString {
        const label = this.getLocalizedText(type.get('label').values);
        return label ? label : { text: uri2name(type.id), lang: '' };
    }

    public getLinkLabel(linkTypeId: string): LocalizedString {
        const type = this.model.getLinkType(linkTypeId);
        const label = type ? this.getLocalizedText(type.get('label').values) : null;
        return label ? label : { text: uri2name(linkTypeId), lang: '' };
    }

    /**
     * @param types Type signature, MUST BE sorted; see DiagramModel.normalizeData()
     */
    public getTypeStyle(types: string[]): TypeStyle {
        let customStyle: CustomTypeStyle;
        for (const resolver of this.typeStyleResolvers) {
            const result = resolver(types);
            if (result) {
                customStyle = result;
                break;
            }
        }

        const icon = customStyle ? customStyle.icon : undefined;
        let color;
        if (customStyle && customStyle.color) {
            color = d3.hcl(customStyle.color);
        } else {
            const hue = getHueFromClasses(types, this.colorSeed);
            color = {h: hue, c: 40, l: 75};
        }
        return {icon, color};
    }

    public registerElementStyleResolver(resolver: TypeStyleResolver): TypeStyleResolver {
        this.typeStyleResolvers.unshift(resolver);
        return resolver;
    }

    public unregisterElementStyleResolver(resolver: TypeStyleResolver): TypeStyleResolver {
        const index = this.typeStyleResolvers.indexOf(resolver);
        if (index !== -1) {
            return this.typeStyleResolvers.splice(index, 1)[0];
        } else {
            return undefined;
        }
    }

    public getElementTemplate(types: string[]): ElementTemplate {
        for (const resolver of this.templatesResolvers) {
            const result = resolver(types);
            if (result) {
                return result;
            }
        }
        return DefaultTemplate;
    }

    public registerTemplateResolver(resolver: TemplateResolver): TemplateResolver {
        this.templatesResolvers.unshift(resolver);
        return resolver;
    }

    public unregisterTemplateResolver(resolver: TemplateResolver): TemplateResolver {
        const index = this.templatesResolvers.indexOf(resolver);
        if (index !== -1) {
            return this.templatesResolvers.splice(index, 1)[0];
        } else {
            return undefined;
        }
    }

    public getLinkStyle(type: string): joint.dia.LinkAttributes {
        for (const resolver of this.linkStyleResolvers) {
            const result = resolver(type);
            if (result) {
                return result;
            }
        }
        return undefined;
    }

    public registerLinkStyleResolver(resolver: LinkStyleResolver): LinkStyleResolver {
        this.linkStyleResolvers.unshift(resolver);
        return resolver;
    }

    public unregisterLinkStyleResolver(resolver: LinkStyleResolver): LinkStyleResolver {
        const index = this.linkStyleResolvers.indexOf(resolver);
        if (index !== -1) {
            return this.linkStyleResolvers.splice(index, 1)[0];
        } else {
            return undefined;
        }
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
