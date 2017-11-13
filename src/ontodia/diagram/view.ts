import { hcl } from 'd3-color';
import * as Backbone from 'backbone';
import * as joint from 'jointjs';
import { defaultsDeep, cloneDeep } from 'lodash';
import { ReactElement, createElement } from 'react';

import {
    TypeStyleResolver,
    LinkTemplateResolver,
    TemplateResolver,
    CustomTypeStyle,
    ElementTemplate,
    LinkTemplate,
    LinkMarkerStyle,
    LinkRouter,
} from '../customization/props';
import { DefaultTypeStyleBundle } from '../customization/defaultTypeStyles';
import { DefaultLinkTemplateBundle } from '../customization/defaultLinkStyles';
import { DefaultElementTemplate, DefaultTemplateBundle } from '../customization/templates';

import { Halo } from '../viewUtils/halo';
import { ConnectionsMenu, PropertySuggestionHandler } from '../viewUtils/connectionsMenu';
import { Event, EventSource } from '../viewUtils/events';
import {
    toSVG, ToSVGOptions, toDataURL, ToDataURLOptions,
} from '../viewUtils/toSvg';

import { Dictionary, ElementModel, LocalizedString } from '../data/model';

import { Element, Link, FatClassModel, linkMarkerKey } from './elements';
import { LinkView } from './linkView';
import { DiagramModel, chooseLocalizedText, uri2name } from './model';
import { SeparatedElementView } from './separatedElementView';

export interface DiagramViewOptions {
    typeStyleResolvers?: TypeStyleResolver[];
    linkTemplateResolvers?: LinkTemplateResolver[];
    templatesResolvers?: TemplateResolver[];
    disableDefaultHalo?: boolean;
    linkRouter?: LinkRouter;
    suggestProperties?: PropertySuggestionHandler;
}

export interface TypeStyle {
    color: { h: number; c: number; l: number; };
    icon?: string;
}

export enum RenderingLayer {
    Element = 1,
    ElementSize,
    PaperArea,
    Link,

    FirstToUpdate = Element,
    LastToUpdate = Link,
}

/**
 * Properties:
 *     language: string
 *
 * Events:
 *     (private) dispose - fires on view dispose
 */
export class DiagramView extends Backbone.Model {
    private readonly eventSource = new EventSource();

    private typeStyleResolvers: TypeStyleResolver[];
    private linkTemplateResolvers: LinkTemplateResolver[];
    private templatesResolvers: TemplateResolver[];

    paper: joint.dia.Paper;
    private connectionsMenuTarget: Element | undefined;

    readonly selection = new Backbone.Collection<Element>();

    private colorSeed = 0x0BADBEEF;

    private linkTemplates: { [linkTypeId: string]: LinkTemplate } = {};

    readonly linkTemplatesChanged: Event<undefined> = this.eventSource.createEvent();
    readonly syncUpdate: Event<{ layer: RenderingLayer }> = this.eventSource.createEvent();
    readonly updateWidgets: Event<{
        widgets: { [key: string]: ReactElement<any> }
    }> = this.eventSource.createEvent();

    constructor(
        public readonly model: DiagramModel,
        public readonly options: DiagramViewOptions = {},
    ) {
        super();
        this.setLanguage('en');
        this.paper = new joint.dia.Paper({
            model: new joint.dia.Graph(),
            gridSize: 1,
            elementView: SeparatedElementView,
            linkView: LinkView,
            width: 1500,
            height: 800,
            async: true,
            preventContextMenu: false,
            guard: (evt, view) => {
                // filter right mouse button clicks
                if (evt.type === 'mousedown' && evt.button !== 0) { return true; }
                return false;
            },
        });
        (this.paper as any).diagramView = this;

        this.typeStyleResolvers = options.typeStyleResolvers
            ? options.typeStyleResolvers : DefaultTypeStyleBundle;

        this.linkTemplateResolvers = options.linkTemplateResolvers
            ? this.options.linkTemplateResolvers : DefaultLinkTemplateBundle;

        this.templatesResolvers = options.templatesResolvers
            ? options.templatesResolvers : DefaultTemplateBundle;

        this.listenTo(this.paper, 'render:done', () => {
            this.model.trigger('state:renderDone');
        });
        this.listenTo(model, 'state:dataLoaded', () => {
            this.model.resetHistory();
        });
    }

