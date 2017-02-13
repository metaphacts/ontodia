import * as Backbone from 'backbone';
import { each, size, values, keyBy, defaults, uniqueId } from 'lodash';
import * as joint from 'jointjs';

import {
    Dictionary, LocalizedString, LinkType, ClassModel, ElementModel, LinkModel,
} from '../data/model';
import { DataProvider } from '../data/provider';

import { LayoutData, LayoutElement, normalizeImportedCell, cleanExportedLayout } from './layoutData';
import { Element, Link, FatLinkType, FatClassModel, RichProperty } from './elements';
import { DataFetchingThread } from './dataFetchingThread';

export type IgnoreCommandHistory = { ignoreCommandManager?: boolean };
export type PreventLinksLoading = { preventLoading?: boolean; };

type ChangeVisibilityOptions = { isFromHandler?: boolean };

/**
 * Model of diagram.
 *
 * Properties:
 *     isViewOnly: boolean
 *
 * Events:
 *     state:beginLoad
 *     state:endLoad (diagramElementCount?: number)
 *     state:loadError (error: any)
 *     state:renderStart
 *     state:renderDone
 *     state:dataLoaded
 *
 *     history:undo
 *     history:redo
 *     history:reset
 *     history:initBatchCommand
 *     history:storeBatchCommand
 */
export class DiagramModel extends Backbone.Model {
    graph = new joint.dia.Graph();

    dataProvider: DataProvider;

    classTree: ClassTreeElement[];
    private classesById: Dictionary<FatClassModel> = {};
    private propertyLabelById: Dictionary<RichProperty> = {};

    private nextLinkTypeIndex = 0;
    private linkTypes: Dictionary<FatLinkType>;

    private linksByType: Dictionary<Link[]> = {};

    private classFetchingThread: DataFetchingThread;
    private linkFetchingThread: DataFetchingThread;
    private propertyLabelFetchingThread: DataFetchingThread;

    constructor(isViewOnly = false) {
        super();
        this.set('isViewOnly', isViewOnly);
        this.initializeExternalAddRemoveSupport();
        this.classFetchingThread = new DataFetchingThread();
        this.linkFetchingThread = new DataFetchingThread();
        this.propertyLabelFetchingThread = new DataFetchingThread();
    }

    isViewOnly(): boolean { return this.get('isViewOnly'); }

    get cells(): Backbone.Collection<joint.dia.Cell> { return this.graph.get('cells'); }
    get elements() { return this.graph.getElements() as Element[]; }
    get links() { return this.graph.getLinks() as Link[]; }

    getElement(elementId: string): Element | undefined {
        const cell = this.cells.get(elementId);
        return cell instanceof Element ? cell : undefined;
    }

    getLinkType(linkTypeId: string): FatLinkType | undefined {
        return this.linkTypes[linkTypeId];
    }

    linksOfType(linkTypeId: string): ReadonlyArray<Link> { return this.linksByType[linkTypeId] || []; }

    sourceOf(link: Link) { return this.getElement(link.get('source').id); }
    targetOf(link: Link) { return this.getElement(link.get('target').id); }
    isSourceAndTargetVisible(link: Link): boolean {
        return Boolean(this.sourceOf(link) && this.targetOf(link));
    }

    undo() { this.trigger('history:undo'); }
    redo() { this.trigger('history:redo'); }
    resetHistory() { this.trigger('history:reset'); }
    initBatchCommand() { this.trigger('history:initBatchCommand'); }
    storeBatchCommand() { this.trigger('history:storeBatchCommand'); }

    private initializeExternalAddRemoveSupport() {
        // override graph.addCell to support CommandManager's undo/redo
        const superAddCell = this.graph.addCell;
        this.graph['addCell'] = (cell: any, options: any) => {
            if (cell instanceof Element || cell instanceof Link) {
                superAddCell.call(this.graph, cell, options);
            } else if (cell.type === 'link') {
                this.createLink({
                    sourceId: cell.source.id,
                    targetId: cell.target.id,
                    linkTypeId: cell.typeId,
                    suggestedId: cell.id,
                    vertices: cell.vertices,
                });
            } else if (cell.type === 'element') {
                const {id, position, angle, isExpanded} = cell as LayoutElement;
                const element = new Element({id, position, angle, isExpanded});
                element.template = placeholderTemplateFromIri(cell.id);
                superAddCell.call(this.graph, element, options);
                this.requestElementData([element]);
                this.requestLinksOfType();
            } else {
                superAddCell.call(this.graph, cell, options);
            }
        };
        // listen to external add/remove calls to graph (Halo's remove for example)
        this.listenTo(this.graph, 'add', (cell: joint.dia.Cell) => {
            if (cell instanceof Link) {
                const linkType = this.getLinkType(cell.get('typeId'));
                linkType.set('visible', true);
            }
        });
        this.listenTo(this.graph, 'remove', (cell: joint.dia.Cell) => {
            if (cell instanceof Link) {
                const {typeId, sourceId, targetId} = cell;
                this.removeLinkReferences({linkTypeId: typeId, sourceId, targetId});
            }
        });
    }

