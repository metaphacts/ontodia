import { hcl } from 'd3-color';
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
import { Events, EventSource, EventObserver, PropertyChange } from '../viewUtils/events';
import {
    toSVG, ToSVGOptions, toDataURL, ToDataURLOptions,
} from '../viewUtils/toSvg';

import { Dictionary, ElementModel, LocalizedString } from '../data/model';

import { Element, Link, FatLinkType, FatClassModel, linkMarkerKey } from './elements';
import { Size, boundsOf } from './geometry';
import { DiagramModel, chooseLocalizedText, uri2name } from './model';

export interface DiagramViewOptions {
    typeStyleResolvers?: TypeStyleResolver[];
    linkTemplateResolvers?: LinkTemplateResolver[];
    templatesResolvers?: TemplateResolver[];
    disableDefaultHalo?: boolean;
    linkRouter?: LinkRouter;
    suggestProperties?: PropertySuggestionHandler;
    onIriClick?: (iri: string, element: Element, event: React.MouseEvent<any>) => void;
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

export interface DiagramViewEvents {
    changeLanguage: PropertyChange<DiagramView, string>;
    changeSelection: PropertyChange<DiagramView, ReadonlyArray<Element>>;
    changeLinkTemplates: { source: DiagramView };
    syncUpdate: { layer: RenderingLayer };
    updateWidgets: UpdateWidgetsEvent;
    renderDone: { source: DiagramView };
    dispose: { source: DiagramView };
}

export interface UpdateWidgetsEvent {
    widgets: { [key: string]: ReactElement<any> };
}

export class DiagramView {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<DiagramViewEvents>();
    readonly events: Events<DiagramViewEvents> = this.source;

    private disposed = false;

    private readonly colorSeed = 0x0BADBEEF;

    private typeStyleResolvers: TypeStyleResolver[];
    private linkTemplateResolvers: LinkTemplateResolver[];
    private templatesResolvers: TemplateResolver[];

    private connectionsMenuTarget: Element | undefined;

    private _language = 'en';
    private _selection: ReadonlyArray<Element> = [];
    private linkTemplates: { [linkTypeId: string]: LinkTemplate } = {};

    constructor(
        public readonly model: DiagramModel,
        public readonly options: DiagramViewOptions = {},
    ) {
        this.typeStyleResolvers = options.typeStyleResolvers
            ? options.typeStyleResolvers : DefaultTypeStyleBundle;

        this.linkTemplateResolvers = options.linkTemplateResolvers
            ? this.options.linkTemplateResolvers : DefaultLinkTemplateBundle;

        this.templatesResolvers = options.templatesResolvers
            ? options.templatesResolvers : DefaultTemplateBundle;
    }

    get selection() { return this._selection; }
    setSelection(value: ReadonlyArray<Element>) {
        const previous = this._selection;
        if (previous === value) { return; }
        this._selection = value;
        this.source.trigger('changeSelection', {source: this, previous});
    }

    getLanguage(): string { return this._language; }
    setLanguage(value: string) {
        if (!value) {
            throw new Error('Cannot set empty language.');
        }
        const previous = this._language;
        if (previous === value) { return; }
        this._language = value;
        this.source.trigger('changeLanguage', {source: this, previous});
    }

    getLinkTemplates(): { readonly [linkTypeId: string]: LinkTemplate } {
        return this.linkTemplates;
    }

    cancelSelection() {
        this.setSelection([]);
    }

    performSyncUpdate() {
        for (let layer = RenderingLayer.FirstToUpdate; layer <= RenderingLayer.LastToUpdate; layer++) {
            this.source.trigger('syncUpdate', {layer});
        }
    }

    _onRenderDone() {
        this.source.trigger('renderDone', {source: this});
    }

