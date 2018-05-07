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
import { StandardTemplate, DefaultTemplateBundle } from '../customization/templates';

import { Events, EventSource, EventObserver, PropertyChange } from '../viewUtils/events';
import { ConnectionsMenu, PropertySuggestionHandler } from '../widgets/connectionsMenu';
import { Halo } from '../widgets/halo';

import { Dictionary, ElementModel, LocalizedString, ElementIri, ClassIri, LinkTypeIri } from '../data/model';
import { hashFnv32a } from '../data/utils';

import { setElementExpanded } from './commands';
import { Element, Link, FatLinkType, FatClassModel, linkMarkerKey } from './elements';
import { Vector, Size, boundsOf } from './geometry';
import { Batch, Command } from './history';
import { DiagramModel, restoreLinksBetweenElements, chooseLocalizedText, uri2name } from './model';
import { PaperArea, PointerUpEvent } from './paperArea';

export interface DiagramViewOptions {
    typeStyleResolvers?: TypeStyleResolver[];
    linkTemplateResolvers?: LinkTemplateResolver[];
    templatesResolvers?: TemplateResolver[];
    disableDefaultHalo?: boolean;
    linkRouter?: LinkRouter;
    suggestProperties?: PropertySuggestionHandler;
    onIriClick?: (iri: string, element: Element, event: React.MouseEvent<any>) => void;
    groupBy?: GroupBy[];
}

export interface GroupBy {
    linkType: string;
    linkDirection: 'in' | 'out';
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
    toggleNavigationMenu: { isOpened: boolean };
    syncUpdate: { layer: RenderingLayer };
    updateWidgets: UpdateWidgetsEvent;
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
    private linkTemplates = new Map<LinkTypeIri, LinkTemplate>();

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

