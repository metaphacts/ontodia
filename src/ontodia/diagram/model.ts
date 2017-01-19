import * as Backbone from 'backbone';
import * as _ from 'lodash';
import * as joint from 'jointjs';

import {
    Dictionary, LocalizedString, LinkType, ClassModel, ElementModel, LinkModel,
} from '../data/model';
import { DataProvider } from '../data/provider';

import { LayoutData, normalizeImportedCell, cleanExportedLayout } from './layoutData';
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
        this.graph['addCell'] = (cell: any) => {
            if (cell instanceof Element || cell instanceof Link) {
                superAddCell.call(this.graph, cell);
            } else if (cell.type === 'link') {
                const link = this.getLink({
                    sourceId: cell.source.id,
                    targetId: cell.target.id,
                    linkTypeId: cell.typeId,
                });
                superAddCell.call(this.graph, link);
            } else {
                superAddCell.call(this.graph, cell);
            }
        };
        // listen to external add/remove calls to graph (Halo's remove for example)
        this.listenTo(this.graph, 'add', (cell: joint.dia.Cell) => {
            if (cell instanceof Link) {
                const linkType = this.getLinkType(cell.get('typeId'));
                linkType.set('visible', true);
            }
        });
        this.listenTo(this.graph, 'remove', (cell: joint.dia.Cell) => { /* nothing */ });
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
        _.each(linkTypes, ({id, label}: LinkType) => {
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
            this.trigger('state:endLoad', _.size(params.preloadedElements));
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
        const linkSettings = _.map(this.linkTypes, (type: FatLinkType) => ({
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
            _.each(cl.children, addClass);
        };
        _.each(rootClasses, addClass);
    }

    private initDiagram(params: {
        layoutData?: LayoutData;
        preloadedElements: Dictionary<ElementModel>;
        markLinksAsLayoutOnly: boolean;
        hideUnusedLinkTypes?: boolean;
    }): Promise<void> {
        const {layoutData, preloadedElements, markLinksAsLayoutOnly, hideUnusedLinkTypes} = params;
        return new Promise<void>((resolve, reject) => {
            _.each(preloadedElements, normalizeTemplate);

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

            if (layoutData) {
                this.initLayout(layoutData, preloadedElements, markLinksAsLayoutOnly);
            } else {
                this.trigger('state:renderStart');
                this.trigger('state:renderDone');
            }
        });
    }

    private initLinkSettings(linkSettings?: LinkTypeOptions[]) {
        if (linkSettings) {
            const existingDefaults = { visible: false, showLabel: true };
            const indexedSettings = _.keyBy(linkSettings, 'id');
            _.each(this.linkTypes, (type, typeId) => {
                const settings = indexedSettings[typeId] || {isNew: true};
                const options: PreventLinksLoading = {preventLoading: true};
                type.set(_.defaults(settings, existingDefaults), options);
            });
        } else {
            const newDefaults = { visible: true, showLabel: true };
            const options: PreventLinksLoading = {preventLoading: true};
            _.each(this.linkTypes, type => type.set(newDefaults, options));
        }
    }

    private initLayout(
        layoutData: LayoutData,
        preloadedElements: Dictionary<ElementModel>,
        markLinksAsLayoutOnly: boolean,
    ) {
        const cellModels: joint.dia.Cell[] = [];
        const elementToRequestData: Element[] = [];

        for (const layoutCell of layoutData.cells) {
            let cell = normalizeImportedCell(layoutCell);
            if (cell.type === 'element') {
                const element = new Element(cell);
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

        this.requestElementData(elementToRequestData, {requestLinks: false});
        this.trigger('state:renderStart');
        this.graph.resetCells(cellModels);

        for (const link of this.links) {
            this.registerLink(link);
        }
    }

    private hideUnusedLinkTypes() {
        const unusedLinkTypes = _.clone(this.linkTypes);
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

    requestElementData(elements: Element[], params: {requestLinks?: boolean} = {}) {
        this.dataProvider.elementInfo({elementIds: elements.map(e => e.id)})
            .then(models => this.onElementInfoLoaded(models))
            .catch(err => console.error(err));

        const {requestLinks = true} = params;
        if (requestLinks) {
            this.requestLinksOfType();
        }
    }

    requestLinksOfType(linkTypeIds?: string[]) {
        let linkTypes = linkTypeIds;
        if (!linkTypes) {
            linkTypeIds = _.values(this.linkTypes).map(type => type.id);
        }
        return this.dataProvider.linksInfo({
            elementIds: this.graph.getElements().map(element => element.id),
            linkTypeIds: linkTypeIds,
        }).then(links => this.onLinkInfoLoaded(links))
        .catch(err => console.error(err));
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
                const template = elements[id];
                element.template = normalizeTemplate(template);
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

    createLink(linkModel: LinkModel, options?: IgnoreCommandHistory): Link | undefined {
        const existingLink = this.getLink(linkModel);
        if (existingLink) {
          if (existingLink.layoutOnly) {
            existingLink.set('layoutOnly', false, {ignoreCommandManager: true} as IgnoreCommandHistory);
          }
          return existingLink;
        }

        const link = new Link({
            id: _.uniqueId('link_'),
            typeId: linkModel.linkTypeId,
            source: {id: linkModel.sourceId},
            target: {id: linkModel.targetId},
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
        for (const link of source.links) {
            if (link.get('source').id === linkModel.sourceId &&
                link.get('target').id === linkModel.targetId &&
                link.get('typeId') === linkModel.linkTypeId
            ) {
                return link;
            }
        }
        return undefined;
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

export function normalizeTemplate(template: ElementModel): ElementModel {
    template.types.sort();
    return template;
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
