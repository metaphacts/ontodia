import { hcl } from 'd3-color';
import { defaultsDeep, cloneDeep } from 'lodash';
import { ReactElement, MouseEvent } from 'react';

import {
    LinkRouter, TypeStyleResolver, LinkTemplateResolver, TemplateResolver,
    CustomTypeStyle, ElementTemplate, LinkTemplate, RoutedLink, RoutedLinks,
} from '../customization/props';
import { DefaultTypeStyleBundle } from '../customization/defaultTypeStyles';
import { DefaultLinkTemplateBundle } from '../customization/defaultLinkStyles';
import { StandardTemplate, DefaultElementTemplateBundle } from '../customization/templates';

import { ElementModel, LocalizedString, ElementTypeIri, LinkTypeIri } from '../data/model';
import { isEncodedBlank } from '../data/sparql/blankNodes';
import { hashFnv32a, uri2name } from '../data/utils';

import { Events, EventSource, EventObserver, PropertyChange } from '../viewUtils/events';

import { Element, Link, FatLinkType, FatClassModel } from './elements';
import { Vector } from './geometry';
import { DefaultLinkRouter } from './linkRouter';
import { DiagramModel, chooseLocalizedText } from './model';

export enum IriClickIntent {
    JumpToEntity = 'jumpToEntity',
    OpenEntityIri = 'openEntityIri',
    OpenOtherIri = 'openOtherIri',
}
export interface IriClickEvent {
    iri: string;
    element: Element;
    clickIntent: IriClickIntent;
    originalEvent: MouseEvent<any>;
}
export type IriClickHandler = (event: IriClickEvent) => void;

export interface ViewOptions {
    typeStyleResolver?: TypeStyleResolver;
    linkTemplateResolver?: LinkTemplateResolver;
    elementTemplateResolver?: TemplateResolver;
    linkRouter?: LinkRouter;
    onIriClick?: IriClickHandler;
}

export interface TypeStyle {
    color: { h: number; c: number; l: number };
    icon?: string;
}

export enum RenderingLayer {
    Element = 1,
    ElementSize,
    PaperArea,
    Link,
    Editor,

    FirstToUpdate = Element,
    LastToUpdate = Editor,
}

export interface DiagramViewEvents {
    changeLanguage: PropertyChange<DiagramView, string>;
    changeLinkTemplates: {};
    syncUpdate: { layer: RenderingLayer };
    updateWidgets: UpdateWidgetsEvent;
    dispose: {};
    changeHighlight: PropertyChange<DiagramView, Highlighter>;
    updateRoutings: PropertyChange<DiagramView, RoutedLinks>;
}

export interface UpdateWidgetsEvent {
    widgets: { [key: string]: WidgetDescription };
}

export interface WidgetDescription {
    element: ReactElement<any>;
    pinnedToScreen: boolean;
}

export interface DropOnPaperEvent {
    dragEvent: DragEvent;
    paperPosition: Vector;
}

export type Highlighter = ((item: Element | Link) => boolean) | undefined;

export class DiagramView {
    private readonly listener = new EventObserver();
    private readonly source = new EventSource<DiagramViewEvents>();
    readonly events: Events<DiagramViewEvents> = this.source;

    private disposed = false;

    private readonly colorSeed = 0x0BADBEEF;

    private readonly resolveTypeStyle: TypeStyleResolver;
    private readonly resolveLinkTemplate: LinkTemplateResolver;
    private readonly resolveElementTemplate: TemplateResolver;

    private _language = 'en';

    private linkTemplates = new Map<LinkTypeIri, LinkTemplate>();
    private router: LinkRouter;
    private routings: RoutedLinks;
    private dropOnPaperHandler: ((e: DropOnPaperEvent) => void) | undefined;

    private _highlighter: Highlighter;

    constructor(
        public readonly model: DiagramModel,
        public readonly options: ViewOptions = {},
    ) {
        this.resolveTypeStyle = options.typeStyleResolver || DefaultTypeStyleBundle;
        this.resolveLinkTemplate = options.linkTemplateResolver || DefaultLinkTemplateBundle;
        this.resolveElementTemplate = options.elementTemplateResolver || DefaultElementTemplateBundle;

        this.initRouting();
    }

    private initRouting() {
        this.router = this.options.linkRouter || new DefaultLinkRouter();
        this.updateRoutings();

        this.listener.listen(this.model.events, 'changeCells', () =>  this.updateRoutings());
        this.listener.listen(this.model.events, 'linkEvent', ({key, data}) => {
            if (data.changeVertices) {
                this.updateRoutings();
            }
        });
        this.listener.listen(this.model.events, 'elementEvent', ({key, data}) => {
            if (data.changePosition || data.changeSize) {
                this.updateRoutings();
            }
        });
    }