    getLanguage(): string { return this.get('language'); }
    setLanguage(value: string) {
        if (!value) {
            throw Error('cannot set empty language');
        }
        this.set('language', value);
    }

    getLinkTemplates(): { readonly [linkTypeId: string]: LinkTemplate } {
        return this.linkTemplates;
    }

    cancelSelection() { this.selection.reset([]); }

    performSyncUpdate() {
        for (let layer = RenderingLayer.FirstToUpdate; layer <= RenderingLayer.LastToUpdate; layer++) {
            this.syncUpdate.trigger(this.eventSource, {layer});
        }
    }

    initializePaperComponents() {
        if (!this.model.isViewOnly()) {
            this.configureHalo();
            document.addEventListener('keyup', this.onKeyUp);
            this.onDispose(() => document.removeEventListener('keyup', this.onKeyUp));
        }
    }

    private onKeyUp = (e: KeyboardEvent) => {
        const DELETE_KEY_CODE = 46;
        if (e.keyCode === DELETE_KEY_CODE &&
            document.activeElement.localName !== 'input'
        ) {
            this.removeSelectedElements();
        }
    }

    private removeSelectedElements() {
        const elementsToRemove = this.selection.toArray();
        if (elementsToRemove.length === 0) { return; }

        this.cancelSelection();
        this.model.graph.trigger('batch:start');
        for (const element of elementsToRemove) {
            element.remove();
        }
        this.model.graph.trigger('batch:stop');
    }

    onPaperPointerUp(event: MouseEvent, cell: Element | Link | undefined, isClick: boolean) {
        if (this.model.isViewOnly()) { return; }
        // We don't want a Halo for links.
        if (cell instanceof Link) { return; }
        if (event.ctrlKey || event.shiftKey || event.metaKey) { return; }
        if (cell) {
            this.selection.reset([cell]);
            cell.focus();
        } else if (isClick) {
            this.selection.reset();
            this.hideNavigationMenu();
            if (document.activeElement) {
                (document.activeElement as HTMLElement).blur();
            }
        }
    }

    private configureHalo() {
        if (this.options.disableDefaultHalo) { return; }

        const renderDefaultHalo = (selectedElement?: Element) => {
            const halo = createElement(Halo, {
                paper: this.paper,
                diagramView: this,
                target: selectedElement,
                onDelete: () => this.removeSelectedElements(),
                onExpand: () => {
                    selectedElement.isExpanded = !selectedElement.isExpanded;
                },
                navigationMenuOpened: Boolean(this.connectionsMenuTarget),
                onToggleNavigationMenu: () => {
                    if (this.connectionsMenuTarget) {
                        this.hideNavigationMenu();
                    } else {
                        this.showNavigationMenu(selectedElement);
                    }
                    renderDefaultHalo(selectedElement);
                },
                onAddToFilter: () => selectedElement.addToFilter(),
            });
            this.updateWidgets.trigger(this.eventSource, {widgets: {halo}});
        };

        this.listenTo(this.selection, 'add remove reset', () => {
            const selected = this.selection.length === 1 ? this.selection.first() : undefined;
            if (this.connectionsMenuTarget && selected !== this.connectionsMenuTarget) {
                this.hideNavigationMenu();
            }
            renderDefaultHalo(selected);
        });

        renderDefaultHalo();
    }

    showNavigationMenu(target: Element) {
        const connectionsMenu = createElement(ConnectionsMenu, {
            view: this,
            target,
            onClose: () => this.hideNavigationMenu(),
            suggestProperties: this.options.suggestProperties,
        });
        this.connectionsMenuTarget = target;
        this.updateWidgets.trigger(this.eventSource, {widgets: {connectionsMenu}});
    }

