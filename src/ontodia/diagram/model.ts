import { each, size, values, keyBy, defaults } from 'lodash';

import {
    Dictionary, LocalizedString, LinkType, ClassModel, ElementModel, LinkModel,
} from '../data/model';
import { DataProvider } from '../data/provider';
import { generate64BitID } from '../data/utils';

import { DataFetchingThread } from '../viewUtils/async';
import { EventSource, Events, EventObserver, AnyEvent, AnyListener, Listener } from '../viewUtils/events';

import { LayoutData, LayoutElement, normalizeImportedCell, exportLayoutData } from './layoutData';
import {
    Element, ElementEvents, Link, LinkEvents, FatLinkType, FatLinkTypeEvents,
    FatClassModel, FatClassModelEvents, RichProperty,
} from './elements';
import { Vector } from './geometry';
import { Graph } from './graph';
import { CommandHistory, Command } from './history';

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

    dataProvider: DataProvider;

    private classFetching: DataFetchingThread;
    private linkFetching: DataFetchingThread;
    private propertyLabelFetching: DataFetchingThread;

    private linkSettings: { [linkTypeId: string]: LinkTypeOptions } = {};

    private classTree: FatClassModel[] = [];

    constructor(readonly history: CommandHistory) {
        this.classFetching = new DataFetchingThread();
        this.linkFetching = new DataFetchingThread();
        this.propertyLabelFetching = new DataFetchingThread();
    }

    get elements() { return this.graph.getElements(); }
    get links() { return this.graph.getLinks(); }

    getElement(elementId: string): Element | undefined {
        return this.graph.getElement(elementId);
    }

    getLinkById(linkId: string): Link | undefined {
        return this.graph.getLink(linkId);
    }

    getLinkType(linkTypeId: string): FatLinkType | undefined {
        return this.graph.getLinkType(linkTypeId);
    }

    linksOfType(linkTypeId: string): ReadonlyArray<Link> {
        return this.graph.getLinks().filter(link => link.typeId === linkTypeId);
    }

    findLink(link: LinkModel): Link | undefined {
        return this.graph.findLink(link);
    }

    sourceOf(link: Link) { return this.getElement(link.sourceId); }
    targetOf(link: Link) { return this.getElement(link.targetId); }
    isSourceAndTargetVisible(link: Link): boolean {
        return Boolean(this.sourceOf(link) && this.targetOf(link));
    }

    private resetGraph() {
        if (this.graphListener) {
            this.graphListener.stopListening();
            this.graphListener = new EventObserver();
        }
        this.graph = new Graph();
        this.classFetching.clear();
        this.linkFetching.clear();
        this.propertyLabelFetching.clear();
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
        this.resetGraph();
        this.dataProvider = dataProvider;
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
        this.resetGraph();
        this.dataProvider = params.dataProvider;
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
            const {id: linkTypeId, visible = true, showLabel = true} = setting;
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

        const elementIrisToRequestData: string[] = [];
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
                    data: {
                        linkTypeId: typeId,
                        sourceId: source.id,
                        targetId: target.id,
                    },
                    linkType,
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

    requestElementData(elementIris: ReadonlyArray<string>): Promise<void> {
        if (elementIris.length === 0) {
            return Promise.resolve();
        }
        return this.dataProvider.elementInfo({elementIds: [...elementIris]})
            .then(models => this.onElementInfoLoaded(models))
            .catch(err => {
                console.error(err);
                return Promise.reject(err);
            });
    }

    requestLinksOfType(linkTypeIds?: string[]): Promise<void> {
        const linkTypes = linkTypeIds || this.graph.getLinkTypes()
            .filter(type => type.visible)
            .map(type => type.id);
        return this.dataProvider.linksInfo({
            elementIds: this.elements.map(element => element.iri),
            linkTypeIds: linkTypes,
        }).then(links => this.onLinkInfoLoaded(links))
        .catch(err => {
            console.error(err);
            return Promise.reject(err);
        });
    }

    getPropertyById(propertyId: string): RichProperty {
        const existing = this.graph.getProperty(propertyId);
        if (existing) {
            return existing;
        }
        const property = new RichProperty({
            id: propertyId,
            label: [{lang: '', text: uri2name(propertyId)}],
        });
        this.graph.addProperty(property);
        this.propertyLabelFetching.push(propertyId).then(propertyIds => {
            if (!this.dataProvider.propertyInfo) { return; }
            if (propertyIds.length === 0) { return; }
            this.dataProvider.propertyInfo({propertyIds}).then(propertyModels => {
                for (const propId in propertyModels) {
                    if (!Object.hasOwnProperty.call(propertyModels, propertyId)) { continue; }
                    const {id, label} = propertyModels[propId];
                    const targetProperty = this.graph.getProperty(id);
                    if (targetProperty) {
                        targetProperty.setLabel(label.values);
                    }
                }
            });
        });
        return property;
    }

    getClasses() {
        return this.classTree;
    }

    getClassesById(classId: string): FatClassModel {
        const existing = this.graph.getClass(classId);
        if (existing) {
            return existing;
        }
        const classModel = new FatClassModel({
            id: classId,
            label: [{lang: '', text: uri2name(classId)}],
        });
        this.graph.addClass(classModel);

        this.classFetching.push(classId).then(classIds => {
            if (classIds.length === 0) { return; }
            this.dataProvider.classInfo({classIds}).then(classInfos => {
                for (const {id, label, count} of classInfos) {
                    const model = this.graph.getClass(id);
                    if (!model) { continue; }
                    model.setLabel(label.values);
                    if (typeof count === 'number') {
                        model.setCount(count);
                    }
                }
            });
        });
        return classModel;
    }

    createElement(elementIriOrModel: string | ElementModel, group?: string): Element {
        const elementIri = typeof elementIriOrModel === 'string'
                ? elementIriOrModel : elementIriOrModel.id;

        const elements = this.elements.filter(el => el.iri === elementIri && el.group === group);
        if (elements.length > 0) {
            // usually there should be only one element
            return elements[0];
        }

        let data = typeof elementIriOrModel === 'string'
            ? placeholderTemplateFromIri(elementIri) : elementIriOrModel;
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

    createLinkType(linkTypeId: string): FatLinkType {
        const existing = this.graph.getLinkType(linkTypeId);
        if (existing) {
            return existing;
        }
        const linkType = new FatLinkType({
            id: linkTypeId,
            label: [{text: uri2name(linkTypeId), lang: ''}],
        });

        const setting = this.linkSettings[linkType.id];
        if (setting) {
            const {visible, showLabel} = setting;
            linkType.setVisibility({visible, showLabel, preventLoading: true});
        }

        this.graph.addLinkType(linkType);
        this.linkFetching.push(linkTypeId).then(linkTypeIds => {
            if (linkTypeIds.length === 0) { return; }
            this.dataProvider.linkTypesInfo({linkTypeIds}).then(linkTypesInfo => {
                for (const {id, label} of linkTypesInfo) {
                    const model = this.graph.getLinkType(id);
                    if (!model) { continue; }
                    model.setLabel(label.values);
                }
            });
        });
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

    private onElementInfoLoaded(elements: Dictionary<ElementModel>) {
        for (const element of this.elements) {
            const loadedModel = elements[element.iri];
            if (loadedModel) {
                element.setData(loadedModel);
            }
        }
    }

    private onLinkInfoLoaded(links: LinkModel[]) {
        for (const linkModel of links) {
            const linkType = this.createLinkType(linkModel.linkTypeId);
            this.createLinks(linkModel, linkType);
        }
    }

    private createLinks(linkModel: LinkModel, linkType: FatLinkType) {
        const {sourceId, targetId} = linkModel;
        const sources = this.elements.filter(el => el.iri === sourceId);
        const targets = this.elements.filter(el => el.iri === targetId);

        for (const source of sources) {
            for (const target of targets) {
                const data = {...linkModel, sourceId: source.id, targetId: target.id};
                this.createLink({data, linkType});
            }
        }
    }

    private createLink(params: {
        data: LinkModel;
        linkType: FatLinkType;
        vertices?: ReadonlyArray<Vector>;
    }): Link {
        const {data, linkType, vertices} = params;
        if (data.linkTypeId !== linkType.id) {
            throw new Error('linkTypeId must match linkType.id');
        }

        const existingLink = this.findLink(data);
        if (existingLink) {
            existingLink.setLayoutOnly(false);
            return existingLink;
        }

        const shouldBeVisible = linkType.visible
            && this.getElement(data.sourceId)
            && this.getElement(data.targetId);

        if (!shouldBeVisible) {
            return undefined;
        }

        const link = new Link({id: `link_${generate64BitID()}`, data, vertices});
        this.graph.addLink(link);
        return link;
    }
}

export interface LinkTypeOptions {
    id: string;
    visible: boolean;
    showLabel?: boolean;
}

function addElement(graph: Graph, element: Element, connectedLinks: ReadonlyArray<Link>): Command {
    return Command.create('Add element', () => {
        graph.addElement(element);
        for (const link of connectedLinks) {
            if (graph.getLink(link.id)) { continue; }
            graph.addLink(link);
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

export function restoreLinksBetweenElements(model: DiagramModel, elementIris: ReadonlyArray<string>): Command {
    return Command.effect('Restore links between elements', () => {
        model.requestElementData(elementIris);
        model.requestLinksOfType();
    });
}

function placeholderTemplateFromIri(iri: string): ElementModel {
    return {
        id: iri,
        types: [],
        label: {values: []},
        properties: {},
    };
}

export function uri2name(uri: string): string {
    const hashIndex = uri.lastIndexOf('#');
    if (hashIndex !== -1 && hashIndex !== uri.length - 1) {
        return uri.substring(hashIndex + 1);
    }
    const endsWithSlash = uri[uri.length - 1] === '/';
    if (endsWithSlash) {
        uri = uri.substring(0, uri.length - 1);
    }

    const lastPartStart = uri.lastIndexOf('/');
    if (lastPartStart !== -1 && lastPartStart !== uri.length - 1) {
        return uri.substring(lastPartStart + 1);
    }
    return uri;
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