    createNewDiagram(dataProvider: DataProvider): Promise<void> {
        this.dataProvider = dataProvider;
        this.trigger('state:beginLoad');

        return Promise.all<any>([
            this.dataProvider.classTree(),
            this.dataProvider.linkTypes(),
        ]).then(([classTree, linkTypes]: [ClassModel[], LinkType[]]) => {
            this.setClassTree(classTree);
            this.initLinkTypes(linkTypes);
            this.trigger('state:endLoad', 0);
            this.initLinkSettings();
            return this.initDiagram({preloadedElements: {}, markLinksAsLayoutOnly: false});
        }).catch(err => {
            console.error(err);
            this.trigger('state:endLoad', null, err.errorKind, err.message);
        });
    }

    private initLinkTypes(linkTypes: LinkType[]) {
        this.linkTypes = {};
        each(linkTypes, ({id, label}: LinkType) => {
            const linkType = new FatLinkType({id, label, diagram: this, index: this.nextLinkTypeIndex++});
            this.linkTypes[linkType.id] = linkType;
        });
    }

    importLayout(params: {
        dataProvider: DataProvider;
        preloadedElements?: Dictionary<ElementModel>;
        layoutData?: LayoutData;
        validateLinks?: boolean;
        linkSettings?: LinkTypeOptions[];
        hideUnusedLinkTypes?: boolean;
    }): Promise<void> {
        this.dataProvider = params.dataProvider;
        this.trigger('state:beginLoad');

        return Promise.all<ClassModel[], LinkType[]>([
            this.dataProvider.classTree(),
            this.dataProvider.linkTypes(),
        ]).then(([classTree, linkTypes]) => {
            this.setClassTree(classTree);
            this.initLinkTypes(linkTypes);
            this.trigger('state:endLoad', size(params.preloadedElements));
            this.initLinkSettings(params.linkSettings);
            return this.initDiagram({
                layoutData: params.layoutData,
                preloadedElements: params.preloadedElements || {},
                markLinksAsLayoutOnly: params.validateLinks || false,
                hideUnusedLinkTypes: params.hideUnusedLinkTypes,
            }).then(() => {
                if (params.validateLinks) { this.requestLinksOfType(); }
            });
        }).catch(err => {
            console.error(err);
            this.trigger('state:endLoad', null, err.errorKind, err.message);
        });
    }

    exportLayout(): {
        layoutData: LayoutData;
        linkSettings: LinkTypeOptions[];
    } {
        const layoutData = cleanExportedLayout(this.graph.toJSON());
        const linkSettings = values(this.linkTypes).map((type: FatLinkType) => ({
            id: type.id,
            visible: type.get('visible'),
            showLabel: type.get('showLabel'),
        }));
        return {layoutData, linkSettings};
    }

    private setClassTree(rootClasses: ClassModel[]) {
        this.classTree = rootClasses;
        const addClass = (cl: ClassTreeElement) => {
            this.classesById[cl.id] = new FatClassModel(cl);
            each(cl.children, addClass);
        };
        each(rootClasses, addClass);
    }

    private initDiagram(params: {
        layoutData?: LayoutData;
        preloadedElements: Dictionary<ElementModel>;
        markLinksAsLayoutOnly: boolean;
        hideUnusedLinkTypes?: boolean;
    }): Promise<void> {
        const {layoutData, preloadedElements, markLinksAsLayoutOnly, hideUnusedLinkTypes} = params;
        return new Promise<void>((resolve, reject) => {
            this.graph.trigger('batch:start', {batchName: 'to-back'});

            this.listenToOnce(this, 'state:renderDone', () => {
                if (hideUnusedLinkTypes) {
                    this.hideUnusedLinkTypes();
                }
                this.graph.trigger('batch:stop', {batchName: 'to-back'});

                resolve();
                // notify when graph model is fully initialized
                this.trigger('state:dataLoaded');
            });

            this.initLayout(layoutData || {cells: []}, preloadedElements, markLinksAsLayoutOnly);
        });
    }

    private initLinkSettings(linkSettings?: LinkTypeOptions[]) {
        if (linkSettings) {
            const existingDefaults = { visible: false, showLabel: true };
            const indexedSettings = keyBy(linkSettings, 'id');
            each(this.linkTypes, (type, typeId) => {
                const settings = indexedSettings[typeId] || {isNew: true};
                const options: PreventLinksLoading = {preventLoading: true};
                type.set(defaults(settings, existingDefaults), options);
            });
        } else {
            const newDefaults = { visible: true, showLabel: true };
            const options: PreventLinksLoading = {preventLoading: true};
            each(this.linkTypes, type => type.set(newDefaults, options));
        }
    }

