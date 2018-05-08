import {
    Dictionary, LocalizedString, LinkType, ClassModel, ElementModel, LinkModel,
    ElementIri, ClassIri, LinkTypeIri, PropertyTypeIri,
} from '../data/model';
import { DataProvider } from '../data/provider';
import { generate64BitID, uri2name } from '../data/utils';

import { EventSource, Events, EventObserver, AnyEvent, AnyListener, Listener } from '../viewUtils/events';

import { DataFetcher } from './dataFetcher';
import {
    Element, ElementEvents, Link, LinkEvents, FatLinkType, FatLinkTypeEvents,
    FatClassModel, FatClassModelEvents, RichProperty,
} from './elements';
import { Vector } from './geometry';
import { Graph } from './graph';
import { CommandHistory, Command } from './history';
import { LayoutData, LayoutElement, normalizeImportedCell, exportLayoutData } from './layoutData';

export interface DiagramModelEvents {
    loadingStart: { source: DiagramModel };
    loadingSuccess: { source: DiagramModel };
    loadingError: {
        source: DiagramModel;
        error: any;
    };
    changeCells: { source: DiagramModel };
    elementEvent: AnyEvent<ElementEvents>;
    linkEvent: AnyEvent<LinkEvents>;
    linkTypeEvent: AnyEvent<FatLinkTypeEvents>;
    classEvent: AnyEvent<FatClassModelEvents>;
}

/**
 * Model of diagram.
 */
export class DiagramModel {
    private readonly source = new EventSource<DiagramModelEvents>();
    readonly events: Events<DiagramModelEvents> = this.source;

    private graph = new Graph();
    private graphListener = new EventObserver();
    private fetcher: DataFetcher;

    dataProvider: DataProvider;

    private classTree: FatClassModel[] = [];
    private linkSettings: { [linkTypeId: string]: LinkTypeOptions } = {};

    constructor(readonly history: CommandHistory) {}

    get elements() { return this.graph.getElements(); }
    get links() { return this.graph.getLinks(); }

    getElement(elementId: string): Element | undefined {
        return this.graph.getElement(elementId);
    }

    getLinkById(linkId: string): Link | undefined {
        return this.graph.getLink(linkId);
    }

    getLinkType(linkTypeId: LinkTypeIri): FatLinkType | undefined {
        return this.graph.getLinkType(linkTypeId);
    }

    linksOfType(linkTypeId: LinkTypeIri): ReadonlyArray<Link> {
        return this.graph.getLinks().filter(link => link.typeId === linkTypeId);
    }

    findLink(linkTypeId: LinkTypeIri, sourceId: string, targetId: string): Link | undefined {
        return this.graph.findLink(linkTypeId, sourceId, targetId);
    }

    sourceOf(link: Link) { return this.getElement(link.sourceId); }
    targetOf(link: Link) { return this.getElement(link.targetId); }
    isSourceAndTargetVisible(link: Link): boolean {
        return Boolean(this.sourceOf(link) && this.targetOf(link));
    }

    getClasses() {
        return this.classTree;
    }

    private resetGraph(dataProvider: DataProvider) {
        if (this.graphListener) {
            this.graphListener.stopListening();
            this.graphListener = new EventObserver();
        }
        this.graph = new Graph();
        this.dataProvider = dataProvider;
        this.fetcher = new DataFetcher(this.graph, this.dataProvider);
    }

    private subscribeGraph() {
        this.graphListener.listen(this.graph.events, 'changeCells', () => {
            this.source.trigger('changeCells', {source: this});
        });
        this.graphListener.listen(this.graph.events, 'elementEvent', e => {
            this.source.trigger('elementEvent', e);
        });
        this.graphListener.listen(this.graph.events, 'linkEvent', e => {
            this.source.trigger('linkEvent', e);
        });
        this.graphListener.listen(this.graph.events, 'linkTypeEvent', e => {
            if (e.key === 'changeVisibility') {
                this.onLinkTypeVisibilityChanged(e.data[e.key], e.key);
            }
            this.source.trigger('linkTypeEvent', e);
        });
        this.graphListener.listen(this.graph.events, 'classEvent', e => {
            this.source.trigger('classEvent', e);
        });

        this.source.trigger('changeCells', {source: this});
    }