    hideNavigationMenu() {
        if (this.connectionsMenuTarget) {
            this.connectionsMenuTarget = undefined;
            this.updateWidgets.trigger(this.eventSource, {widgets: {connectionsMenu: undefined}});
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
                const draggedUri = e.dataTransfer.getData('text/uri-list');
                // element dragged from the class tree has URI of the form:
                // <window.location without hash>#<class URI>
                const uriFromTreePrefix = window.location.href.split('#')[0] + '#';
                const uri = draggedUri.indexOf(uriFromTreePrefix) === 0
                    ? draggedUri.substring(uriFromTreePrefix.length) : draggedUri;
                elementIds = [uri];
            }
        }
        if (!elementIds || elementIds.length === 0) { return; }

        this.model.initBatchCommand();

        let elementsToSelect: Element[] = [];

        let totalXOffset = 0;
        let {x, y} = paperPosition;
        for (const elementId of elementIds) {
            const center = elementIds.length === 1;
            const element = this.createElementAt(elementId, {x: x + totalXOffset, y, center});
            totalXOffset += element.get('size').width + 20;

            elementsToSelect.push(element);
            element.focus();
        }

        this.model.requestElementData(elementsToSelect);
        this.model.requestLinksOfType();
        this.selection.reset(elementsToSelect);

        this.model.storeBatchCommand();
    }

    private createElementAt(elementId: string, position: { x: number; y: number; center?: boolean; }) {
        const element = this.model.createElement(elementId);

        let {x, y} = position;
        const size: { width: number; height: number; } = element.get('size');
        if (position.center) {
            x -= size.width / 2;
            y -= size.height / 2;
        }
        element.set('position', {x, y});

        return element;
    }

    public getLocalizedText(texts: LocalizedString[]): LocalizedString {
        return chooseLocalizedText(texts, this.getLanguage());
    }

    public getElementTypeString(elementModel: ElementModel): string {
        return elementModel.types.map((typeId: string) => {
            const type = this.model.getClassesById(typeId);
            return this.getElementTypeLabel(type).text;
        }).sort().join(', ');
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

    public getTypeStyle(types: string[]): TypeStyle {
        types.sort();

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
        return DefaultElementTemplate;
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

    createLinkTemplate(linkTypeId: string): LinkTemplate {
        const existingTemplate = this.linkTemplates[linkTypeId];
        if (existingTemplate) {
            return existingTemplate;
        }

        let template: LinkTemplate = {};
        for (const resolver of this.linkTemplateResolvers) {
            const result = resolver(linkTypeId);
            if (result) {
                template = cloneDeep(result);
                break;
            }
        }

        fillLinkTemplateDefaults(template, this.model);
        this.linkTemplates[linkTypeId] = template;
        this.linkTemplatesChanged.trigger(this.eventSource, undefined);
        return template;
    }

    public registerLinkTemplateResolver(resolver: LinkTemplateResolver): LinkTemplateResolver {
        this.linkTemplateResolvers.unshift(resolver);
        return resolver;
    }

    public unregisterLinkTemplateResolver(resolver: LinkTemplateResolver): LinkTemplateResolver {
        const index = this.linkTemplateResolvers.indexOf(resolver);
        if (index !== -1) {
            return this.linkTemplateResolvers.splice(index, 1)[0];
        } else {
            return undefined;
        }
    }

    public getOptions(): DiagramViewOptions {
        return this.options;
    }

    private onDispose(handler: () => void) {
        this.listenTo(this, 'dispose', handler);
    }

    dispose() {
        if (!this.paper) { return; }
        this.trigger('dispose');
        this.stopListening();
        this.paper.remove();
        this.paper = undefined;
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

function fillLinkTemplateDefaults(template: LinkTemplate, model: DiagramModel) {
    const defaults: Partial<LinkTemplate> = {
        markerTarget: {d: 'M0,0 L0,8 L9,4 z', width: 9, height: 8, fill: 'black'},
    };
    defaultsDeep(template, defaults);
    if (!template.renderLink) {
        template.renderLink = () => ({});
    }
}

/**
 * Calculate a 32 bit FNV-1a hash
 * Found here: https://gist.github.com/vaiorabbit/5657561
 * Ref.: http://isthe.com/chongo/tech/comp/fnv/
 *
 * @param {string} str the input value
 * @param {integer} [seed] optionally pass the hash of the previous chunk
 * @returns {integer}
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