    private initLayout(
        layoutData: LayoutData,
        preloadedElements: Dictionary<ElementModel>,
        markLinksAsLayoutOnly: boolean,
    ) {
        this.linksByType = {};

        const cellModels: joint.dia.Cell[] = [];
        const elementToRequestData: Element[] = [];

        for (const layoutCell of layoutData.cells) {
            let cell = normalizeImportedCell(layoutCell);
            if (cell.type === 'element') {
                // set size to zero to always recompute it on the first render
                const element = new Element({...cell, size: {width: 0, height: 0}});
                const template = preloadedElements[cell.id];
                if (!template) {
                    elementToRequestData.push(element);
                }
                element.template = template || placeholderTemplateFromIri(cell.id);
                cellModels.push(element);
            } else if (cell.type === 'link') {
                const link = new Link(cell);
                link.layoutOnly = markLinksAsLayoutOnly;
                link.typeIndex = this.createLinkType(link.typeId).index;
                cellModels.push(link);
            }
        }

        this.requestElementData(elementToRequestData);
        this.trigger('state:renderStart');
        this.graph.resetCells(cellModels);

        for (const link of this.links) {
            this.registerLink(link);
        }
    }

    private hideUnusedLinkTypes() {
        const unusedLinkTypes = {...this.linkTypes};
        for (const link of this.links) {
            delete unusedLinkTypes[link.typeId];
        }
        for (const typeId in unusedLinkTypes) {
            if (!unusedLinkTypes.hasOwnProperty(typeId)) { continue; }
            const unusedLinkType = unusedLinkTypes[typeId];
            unusedLinkType.set('visible', false);
        }
    }

    createElement(idOrModel: string | ElementModel): Element {
        const id = typeof idOrModel === 'string' ? idOrModel : idOrModel.id;
        const existing = this.getElement(id);
        if (existing) { return existing; }

        const model = typeof idOrModel === 'string'
            ? placeholderTemplateFromIri(idOrModel) : idOrModel;

        const element = new Element({id: model.id});
        element.template = model;

        this.graph.addCell(element);
        return element;
    }

    requestElementData(elements: Element[]) {
        return this.dataProvider.elementInfo({elementIds: elements.map(e => e.id)})
            .then(models => this.onElementInfoLoaded(models))
            .catch(err => {
                console.error(err);
                return Promise.reject(err);
            });
    }

    requestLinksOfType(linkTypeIds?: string[]) {
        let linkTypes = linkTypeIds;
        if (!linkTypes) {
            linkTypeIds = values(this.linkTypes).map(type => type.id);
        }
        return this.dataProvider.linksInfo({
            elementIds: this.graph.getElements().map(element => element.id),
            linkTypeIds: linkTypeIds,
        }).then(links => this.onLinkInfoLoaded(links))
        .catch(err => {
            console.error(err);
            return Promise.reject(err);
        });
    }

    getPropertyById(labelId: string): RichProperty {
        if (!this.propertyLabelById[labelId]) {
            this.propertyLabelById[labelId] = new RichProperty({
                id: labelId,
                label: {values: [{lang: '', text: uri2name(labelId)}]},
            });
            this.propertyLabelFetchingThread.startFetchingThread(labelId).then(propertyIds => {
                if (!this.dataProvider.propertyInfo) { return; }
                if (propertyIds.length === 0) { return; }
                this.dataProvider.propertyInfo({propertyIds}).then(propertyModels => {
                    for (const propertyId in propertyModels) {
                        if (!Object.hasOwnProperty.call(propertyModels, propertyId)) { continue; }
                        const propertyModel = propertyModels[propertyId];
                        if (!this.propertyLabelById[propertyModel.id]) { continue; }
                        this.propertyLabelById[propertyModel.id].set('label', propertyModel.label);
                    }
                });
            });
        }
        return this.propertyLabelById[labelId];
    }

    getClassesById(typeId: string): FatClassModel {
        if (!this.classesById[typeId]) {
            this.classesById[typeId] = new FatClassModel({
                id: typeId,
                label: { values: [{lang: '', text: uri2name(typeId)}] },
                count: 0,
                children: [],
            });
            this.classFetchingThread.startFetchingThread(typeId).then(typeIds => {
                if (typeIds.length > 0) {
                    this.dataProvider.classInfo({classIds: typeIds}).then(classes => {
                        for (const cl of classes) {
                            if (!this.classesById[cl.id]) { continue; }
                            this.classesById[cl.id].set('label', cl.label);
                            this.classesById[cl.id].set('count', cl.count);
                        }
                    });
                }
            });
        }
        return this.classesById[typeId];
    }