    getLinkTemplates(): ReadonlyMap<LinkTypeIri, LinkTemplate> {
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

    _initializePaperComponents(paperArea: PaperArea) {
        this.listener.listen(paperArea.events, 'pointerUp', e => this.onPaperPointerUp(e));
        this.listener.listen(this.model.events, 'changeCells', () => this.onCellsChanged());

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

    removeSelectedElements() {
        const elementsToRemove = this.selection;
        if (elementsToRemove.length === 0) { return; }

        this.cancelSelection();

        const batch = this.model.history.startBatch();
        for (const element of elementsToRemove) {
            this.model.removeElement(element.id);
        }
        batch.store();
    }

    private onPaperPointerUp(event: PointerUpEvent) {
        if (this.options.disableDefaultHalo) { return; }
        const {sourceEvent, target, triggerAsClick} = event;

        if (sourceEvent.ctrlKey || sourceEvent.shiftKey || sourceEvent.metaKey) { return; }

        if (target instanceof Element) {
            this.setSelection([target]);
            target.focus();
        } else if (!target && triggerAsClick) {
            this.setSelection([]);
            this.hideNavigationMenu();
            if (document.activeElement) {
                (document.activeElement as HTMLElement).blur();
            }
        }
    }

    private onCellsChanged() {
        if (this.selection.length === 0) { return; }
        const newSelection = this.selection.filter(el => this.model.getElement(el.id));
        if (newSelection.length < this.selection.length) {
            this.setSelection(newSelection);
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

        const renderDefaultHalo = () => {
            const selectedElement = this.selection.length === 1 ? this.selection[0] : undefined;
            const halo = createElement(Halo, {
                diagramView: this,
                target: selectedElement,
                onDelete: () => this.removeSelectedElements(),
                onExpand: () => {
                    this.model.history.execute(
                        setElementExpanded(selectedElement, !selectedElement.isExpanded)
                    );
                },
                navigationMenuOpened: Boolean(this.connectionsMenuTarget),
                onToggleNavigationMenu: () => {
                    if (this.connectionsMenuTarget) {
                        this.hideNavigationMenu();
                    } else {
                        this.showNavigationMenu(selectedElement);
                    }
                    renderDefaultHalo();
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
            renderDefaultHalo();
        });

        this.listener.listen(this.events, 'toggleNavigationMenu', ({isOpened}) => {
            renderDefaultHalo();
        });

        renderDefaultHalo();
    }

    setPaperWidget(widget: { key: string; widget: ReactElement<any>; }) {
        const widgets = {[widget.key]: widget.widget};
        this.source.trigger('updateWidgets', {widgets});
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
        this.source.trigger('toggleNavigationMenu', {isOpened: false});
    }

    hideNavigationMenu() {
        if (this.connectionsMenuTarget) {
            this.connectionsMenuTarget = undefined;
            this.source.trigger('updateWidgets', {widgets: {connectionsMenu: undefined}});
            this.source.trigger('toggleNavigationMenu', {isOpened: false});
        }
    }

    onDragDrop(e: DragEvent, paperPosition: Vector) {
        e.preventDefault();
        let elementIris: ElementIri[];
        try {
            elementIris = JSON.parse(e.dataTransfer.getData('application/x-ontodia-elements'));
        } catch (ex) {
            try {
                elementIris = JSON.parse(e.dataTransfer.getData('text')); // IE fix
            } catch (ex) {
                const draggedUri = e.dataTransfer.getData('text/uri-list');
                // element dragged from the class tree has URI of the form:
                // <window.location without hash>#<class URI>
                const uriFromTreePrefix = window.location.href.split('#')[0] + '#';
                const uri = draggedUri.indexOf(uriFromTreePrefix) === 0
                    ? draggedUri.substring(uriFromTreePrefix.length) : draggedUri;
                elementIris = [uri as ElementIri];
            }
        }
        if (!elementIris || elementIris.length === 0) { return; }

        const batch = this.model.history.startBatch('Drag and drop onto diagram');
        const placedElements = placeElements(this.model, elementIris, paperPosition);
        batch.history.execute(
            restoreLinksBetweenElements(this.model, elementIris)
        );
        batch.store();

        if (placedElements.length > 0) {
            placedElements[placedElements.length - 1].focus();
        }

        this.setSelection(placedElements);
    }

    /**
     * Obsolete. Use `chooseLocalizedText()` or `formatLocalizedLabel()` instead.
     * @deprecated
     */
    public getLocalizedText(texts: ReadonlyArray<LocalizedString>): LocalizedString | undefined {
        return chooseLocalizedText(texts, this.getLanguage());
    }

    public getElementTypeString(elementModel: ElementModel): string {
        return elementModel.types.map(typeId => {
            const type = this.model.getClassesById(typeId);
            return this.getElementTypeLabel(type).text;
        }).sort().join(', ');
    }

    public getElementTypeLabel(type: FatClassModel): LocalizedString {
        const label = this.getLocalizedText(type.label);
        return label ? label : { text: uri2name(type.id), lang: '' };
    }

    public getLinkLabel(linkTypeId: LinkTypeIri): LocalizedString {
        const type = this.model.getLinkType(linkTypeId);
        const label = type ? this.getLocalizedText(type.label) : null;
        return label ? label : { text: uri2name(linkTypeId), lang: '' };
    }

    public getTypeStyle(types: ClassIri[]): TypeStyle {
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

    public getElementTemplate(types: ClassIri[]): ElementTemplate {
        for (const resolver of this.templatesResolvers) {
            const result = resolver(types);
            if (result) {
                return result;
            }
        }
        return StandardTemplate;
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
        const existingTemplate = this.linkTemplates.get(linkType.id);
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
        this.linkTemplates.set(linkType.id, template);
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

    loadEmbeddedElements = (elementIri: ElementIri): Promise<Dictionary<ElementModel>> => {
        const elements = this.options.groupBy.map(groupBy =>
            this.model.dataProvider.linkElements({
                elementId: elementIri,
                linkId: groupBy.linkType as LinkTypeIri,
                offset: 0,
                direction: groupBy.linkDirection,
            })
        );
        return Promise.all(elements).then(res =>
            res.reduce((memo, current) => Object.assign(memo, current), {})
        );
    }
}

function getHueFromClasses(classes: ReadonlyArray<ClassIri>, seed?: number): number {
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

function placeElements(
    model: DiagramModel, elementIris: ReadonlyArray<ElementIri>, position: Vector
): Element[] {
    const elements: Element[] = [];
    let totalXOffset = 0;
    let {x, y} = position;
    for (const elementIri of elementIris) {
        const center = elementIris.length === 1;
        const {element, size} = createElementAt(
            model, elementIri, {x: x + totalXOffset, y, center}
        );
        elements.push(element);
        totalXOffset += size.width + 20;
    }
    return elements;
}

function createElementAt(
    model: DiagramModel,
    elementIri: ElementIri,
    position: { x: number; y: number; center?: boolean; },
) {
    const element = model.createElement(elementIri);

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

export default DiagramView;
