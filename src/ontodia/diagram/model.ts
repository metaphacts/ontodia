import { each, size, values, keyBy, defaults } from 'lodash';

import {
    Dictionary, LocalizedString, LinkType, ClassModel, ElementModel, LinkModel,
} from '../data/model';
import { DataProvider } from '../data/provider';

import { DataFetchingThread } from '../viewUtils/async';
import { EventSource, Events, EventObserver, AnyEvent, AnyListener, Listener } from '../viewUtils/events';

import { LayoutData, LayoutElement, normalizeImportedCell, exportLayoutData } from './layoutData';
import {
    Element, ElementEvents, Link, LinkEvents, FatLinkType, FatLinkTypeEvents,
    FatClassModel, FatClassModelEvents, RichProperty,
} from './elements';
import { Vector } from './geometry';
import { Graph } from './graph';

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

    constructor() {
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

    sourceOf(link: Link) { return this.getElement(link.sourceId); }
    targetOf(link: Link) { return this.getElement(link.targetId); }
    isSourceAndTargetVisible(link: Link): boolean {
        return Boolean(this.sourceOf(link) && this.targetOf(link));
    }

    undo() { throw new Error('History is not implemented'); }
    redo() { throw new Error('History is not implemented'); }
    resetHistory() { /* TODO */ }
    initBatchCommand() { /* TODO */ }
    storeBatchCommand() { /* TODO */ }

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
            this.initLinkSettings(allLinkTypes, params.linkSettings);
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
    }

    private initLinkSettings(linkTypes: ReadonlyArray<FatLinkType>, linkSettings: LinkTypeOptions[]) {
        const indexedSettings = keyBy(linkSettings, 'id');
        for (const type of linkTypes) {
            const settings = indexedSettings[type.id];
            if (settings) {
                const {visible = true, showLabel = true} = settings;
                type.setVisibility({visible, showLabel, preventLoading: true});
            } else {
                type.setIsNew(true);
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

        const elementToRequestData: Element[] = [];
        const usedLinkTypes: { [typeId: string]: FatLinkType } = {};

        const normalizedCells = layoutData.cells.map(normalizeImportedCell);
        for (const cell of normalizedCells) {
            if (cell.type === 'element') {
                const {id, position, size, isExpanded} = cell;
                const template = preloadedElements[cell.id];
                const data = template || placeholderTemplateFromIri(id);
                const element = new Element({id, data, position, size, expanded: isExpanded});
                this.graph.addElement(element);
                if (!template) {
                    elementToRequestData.push(element);
                }
            }
        }

        for (const cell of normalizedCells) {
            if (cell.type === 'link') {
                const {id, typeId, source, target, vertices} = cell;
                const linkType = this.createLinkType(typeId);
                usedLinkTypes[linkType.id] = linkType;
                const link = this.graph.createLink({
                    data: {
                        linkTypeId: typeId,
                        sourceId: source.id,
                        targetId: target.id,
                    },
                    linkType,
                    vertices,
                });
                link.setLayoutOnly(markLinksAsLayoutOnly);
            }
        }

        this.subscribeGraph();
        this.requestElementData(elementToRequestData);

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

    requestElementData(elements: Element[]) {
        if (elements.length === 0) {
            return Promise.resolve([]);
        }
        return this.dataProvider.elementInfo({elementIds: elements.map(e => e.id)})
            .then(models => this.onElementInfoLoaded(models))
            .catch(err => {
                console.error(err);
                return Promise.reject(err);
            });
    }

    requestLinksOfType(linkTypeIds?: string[]) {
        const linkTypes = linkTypeIds || this.graph.getLinkTypes()
            .filter(type => type.visible)
            .map(type => type.id);
        return this.dataProvider.linksInfo({
            elementIds: this.elements.map(element => element.id),
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
                    const {id, label} = propertyModels[propertyId];
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
        return this.graph.getClasses();
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

    createElement(elementIdOrModel: string | ElementModel): Element {
        const elementId = typeof elementIdOrModel === 'string'
            ? elementIdOrModel : elementIdOrModel.id;
        let element = this.graph.getElement(elementId);
        if (!element) {
            const data = typeof elementIdOrModel === 'string'
                ? placeholderTemplateFromIri(elementId) : elementIdOrModel;
            element = new Element({id: elementId, data});
            this.graph.addElement(element);
        }
        return element;
    }

    removeElement(elementId: string) {
        this.graph.removeElement(elementId);
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
        for (const id of Object.keys(elements)) {
            const element = this.getElement(id);
            if (element) {
                element.setData(elements[id]);
            }
        }
    }

    private onLinkInfoLoaded(links: LinkModel[]) {
        this.initBatchCommand();
        for (const linkModel of links) {
            const linkType = this.createLinkType(linkModel.linkTypeId);
            this.graph.createLink({data: linkModel, linkType});
        }
        this.storeBatchCommand();
    }
}

export interface LinkTypeOptions {
    id: string;
    visible: boolean;
    showLabel?: boolean;
}

function placeholderTemplateFromIri(iri: string): ElementModel {
    return {
        id: iri,
        types: [],
        label: {values: [{lang: '', text: uri2name(iri)}]},
        properties: {},
    };
}

export function uri2name(uri: string): string {
    const hashIndex = uri.lastIndexOf('#');
    if (hashIndex !== -1 && hashIndex !== uri.length - 1) {
        return uri.substring(hashIndex + 1);
    }
    const lastPartStart = uri.lastIndexOf('/');
    if (lastPartStart !== -1 && lastPartStart !== uri.length - 1) {
        return uri.substring(lastPartStart + 1);
    }
    return uri;
}

export function chooseLocalizedText(texts: ReadonlyArray<LocalizedString>, language: string): LocalizedString {
    if (texts.length === 0) { return null; }
    // undefined if default language string isn't present
    let defaultLanguageValue: LocalizedString;
    for (const text of texts) {
        if (text.lang === language) {
            return text;
        } else if (text.lang === '') {
            defaultLanguageValue = text;
        }
    }
    return typeof defaultLanguageValue === 'undefined' ? texts[0] : defaultLanguageValue;
}