    createNewDiagram(dataProvider: DataProvider): Promise<void> {
        this.resetGraph(dataProvider);
        this.source.trigger('loadingStart', {source: this});

        return Promise.all<any>([
            this.dataProvider.classTree(),
            this.dataProvider.linkTypes(),
        ]).then(([classTree, linkTypes]: [ClassModel[], LinkType[]]) => {
            this.setClassTree(classTree);
            const allLinkTypes = this.initLinkTypes(linkTypes);
            return this.loadAndRenderLayout({
                allLinkTypes,
                markLinksAsLayoutOnly: false,
            });
        }).catch(error => {
            console.error(error);
            this.source.trigger('loadingError', {source: this, error});
            return Promise.reject(error);
        });
    }

    private initLinkTypes(linkTypes: LinkType[]): FatLinkType[] {
        const types: FatLinkType[] = [];
        for (const {id, label} of linkTypes) {
            const linkType = new FatLinkType({id, label: label.values});
            this.graph.addLinkType(linkType);
            types.push(linkType);
        }
        return types;
    }

    importLayout(params: {
        dataProvider: DataProvider;
        preloadedElements?: Dictionary<ElementModel>;
        layoutData?: LayoutData;
        validateLinks?: boolean;
        linkSettings?: LinkTypeOptions[];
        hideUnusedLinkTypes?: boolean;
    }): Promise<void> {
        this.resetGraph(params.dataProvider);
        this.source.trigger('loadingStart', {source: this});

        return Promise.all<ClassModel[], LinkType[]>([
            this.dataProvider.classTree(),
            this.dataProvider.linkTypes(),
        ]).then(([classTree, linkTypes]) => {
            this.setClassTree(classTree);
            const allLinkTypes = this.initLinkTypes(linkTypes);
            this.setLinkSettings(params.linkSettings || []);
            return this.loadAndRenderLayout({
                layoutData: params.layoutData,
                preloadedElements: params.preloadedElements || {},
                markLinksAsLayoutOnly: params.validateLinks || false,
                allLinkTypes,
                hideUnusedLinkTypes: params.hideUnusedLinkTypes,
            }).then(() => {
                if (params.validateLinks) { this.requestLinksOfType(); }
            });
        }).catch(error => {
            console.error(error);
            this.source.trigger('loadingError', {source: this, error});
            return Promise.reject(error);
        });
    }

    exportLayout(): {
        layoutData: LayoutData;
        linkSettings: LinkTypeOptions[];
    } {
        const layoutData = exportLayoutData(this.graph.getElements(), this.graph.getLinks());
        const linkSettings = this.graph.getLinkTypes()
            .map(({id, visible, showLabel}) => ({id, visible, showLabel}));
        return {layoutData, linkSettings};
    }

    private setClassTree(rootClasses: ClassModel[]) {
        const addClass = (base: FatClassModel | undefined, classModel: ClassModel) => {
            const {id, label, count, children} = classModel;
            const richClass = new FatClassModel({id, label: label.values, count});
            richClass.setBase(base);
            this.graph.addClass(richClass);
            for (const child of children) {
                addClass(richClass, child);
            }
        };
        for (const root of rootClasses) {
            addClass(undefined, root);
        }

        this.classTree = this.graph.getClasses();
    }

    private setLinkSettings(settings: LinkTypeOptions[]) {
        for (const setting of settings) {
            const {visible = true, showLabel = true} = setting;
            const linkTypeId = setting.id as LinkTypeIri;
            this.linkSettings[linkTypeId] = {id: linkTypeId, visible, showLabel};
            const linkType = this.getLinkType(linkTypeId);
            if (linkType) {
                linkType.setVisibility({visible, showLabel});
            }
        }
    }