    createLinkType(linkTypeId: string): FatLinkType {
        if (this.linkTypes.hasOwnProperty(linkTypeId)) {
            return this.linkTypes[linkTypeId];
        }

        const defaultLabel = {values: [{text: uri2name(linkTypeId), lang: ''}]};
        const fatLinkType = new FatLinkType({
            id: linkTypeId,
            index: this.nextLinkTypeIndex++,
            label: defaultLabel,
            diagram: this,
        });

        this.linkFetchingThread.startFetchingThread(linkTypeId).then(linkTypeIds => {
            if (linkTypeIds.length > 0) {
                this.dataProvider.linkTypesInfo({linkTypeIds}).then(linkTypesInfo => {
                    for (const lt of linkTypesInfo) {
                        if (!this.linkTypes[lt.id]) { continue; }
                        this.linkTypes[lt.id].label = lt.label;
                    }
                });
            }
        });

        this.linkTypes[linkTypeId] = fatLinkType;
        return fatLinkType;
    }

    private onElementInfoLoaded(elements: Dictionary<ElementModel>) {
        for (const id of Object.keys(elements)) {
            const element = this.getElement(id);
            if (element) {
                element.template = elements[id];
                element.trigger('state:loaded');
            }
        }
    }

    private onLinkInfoLoaded(links: LinkModel[]) {
        this.initBatchCommand();
        for (const linkModel of links) {
            this.createLink(linkModel);
        }
        this.storeBatchCommand();
    }

    createLink(linkModel: LinkModel & {
        suggestedId?: string;
        vertices?: Array<{ x: number; y: number; }>;
    }, options?: IgnoreCommandHistory): Link | undefined {
        const existingLink = this.getLink(linkModel);
        if (existingLink) {
          if (existingLink.layoutOnly) {
            existingLink.set('layoutOnly', false, {ignoreCommandManager: true} as IgnoreCommandHistory);
          }
          return existingLink;
        }

        const {linkTypeId, sourceId, targetId, suggestedId, vertices} = linkModel;
        const suggestedIdAvailable = Boolean(suggestedId && !this.cells.get(suggestedId));

        const link = new Link({
            id: suggestedIdAvailable ? suggestedId : `link_${generateRandomID()}`,
            typeId: linkTypeId,
            source: {id: sourceId},
            target: {id: targetId},
            vertices,
        });

        if (this.isSourceAndTargetVisible(link) && this.createLinkType(link.typeId).visible) {
            this.registerLink(link);
            this.graph.addCell(link, options);
            return link;
        }
        return undefined;
    }

    private registerLink(link: Link) {
        const typeId = link.typeId;
        if (!this.linksByType.hasOwnProperty(typeId)) {
            this.linksByType[typeId] = [];
        }
        this.linksByType[typeId].push(link);

        if (link.typeIndex === undefined) {
            link.typeIndex = this.createLinkType(typeId).index;
        }

        this.sourceOf(link).links.push(link);
        this.targetOf(link).links.push(link);
    }

    getLink(linkModel: LinkModel): Link | undefined {
        const source = this.getElement(linkModel.sourceId);
        if (!source) { return undefined; }
        const index = findLinkIndex(source.links, linkModel);
        return index >= 0 && source.links[index];
    }

    private removeLinkReferences(linkModel: LinkModel) {
        const source = this.getElement(linkModel.sourceId);
        removeLinkFrom(source && source.links, linkModel);

        const target = this.getElement(linkModel.targetId);
        removeLinkFrom(target && target.links, linkModel);

        const linksOfType = this.linksByType[linkModel.linkTypeId];
        removeLinkFrom(linksOfType, linkModel);
    }
}

export default DiagramModel;

export interface ClassTreeElement {
    id: string;
    label: { values: LocalizedString[] };
    count: number;
    children: ClassTreeElement[];
    a_attr?: { href: string };
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

function removeLinkFrom(links: Link[], model: LinkModel) {
    if (!links) { return; }
    const index = findLinkIndex(links, model);
    links.splice(index, 1);
}

function findLinkIndex(haystack: Link[], needle: LinkModel) {
    const {sourceId, targetId, linkTypeId} = needle;
    for (let i = 0; i < haystack.length; i++) {
        const link = haystack[i];
        if (link.sourceId === sourceId &&
            link.targetId === targetId &&
            link.typeId === linkTypeId
        ) {
            return i;
        }
    }
    return -1;
}

/** Generates random 16-digit hexadecimal string. */
function generateRandomID() {
    function randomHalfDigits() {
        return Math.floor((1 + Math.random()) * 0x100000000)
            .toString(16).substring(1);
    }
    // generate by half because of restricted numerical precision
    return randomHalfDigits() + randomHalfDigits();
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

export function chooseLocalizedText(texts: LocalizedString[], language: string): LocalizedString {
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