    private updateRoutings() {
        const previous = this.routings;
        this.routings = this.router.route(this.model);
        this.source.trigger('updateRoutings', {source: this, previous});
    }

    getRoutings() {
        return this.routings;
    }

    getRouting(linkId: string): RoutedLink {
        return this.routings.get(linkId);
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

    performSyncUpdate() {
        for (let layer = RenderingLayer.FirstToUpdate; layer <= RenderingLayer.LastToUpdate; layer++) {
            this.source.trigger('syncUpdate', {layer});
        }
    }

    onIriClick(iri: string, element: Element, clickIntent: IriClickIntent, event: React.MouseEvent<any>) {
        event.persist();
        event.preventDefault();
        const {onIriClick} = this.options;
        if (onIriClick) {
            onIriClick({iri, element, clickIntent, originalEvent: event});
        }
    }

    setPaperWidget(widget: {
        key: string;
        widget: ReactElement<any> | undefined;
        pinnedToScreen?: boolean;
    }) {
        const {key, widget: element, pinnedToScreen} = widget;
        const widgets = {[widget.key]: element ? {element, pinnedToScreen} : undefined};
        this.source.trigger('updateWidgets', {widgets});
    }

    setHandlerForNextDropOnPaper(handler: (e: DropOnPaperEvent) => void) {
        this.dropOnPaperHandler = handler;
    }

    _tryHandleDropOnPaper(e: DropOnPaperEvent): boolean {
        const {dropOnPaperHandler} = this;
        if (dropOnPaperHandler) {
            this.dropOnPaperHandler = undefined;
            dropOnPaperHandler(e);
            return true;
        }
        return false;
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
            const type = this.model.createClass(typeId);
            return this.getElementTypeLabel(type).text;
        }).sort().join(', ');
    }

    public getElementTypeLabel(type: FatClassModel): LocalizedString {
        const label = this.getLocalizedText(type.label);
        return label ? label : { text: uri2name(type.id), lang: '' };
    }

    public getLinkLabel(linkTypeId: LinkTypeIri): LocalizedString {
        const type = this.model.createLinkType(linkTypeId);
        const label = type ? this.getLocalizedText(type.label) : null;
        return label ? label : { text: uri2name(linkTypeId), lang: '' };
    }

    public getTypeStyle(types: ElementTypeIri[]): TypeStyle {
        types.sort();

        const customStyle = this.resolveTypeStyle(types);

        const icon = customStyle ? customStyle.icon : undefined;
        let color: { h: number; c: number; l: number };
        if (customStyle && customStyle.color) {
            color = hcl(customStyle.color);
        } else {
            const hue = getHueFromClasses(types, this.colorSeed);
            color = {h: hue, c: 40, l: 75};
        }
        return {icon, color};
    }

    formatIri(iri: string): string {
        if (isEncodedBlank(iri)) {
            return '(blank node)';
        }
        return `<${iri}>`;
    }

    public getElementTemplate(types: ElementTypeIri[]): ElementTemplate {
        return this.resolveElementTemplate(types) || StandardTemplate;
    }

    createLinkTemplate(linkType: FatLinkType): LinkTemplate {
        const existingTemplate = this.linkTemplates.get(linkType.id);
        if (existingTemplate) {
            return existingTemplate;
        }

        let template: LinkTemplate = {};
        const result = this.resolveLinkTemplate(linkType.id);
        if (result) {
            template = cloneDeep(result);
        }

        fillLinkTemplateDefaults(template);
        this.linkTemplates.set(linkType.id, template);
        this.source.trigger('changeLinkTemplates', {});
        return template;
    }

    dispose() {
        if (this.disposed) { return; }
        this.source.trigger('dispose', {});
        this.listener.stopListening();
        this.disposed = true;
    }

    get highlighter() { return this._highlighter; }
    setHighlighter(value: Highlighter) {
        const previous = this._highlighter;
        if (previous === value) { return; }
        this._highlighter = value;
        this.source.trigger('changeHighlight', {source: this, previous});
    }
}

function getHueFromClasses(classes: ReadonlyArray<ElementTypeIri>, seed?: number): number {
    let hash = seed;
    for (const name of classes) {
        hash = hashFnv32a(name, hash);
    }
    const MAX_INT32 = 0x7fffffff;
    return 360 * ((hash === undefined ? 0 : hash) / MAX_INT32);
}

function fillLinkTemplateDefaults(template: LinkTemplate) {
    const defaults: Partial<LinkTemplate> = {
        markerTarget: {d: 'M0,0 L0,8 L9,4 z', width: 9, height: 8, fill: 'black'},
    };
    defaultsDeep(template, defaults);
    if (!template.renderLink) {
        template.renderLink = () => ({});
    }
}