    private loadAndRenderLayout(params: {
        layoutData?: LayoutData;
        preloadedElements?: Dictionary<ElementModel>;
        markLinksAsLayoutOnly: boolean;
        allLinkTypes: ReadonlyArray<FatLinkType>;
        hideUnusedLinkTypes?: boolean;
    }) {
        const {
            layoutData = {cells: []},
            preloadedElements = {},
            markLinksAsLayoutOnly,
            hideUnusedLinkTypes,
        } = params;

        const elementIrisToRequestData: ElementIri[] = [];
        const usedLinkTypes: { [typeId: string]: FatLinkType } = {};

        const normalizedCells = layoutData.cells.map(normalizeImportedCell);
        for (const cell of normalizedCells) {
            if (cell.type === 'element') {
                const {id, iri, position, size, isExpanded, group} = cell;
                const template = preloadedElements[iri];
                const data = template || placeholderTemplateFromIri(iri);
                const element = new Element({id, data, position, size, expanded: isExpanded, group});
                this.graph.addElement(element);
                if (!template) {
                    elementIrisToRequestData.push(element.iri);
                }
            }
        }

        for (const cell of normalizedCells) {
            if (cell.type === 'link') {
                const {id, typeId, source, target, vertices} = cell;
                const linkType = this.createLinkType(typeId);
                usedLinkTypes[linkType.id] = linkType;
                const link = this.createLink({
                    linkType,
                    sourceId: source.id,
                    targetId: target.id,
                    vertices,
                });
                if (link) {
                    link.setLayoutOnly(markLinksAsLayoutOnly);
                }
            }
        }

        this.subscribeGraph();
        this.requestElementData(elementIrisToRequestData);

        if (hideUnusedLinkTypes && params.allLinkTypes) {
            this.hideUnusedLinkTypes(params.allLinkTypes, usedLinkTypes);
        }
        this.source.trigger('loadingSuccess', {source: this});
        return Promise.resolve();
    }

    private hideUnusedLinkTypes(
        allTypes: ReadonlyArray<FatLinkType>,
        usedTypes: { [typeId: string]: FatLinkType }
    ) {
        for (const linkType of allTypes) {
            if (!usedTypes[linkType.id]) {
                linkType.setVisibility({
                    visible: false,
                    showLabel: linkType.showLabel,
                });
            }
        }
    }

    requestElementData(elementIris: ReadonlyArray<ElementIri>): Promise<void> {
        return this.fetcher.fetchElementData(elementIris);
    }

    requestLinksOfType(linkTypeIds?: LinkTypeIri[]): Promise<void> {
        const linkTypes = linkTypeIds || this.graph.getLinkTypes()
            .filter(type => type.visible)
            .map(type => type.id);
        return this.dataProvider.linksInfo({
            elementIds: this.elements.map(element => element.iri),
            linkTypeIds: linkTypes,
        }).then(links => this.onLinkInfoLoaded(links));
    }

    getPropertyById(propertyId: PropertyTypeIri): RichProperty {
        const existing = this.graph.getProperty(propertyId);
        if (existing) {
            return existing;
        }
        const property = new RichProperty({id: propertyId});
        this.graph.addProperty(property);
        this.fetcher.fetchPropertyType(property);
        return property;
    }

    getClassesById(classId: ClassIri): FatClassModel {
        const existing = this.graph.getClass(classId);
        if (existing) {
            return existing;
        }
        const classModel = new FatClassModel({id: classId});
        this.graph.addClass(classModel);
        this.fetcher.fetchClass(classModel);
        return classModel;
    }

    createElement(elementIriOrModel: ElementIri | ElementModel, group?: string): Element {
        const elementIri = typeof elementIriOrModel === 'string'
            ? elementIriOrModel : (elementIriOrModel as ElementModel).id;

        const elements = this.elements.filter(el => el.iri === elementIri && el.group === group);
        if (elements.length > 0) {
            // usually there should be only one element
            return elements[0];
        }

        let data = typeof elementIriOrModel === 'string'
            ? placeholderTemplateFromIri(elementIri) : elementIriOrModel as ElementModel;
        data = {...data, id: data.id};
        const element = new Element({id: `element_${generate64BitID()}`, data, group});
        this.history.execute(
            addElement(this.graph, element, [])
        );

        return element;
    }

    removeElement(elementId: string) {
        const element = this.getElement(elementId);
        if (element) {
            this.history.execute(
                removeElement(this.graph, element)
            );
        }
    }

    createLinkType(linkTypeId: LinkTypeIri): FatLinkType {
        const existing = this.graph.getLinkType(linkTypeId);
        if (existing) {
            return existing;
        }
        const linkType = new FatLinkType({id: linkTypeId});

        const setting = this.linkSettings[linkType.id];
        if (setting) {
            const {visible, showLabel} = setting;
            linkType.setVisibility({visible, showLabel, preventLoading: true});
        }

        this.graph.addLinkType(linkType);
        this.fetcher.fetchLinkType(linkType);
        return linkType;
    }

