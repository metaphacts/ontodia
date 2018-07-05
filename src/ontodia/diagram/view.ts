import { hcl } from 'd3-color';
import { defaultsDeep, cloneDeep } from 'lodash';
import { ReactElement, createElement } from 'react';

import {
    LinkRouter, TypeStyleResolver, LinkTemplateResolver, TemplateResolver,
    CustomTypeStyle, ElementTemplate, LinkTemplate, LinkMarkerStyle, RoutedLink, RoutedLinks,
} from '../customization/props';
import { DefaultTypeStyleBundle } from '../customization/defaultTypeStyles';
import { DefaultLinkTemplateBundle } from '../customization/defaultLinkStyles';
import { StandardTemplate, DefaultTemplateBundle } from '../customization/templates';

import { Dictionary, ElementModel, LocalizedString, ElementIri, ElementTypeIri, LinkTypeIri } from '../data/model';
import { isEncodedBlank } from '../data/sparql/blankNodes';
import { hashFnv32a, uri2name } from '../data/utils';

import { Events, EventSource, EventObserver, PropertyChange } from '../viewUtils/events';

import { Element, Link, FatLinkType, FatClassModel, linkMarkerKey } from './elements';
import { Vector, Size, boundsOf } from './geometry';
import { Batch, Command } from './history';
import { DiagramModel, chooseLocalizedText } from './model';

import { DefaultLinkRouter } from './linkRouter';

export interface ViewOptions {
    typeStyleResolvers?: TypeStyleResolver[];
    linkTemplateResolvers?: LinkTemplateResolver[];
    templatesResolvers?: TemplateResolver[];
    linkRouter?: LinkRouter;
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
    changeLinkTemplates: {};
    syncUpdate: { layer: RenderingLayer };
    updateWidgets: UpdateWidgetsEvent;
    dispose: {};
}

export interface UpdateWidgetsEvent {
    widgets: { [key: string]: WidgetDescription };
}

export interface WidgetDescription {
    element: ReactElement<any>;
    pinnedToScreen: boolean;
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

    private _language = 'en';

    private linkTemplates = new Map<LinkTypeIri, LinkTemplate>();

    private router: LinkRouter;
    private routings: RoutedLinks;

    constructor(
        public readonly model: DiagramModel,
        public readonly options: ViewOptions = {},
    ) {
        this.typeStyleResolvers = options.typeStyleResolvers
            ? options.typeStyleResolvers : DefaultTypeStyleBundle;

        this.linkTemplateResolvers = options.linkTemplateResolvers
            ? this.options.linkTemplateResolvers : DefaultLinkTemplateBundle;

        this.templatesResolvers = options.templatesResolvers
            ? options.templatesResolvers : DefaultTemplateBundle;

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
        this.routings = this.router.route(this.model);
    }

    getRouting(linkId: string): RoutedLink {
        return this.routings[linkId];
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

    onIriClick(iri: string, element: Element, event: React.MouseEvent<any>) {
        event.persist();
        event.preventDefault();
        const {onIriClick} = this.options;
        if (onIriClick) {
            onIriClick(iri, element, event);
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

    formatIri(iri: string): string {
        if (isEncodedBlank(iri)) {
            return '(blank node)';
        }
        return `<${iri}>`;
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

    public getElementTemplate(types: ElementTypeIri[]): ElementTemplate {
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

        fillLinkTemplateDefaults(template);
        this.linkTemplates.set(linkType.id, template);
        this.source.trigger('changeLinkTemplates', {});
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
        this.source.trigger('dispose', {});
        this.listener.stopListening();
        this.disposed = true;
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
