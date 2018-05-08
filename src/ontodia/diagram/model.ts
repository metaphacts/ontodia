import {
    Dictionary, LocalizedString, LinkType, ClassModel, ElementModel, LinkModel,
    ElementIri, ClassIri, LinkTypeIri, PropertyTypeIri,
} from '../data/model';
import { DataProvider } from '../data/provider';
import { generate128BitID } from '../data/utils';

import { DataFetchingThread } from '../viewUtils/async';
import { EventSource, Events, EventObserver, AnyEvent, AnyListener, Listener } from '../viewUtils/events';

import {
    LayoutData,
    LayoutElement,
    exportLayoutData,
    LayoutLink,
    emptyDiagram, convertToLatest, LinkTypeOptions, SerializedDiagram, newSerializedDiagram
} from './serializedDiagram';
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

    private classFetching: DataFetchingThread<ClassIri>;
    private linkFetching: DataFetchingThread<LinkTypeIri>;
    private propertyLabelFetching: DataFetchingThread<PropertyTypeIri>;

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
        validateLinks?: boolean;
        diagram?: any;
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
            const currentDiagram = params.diagram ? convertToLatest(params.diagram) : emptyDiagram();
            this.setLinkSettings(params.diagram && currentDiagram.linkTypeOptions || []);
            return this.loadAndRenderLayout({
                diagram: currentDiagram,
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

    exportLayout(): SerializedDiagram {
        const layoutData = exportLayoutData(this.graph.getElements(), this.graph.getLinks());
        const linkSettings = this.graph.getLinkTypes()
            .map(({id, visible, showLabel}) => ({property: id, visible, showLabel}));
        return newSerializedDiagram({layoutData, linkTypeOptions: linkSettings});
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
            const linkTypeId = setting.property as LinkTypeIri;
            this.linkSettings[linkTypeId] = {property: linkTypeId, visible, showLabel};
            const linkType = this.getLinkType(linkTypeId);
            if (linkType) {
                linkType.setVisibility({visible, showLabel});
            }
        }
    }

    private loadAndRenderLayout(params: {
        diagram?: SerializedDiagram;
        preloadedElements?: Dictionary<ElementModel>;
        markLinksAsLayoutOnly: boolean;
        allLinkTypes: ReadonlyArray<FatLinkType>;
        hideUnusedLinkTypes?: boolean;
    }) {
        const {
            diagram = emptyDiagram(),
            preloadedElements = {},
            markLinksAsLayoutOnly,
            hideUnusedLinkTypes,
        } = params;

        const elementIrisToRequestData: ElementIri[] = [];
        const usedLinkTypes: { [typeId: string]: FatLinkType } = {};

        for (const layoutElement of diagram.layoutData.elements) {
            const {'@id' : id, iri, position, size, isExpanded, group} = layoutElement;
            const template = preloadedElements[iri];
            const data = template || placeholderTemplateFromIri(iri);
            const element = new Element({id, data, position, size, expanded: isExpanded, group});
            this.graph.addElement(element);
            if (!template) {
                elementIrisToRequestData.push(element.iri);
            }
        }

        for (const layoutLink of diagram.layoutData.links) {
            const {'@id' : id, property, source, target, vertices} = layoutLink;
            const linkType = this.createLinkType(property);
            usedLinkTypes[linkType.id] = linkType;
            const link = this.createLink({
                linkType,
                sourceId: source['@id'],
                targetId: target['@id'],
                vertices,
            });
            if (link) {
                link.setLayoutOnly(markLinksAsLayoutOnly);
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

    requestLinksOfType(linkTypeIds?: LinkTypeIri[]): Promise<void> {
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

    getPropertyById(propertyId: PropertyTypeIri): RichProperty {
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

    getClassesById(classId: ClassIri): FatClassModel {
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
        const element = new Element({id: generateID(IDKind.element), data, group});
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
            id: generateID(IDKind.link),
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

export enum IDKind {element, link}

export function generateID(kind: IDKind): string {
    switch (kind) {
        case IDKind.element: return 'el_' + generate128BitID();
        case IDKind.link: return 'lnk_' + generate128BitID();
    }
}