    private onLinkTypeVisibilityChanged: Listener<FatLinkTypeEvents, 'changeVisibility'> = e => {
        if (e.source.visible) {
            if (!e.preventLoading) {
                this.requestLinksOfType([e.source.id]);
            }
        } else {
            for (const link of this.linksOfType(e.source.id)) {
                this.graph.removeLink(link.id);
            }
        }
    }

    private onLinkInfoLoaded(links: LinkModel[]) {
        for (const linkModel of links) {
            const linkType = this.createLinkType(linkModel.linkTypeId);
            this.createLinks(linkModel, linkType);
        }
    }

    private createLinks(data: LinkModel, linkType: FatLinkType) {
        const sources = this.elements.filter(el => el.iri === data.sourceId);
        const targets = this.elements.filter(el => el.iri === data.targetId);

        for (const source of sources) {
            for (const target of targets) {
                this.createLink({linkType, sourceId: source.id, targetId: target.id, data});
            }
        }
    }

    createLink(params: {
        linkType: FatLinkType;
        sourceId: string;
        targetId: string;
        data?: LinkModel;
        vertices?: ReadonlyArray<Vector>;
    }): Link {
        const {linkType, sourceId, targetId, data, vertices} = params;
        if (data && data.linkTypeId !== linkType.id) {
            throw new Error('linkTypeId must match linkType.id');
        }

        const existingLink = this.findLink(linkType.id, sourceId, targetId);
        if (existingLink) {
            existingLink.setLayoutOnly(false);
            existingLink.setData(data);
            return existingLink;
        }

        const shouldBeVisible = linkType.visible && this.getElement(sourceId) && this.getElement(targetId);
        if (!shouldBeVisible) {
            return undefined;
        }

        const link = new Link({
            id: `link_${generate64BitID()}`,
            typeId: linkType.id,
            sourceId,
            targetId,
            data,
            vertices,
        });
        this.graph.addLink(link);
        return link;
    }
}

export interface LinkTypeOptions {
    id: string; // LinkTypeIri
    visible: boolean;
    showLabel?: boolean;
}

function addElement(graph: Graph, element: Element, connectedLinks: ReadonlyArray<Link>): Command {
    return Command.create('Add element', () => {
        graph.addElement(element);
        for (const link of connectedLinks) {
            const existing = graph.getLink(link.id) || graph.findLink(link.typeId, link.sourceId, link.targetId);
            if (!existing) {
                graph.addLink(link);
            }
        }
        return removeElement(graph, element);
    });
}

function removeElement(graph: Graph, element: Element): Command {
    return Command.create('Remove element', () => {
        const connectedLinks = [...element.links];
        graph.removeElement(element.id);
        return addElement(graph, element, connectedLinks);
    });
}

export function restoreLinksBetweenElements(model: DiagramModel, elementIris: ReadonlyArray<ElementIri>): Command {
    return Command.effect('Restore links between elements', () => {
        model.requestElementData(elementIris);
        model.requestLinksOfType();
    });
}

function placeholderTemplateFromIri(iri: ElementIri): ElementModel {
    return {
        id: iri,
        types: [],
        label: {values: []},
        properties: {},
    };
}

export function chooseLocalizedText(
    texts: ReadonlyArray<LocalizedString>,
    language: string
): LocalizedString | undefined {
    if (texts.length === 0) { return undefined; }
    let defaultValue: LocalizedString;
    let englishValue: LocalizedString;
    for (const text of texts) {
        if (text.lang === language) {
            return text;
        } else if (text.lang === '') {
            defaultValue = text;
        } else if (text.lang === 'en') {
            englishValue = text;
        }
    }
    return (
        defaultValue !== undefined ? defaultValue :
        englishValue !== undefined ? englishValue :
        texts[0]
    );
}

export function formatLocalizedLabel(
    fallbackIri: string,
    labels: ReadonlyArray<LocalizedString>,
    language: string
): string {
    return labels.length > 0
        ? chooseLocalizedText(labels, language).text
        : uri2name(fallbackIri);
}
