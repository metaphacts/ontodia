import { hcl } from 'd3';
import * as Backbone from 'backbone';
import * as $ from 'jquery';
import * as joint from 'jointjs';
import { merge, cloneDeep } from 'lodash';

import {
    TypeStyleResolver,
    LinkStyleResolver,
    TemplateResolver,
    CustomTypeStyle,
    ElementTemplate,
    LinkStyle, LinkMarkerStyle,
} from '../customization/props';
import { DefaultTypeStyleBundle } from '../customization/defaultTypeStyles';
import { DefaultLinkStyleBundle } from '../customization/defaultLinkStyles';
import { DefaultTemplate } from '../customization/defaultTemplate';
import { DefaultTemplateBundle } from '../customization/templates/defaultTemplates';

import { Halo } from '../viewUtils/halo';
import { ConnectionsMenu } from '../viewUtils/connectionsMenu';
import {
    toSVG, ToSVGOptions, toDataURL, ToDataURLOptions,
} from '../viewUtils/toSvg';

import { Dictionary, ElementModel, LocalizedString } from '../data/model';

import { DiagramModel, chooseLocalizedText, uri2name } from './model';
import { Element, FatClassModel, linkMarkerKey } from './elements';

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
    halo: Halo;
    connectionsMenu: ConnectionsMenu;

    readonly selection = new Backbone.Collection<Element>();

    private colorSeed = 0x0BADBEEF;

    public dragAndDropElements: Dictionary<Element>;

    private toSVGOptions: ToSVGOptions = {
        elementsToRemoveSelector: '.link-tools, .marker-vertices',
        convertImagesToDataUris: true,
    };

    private linkMarkers: Dictionary<{
        start: SVGMarkerElement;
        end: SVGMarkerElement;
    }> = {};

    constructor(
        public readonly model: DiagramModel,
        public readonly options: DiagramViewOptions = {}
    ) {
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
        (this.paper as any).diagramView = this;

        this.typeStyleResolvers = options.typeStyleResolvers
            ? options.typeStyleResolvers : DefaultTypeStyleBundle;

        this.linkStyleResolvers = options.linkStyleResolvers
            ? this.options.linkStyleResolvers : DefaultLinkStyleBundle;

        this.templatesResolvers = options.templatesResolvers
            ? options.templatesResolvers : DefaultTemplateBundle;

        this.configureSelection();
        this.configureDefaultHalo();

        $('html').keyup(this.onKeyUp);

        this.listenTo(this.paper, 'render:done', () => {
            this.model.trigger('state:renderDone');
        });
        this.listenTo(model, 'state:dataLoaded', () => {
            this.model.resetHistory();
        });
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

    exportPNG(options: ToDataURLOptions = {}): Promise<string> {
        options.svgOptions = options.svgOptions || this.toSVGOptions;
        return toDataURL(this.paper, options);
    }

    private onKeyUp = (e: KeyboardEvent) => {
        const DELETE_KEY_CODE = 46;
        if (e.keyCode === DELETE_KEY_CODE &&
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

    private configureSelection() {
        if (this.model.isViewOnly()) { return; }

        this.paper.on('cell:pointerup', (cellView: joint.dia.CellView, evt: MouseEvent) => {
            // We don't want a Halo for links.
            if (cellView.model instanceof joint.dia.Link) { return; }
            if (evt.ctrlKey || evt.shiftKey || evt.metaKey) { return; }
            const element = cellView.model as Element;
            this.selection.reset([element]);
            if (!this.options.disableDefaultHalo) {
                element.addToFilter();
            }
            element.focus();
        });

        let pointerScreenCoords = {x: NaN, y: NaN};
        this.paper.on('blank:pointerdown', (evt: MouseEvent) => {
            pointerScreenCoords = {x: evt.screenX, y: evt.screenY};
        });

        this.paper.on('blank:pointerup', (evt: MouseEvent) => {
            if (evt.screenX !== pointerScreenCoords.x || evt.screenY !== pointerScreenCoords.y) { return; }
            this.selection.reset();
            if (document.activeElement) {
                (document.activeElement as HTMLElement).blur();
            }
        });
    }

    private configureDefaultHalo() {
        if (this.options.disableDefaultHalo) { return; }

        this.listenTo(this.selection, 'add remove reset', () => {
            if (this.selection.length === 1) {
                const selectedElement = this.selection.first();
                const cellView = this.paper.findViewByModel(selectedElement);
                if (this.halo && cellView !== this.halo.options.cellView) {
                    this.halo.remove();
                    this.halo = undefined;
                }
                if (!this.halo) {
                    this.halo = new Halo({
                        paper: this.paper,
                        diagramView: this,
                        cellView: cellView,
                        onDelete: () => {
                            this.removeSelectedElements();
                        },
                        onExpand: () => {
                            cellView.model.set('isExpanded', !cellView.model.get('isExpanded'));
                        },
                        onToggleNavigationMenu: () => {
                            if (this.connectionsMenu) {
                                this.hideNavigationMenu();
                            } else {
                                this.showNavigationMenu(selectedElement);
                            }
                        },
                    });
                }
            } else if (this.halo && this.selection.length === 0) {
                this.halo.remove();
                this.halo = undefined;
            }
        });
    }

    showNavigationMenu(element: Element) {
        const cellView = this.paper.findViewByModel(element);
        this.connectionsMenu = new ConnectionsMenu({
            paper: this.paper,
            view: this,
            cellView,
            onClose: () => {
                this.connectionsMenu.remove();
                this.connectionsMenu = undefined;
            },
        });
    }

    hideNavigationMenu() {
        if (this.connectionsMenu) {
            this.connectionsMenu.remove();
            this.connectionsMenu = undefined;
        }
    }

    onDragDrop(e: DragEvent, paperPosition: { x: number; y: number; }) {
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
        let {x, y} = paperPosition;
        for (const elementId of elementIds) {
            const element = this.getDragAndDropElement(elementId);
            element.set('presentOnDiagram', true);
            element.set('selectedInFilter', false);
            const size: { width: number; height: number; } = element.get('size');
            if (elementIds.length === 1) {
                x -= size.width / 2;
                y -= size.height / 2;
            }
            const ignoreHistory = {ignoreCommandManager: true};
            element.set('position', {x: x + totalXOffset, y: y}, ignoreHistory);
            totalXOffset += size.width + 20;

            elementsToSelect.push(element);
            element.focus();
        }

        this.selection.reset(elementsToSelect);
        if (elementsToSelect.length === 1 && !this.options.disableDefaultHalo) {
            elementsToSelect[0].addToFilter();
        }

        this.model.storeBatchCommand();
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
        let color: { h: number; c: number; l: number; };
        if (customStyle && customStyle.color) {
            color = hcl(customStyle.color);
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

    getLinkStyle(linkTypeId: string): LinkStyle {
        let style = getDefaultLinkStyle();
        for (const resolver of this.linkStyleResolvers) {
            const result = resolver(linkTypeId);
            if (result) {
                merge(style, cloneDeep(result));
                break;
            }
        }
        if (!this.linkMarkers[linkTypeId]) {
            this.linkMarkers[linkTypeId] = {
                start: this.createLinkMarker(linkTypeId, true, style.markerSource),
                end: this.createLinkMarker(linkTypeId, false, style.markerTarget),
            };
        }
        return style;
    }

    private createLinkMarker(linkTypeId: string, startMarker: boolean, style: LinkMarkerStyle) {
        if (!style) { return undefined; }

        const SVG_NAMESPACE: 'http://www.w3.org/2000/svg' = 'http://www.w3.org/2000/svg';
        const defs = this.paper.svg.getElementsByTagNameNS(SVG_NAMESPACE, 'defs')[0];
        const marker = document.createElementNS(SVG_NAMESPACE, 'marker');
        const linkTypeIndex = this.model.getLinkType(linkTypeId).index;
        marker.setAttribute('id', linkMarkerKey(linkTypeIndex, startMarker));
        marker.setAttribute('markerWidth', style.width.toString());
        marker.setAttribute('markerHeight', style.height.toString());
        marker.setAttribute('orient', 'auto');

        let xOffset = startMarker ? 0 : (style.width - 1);
        marker.setAttribute('refX', xOffset.toString());
        marker.setAttribute('refY', (style.height / 2).toString());
        marker.setAttribute('markerUnits', 'userSpaceOnUse');

        const path = document.createElementNS(SVG_NAMESPACE, 'path');
        path.setAttribute('d', style.d);
        if (style.fill !== undefined) { path.setAttribute('fill', style.fill); }
        if (style.stroke !== undefined) { path.setAttribute('stroke', style.stroke); }
        if (style.strokeWidth !== undefined) { path.setAttribute('stroke-width', style.strokeWidth); }

        marker.appendChild(path);
        defs.appendChild(marker);
        return marker;
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

function getDefaultLinkStyle(): LinkStyle {
    return {
        markerTarget: {d: 'M0,0 L0,8 L9,4 z', width: 9, height: 8, fill: 'black'},
    };
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
    let i: number, l: number, hval = seed & 0x7fffffff;

    for (i = 0, l = str.length; i < l; i++) {
        hval ^= str.charCodeAt(i);
        hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
    }
    return hval >>> 0;
    /* tslint:enable:no-bitwise */
}

export default DiagramView;