    waitUntilRenderDone(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.listener.listenOnce(this.events, 'renderDone', () => resolve());
        });
    }

    initializePaperComponents() {
        if (!this.options.disableDefaultHalo) {
            this.configureHalo();
            document.addEventListener('keyup', this.onKeyUp);
            this.listener.listen(this.events, 'dispose', () => {
                document.removeEventListener('keyup', this.onKeyUp);
            });
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
        const elementsToRemove = this.selection;
        if (elementsToRemove.length === 0) { return; }

        this.cancelSelection();
        this.model.initBatchCommand();
        for (const element of elementsToRemove) {
            this.model.removeElement(element.id);
        }
        this.model.storeBatchCommand();
    }

    onPaperPointerUp(event: MouseEvent, cell: Element | Link | undefined, isClick: boolean) {
        if (this.options.disableDefaultHalo) { return; }
        // We don't want a Halo for links.
        if (cell instanceof Link) { return; }
        if (event.ctrlKey || event.shiftKey || event.metaKey) { return; }
        if (cell) {
            this.setSelection([cell]);
            cell.focus();
        } else if (isClick) {
            this.setSelection([]);
            this.hideNavigationMenu();
            if (document.activeElement) {
                (document.activeElement as HTMLElement).blur();
            }
        }
    }

    onIriClick(iri: string, element: Element, event: React.MouseEvent<any>) {
        event.persist();
        event.preventDefault();
        const {onIriClick} = this.options;
        if (onIriClick) {
            onIriClick(iri, element, event);
        }
    }

    private configureHalo() {
        if (this.options.disableDefaultHalo) { return; }

        const renderDefaultHalo = (selectedElement?: Element) => {
            const halo = createElement(Halo, {
                diagramView: this,
                target: selectedElement,
                onDelete: () => this.removeSelectedElements(),
                onExpand: () => {
                    selectedElement.setExpanded(!selectedElement.isExpanded);
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
            this.source.trigger('updateWidgets', {widgets: {halo}});
        };

        this.listener.listen(this.events, 'changeSelection', () => {
            const selected = this.selection.length === 1 ? this.selection[0] : undefined;
            if (this.connectionsMenuTarget && selected !== this.connectionsMenuTarget) {
                this.hideNavigationMenu();
            }
            renderDefaultHalo(selected);
        });

        renderDefaultHalo();
    }

    setCustomWidget(customWidget: {id: string, widget: ReactElement<any>}) {
        const widgets: any = {};
        widgets[customWidget.id] = customWidget.widget;
        this.source.trigger('updateWidgets', {widgets: widgets});
    }

    showNavigationMenu(target: Element) {
        const connectionsMenu = createElement(ConnectionsMenu, {
            view: this,
            target,
            onClose: () => this.hideNavigationMenu(),
            suggestProperties: this.options.suggestProperties,
        });
        this.connectionsMenuTarget = target;
        this.source.trigger('updateWidgets', {widgets: {connectionsMenu}});
    }

    hideNavigationMenu() {
        if (this.connectionsMenuTarget) {
            this.connectionsMenuTarget = undefined;
            this.source.trigger('updateWidgets', {widgets: {connectionsMenu: undefined}});
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
            const {element, size} = this.createElementAt(elementId, {x: x + totalXOffset, y, center});
            totalXOffset += size.width + 20;

            elementsToSelect.push(element);
            element.focus();
        }

        this.model.requestElementData(elementsToSelect);
        this.model.requestLinksOfType();
        this.setSelection(elementsToSelect);

        this.model.storeBatchCommand();
    }

    private createElementAt(
        elementId: string,
        position: { x: number; y: number; center?: boolean; }
    ): { element: Element, size: Size } {
        const element = this.model.createElement(elementId);

        let {x, y} = position;
        let {width, height} = boundsOf(element);
        if (width === 0) { width = 100; }
        if (height === 0) { height = 50; }

        if (position.center) {
            x -= width / 2;
            y -= height / 2;
        }
        element.setPosition({x, y});

        return {element, size: {width, height}};
    }

    public getLocalizedText(texts: ReadonlyArray<LocalizedString>): LocalizedString {
        return chooseLocalizedText(texts, this.getLanguage());
    }

    public getElementTypeString(elementModel: ElementModel): string {
        return elementModel.types.map((typeId: string) => {
            const type = this.model.getClassesById(typeId);
            return this.getElementTypeLabel(type).text;
        }).sort().join(', ');
    }

    public getElementTypeLabel(type: FatClassModel): LocalizedString {
        const label = this.getLocalizedText(type.label);
        return label ? label : { text: uri2name(type.id), lang: '' };
    }

    public getLinkLabel(linkTypeId: string): LocalizedString {
        const type = this.model.getLinkType(linkTypeId);
        const label = type ? this.getLocalizedText(type.label) : null;
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

    createLinkTemplate(linkType: FatLinkType): LinkTemplate {
        const existingTemplate = this.linkTemplates[linkType.id];
        if (existingTemplate) {
            return existingTemplate;
        }

        let template: LinkTemplate = {};
        for (const resolver of this.linkTemplateResolvers) {
            const result = resolver(linkType.id);
            if (result) {
                template = cloneDeep(result);
                break;
            }
        }

        fillLinkTemplateDefaults(template, this.model);
        this.linkTemplates[linkType.id] = template;
        this.source.trigger('changeLinkTemplates', {source: this});
        return template;
    }

    public registerLinkTemplateResolver(resolver: LinkTemplateResolver): LinkTemplateResolver {
        this.linkTemplateResolvers.unshift(resolver);
        return resolver;
    }

    public unregisterLinkTemplateResolver(resolver: LinkTemplateResolver): LinkTemplateResolver | undefined {
        const index = this.linkTemplateResolvers.indexOf(resolver);
        return index >= 0 ? this.linkTemplateResolvers.splice(index, 1)[0] : undefined;
    }

    dispose() {
        if (this.disposed) { return; }
        this.source.trigger('dispose', {source: this});
        this.listener.stopListening();
        this.disposed = true;
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
