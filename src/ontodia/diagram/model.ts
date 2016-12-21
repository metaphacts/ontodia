import * as Backbone from 'backbone';
import * as _ from 'lodash';
import * as joint from 'jointjs';

import {
    Dictionary, LocalizedString, LinkType, ClassModel, ElementModel, LinkModel,
} from '../data/model';
import { DataProvider } from '../data/provider';

import { LayoutData, normalizeImportedCell, cleanExportedLayout } from './layoutData';
import { Element, Link, FatLinkType, FatClassModel, LazyLabel } from './elements';
import { DataFetchingThread } from './dataFetchingThread';

export type IgnoreCommandHistory = { ignoreCommandManager?: boolean };
export type PreventLinksLoading = { preventLoading?: boolean; };

type ChangeVisibilityOptions = { isFromHandler?: boolean };
type RegisteredLink = Link & { __existsInData?: boolean };

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
    private propertyLabelById: Dictionary<LazyLabel> = {};

    private nextLinkTypeIndex = 0;
    private linkTypes: Dictionary<FatLinkType>;

    elements: { [id: string]: Element } = {};
    linksByType: { [type: string]: Link[] } = {};

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

    sourceOf(link: Link) { return this.elements[link.get('source').id]; }
    targetOf(link: Link) { return this.elements[link.get('target').id]; }

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
                superAddCell.call(this.graph, this.elements[cell.id]);
            }
        };
        // listen to external add/remove calls to graph (Halo's remove for example)
        this.listenTo(this.graph, 'add', (cell: joint.dia.Cell) => {
            if (cell instanceof Element) {
                const options: ChangeVisibilityOptions = {isFromHandler: true};
                cell.set('presentOnDiagram', true, options);
            } else if (cell instanceof Link) {
                const linkType = this.getLinkType(cell.get('typeId'));
                linkType.set('visible', true);
            }
        });
        this.listenTo(this.graph, 'remove', (cell: joint.dia.Cell) => {
            if (cell instanceof Element) {
                const options: ChangeVisibilityOptions = {isFromHandler: true};
                cell.set('presentOnDiagram', false, options);
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
            return this.initDiagram({elements: {}, links: []});
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
        preloadedElements: Dictionary<ElementModel>;
        preloadedLinks: LinkModel[];
        layoutData?: LayoutData;
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
                elements: params.preloadedElements,
                links: params.preloadedLinks,
                layoutData: params.layoutData,
                hideUnusedLinkTypes: params.hideUnusedLinkTypes,
            }).then(() => this.requestLinksOfType());
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
        elements: Dictionary<ElementModel>;
        links: LinkModel[];
        layoutData?: LayoutData;
        hideUnusedLinkTypes?: boolean;
    }): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            _.each(params.elements, normalizeTemplate);

            this.listenToOnce(this, 'state:renderDone', () => {
                const beforeReturn = () => this.graph.trigger('batch:stop', {batchName: 'to-back'});

                try {
                    this.syncCellsWithLayout(
                        params.elements, params.links);
                    if (params.hideUnusedLinkTypes) {
                        this.hideUnusedLinkTypes(params.links);
                    }
                } catch (err) {
                    beforeReturn();
                    reject(err);
                }

                beforeReturn();
                resolve();
                // notify when graph model is fully initialized
                this.trigger('state:dataLoaded');
            });

            this.graph.trigger('batch:start', {batchName: 'to-back'});

            if (params.layoutData) {
                this.initLayout(params.elements, params.layoutData);
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

    private initLayout(elements: Dictionary<ElementModel>, layoutData: LayoutData) {
        const cellModels: joint.dia.Cell[] = [];
        // create elements
        for (let i = 0; i < layoutData.cells.length; i++) {
            let cell = layoutData.cells[i];
            if (cell.type !== 'link') {
                cell = normalizeImportedCell(cell);
                const elementCellModel = new Element(cell);
                const template = elements[cell.id];
                elementCellModel.template = template;
                this.initializeElement(elementCellModel, {requestData: !template});
                elementCellModel.set('presentOnDiagram', true);
                cellModels.push(elementCellModel);
            }
        }
        // create links
        for (let i = 0; i < layoutData.cells.length; i++) {
            let cell = layoutData.cells[i];
            if (cell.type === 'link') {
                cell = normalizeImportedCell(cell);
                if (elements[cell.source.id] && elements[cell.target.id]) {
                    const linkCellModel = new Link(cell);
                    this.registerLink(linkCellModel);
                    cellModels.push(linkCellModel);
                }
            }
        }
        this.trigger('state:renderStart');
        this.graph.resetCells(cellModels);
    }

    private syncCellsWithLayout(elements: { [id: string]: ElementModel }, links: LinkModel[]) {
        // create elements and links missing from layout
        if (elements && links) {
            for (const elementID in elements) {
                if (elements.hasOwnProperty(elementID)) {
                    const elementModel = elements[elementID];
                    const element = this.createIfNeeded(elementModel);
                    element.trigger('state:loaded');
                }
            }

            for (const linkModel of links) {
                // only keep link if it's type info exists
                if (this.linkTypes[linkModel.linkTypeId]) {
                    this.createLink(linkModel);
                }
            }

            for (const link of this.graph.getLinks()) {
                const registered: RegisteredLink = link as Link;
                if (!registered.__existsInData) {
                    registered.layoutOnly = true;
                }
            }
        }
    }

    private hideUnusedLinkTypes(links: LinkModel[]) {
        const unusedLinkTypes = _.clone(this.linkTypes);
        for (const link of links) {
            delete unusedLinkTypes[link.linkTypeId];
        }
        for (const typeId in unusedLinkTypes) {
            if (!unusedLinkTypes.hasOwnProperty(typeId)) { continue; }
            const unusedLinkType = unusedLinkTypes[typeId];
            unusedLinkType.set('visible', false);
        }
    }

    private createIfNeeded(elementModel: ElementModel, options?: {requestData?: boolean}): Element {
        const existingElement = this.elements[elementModel.id];
        if (existingElement) { return existingElement; }

        const rect = new Element({id: elementModel.id});
        rect.template = elementModel;

        this.initializeElement(rect, options);
        return rect;
    }

    createElement(elementModel: ElementModel): Element {
        return this.createIfNeeded(elementModel, {requestData: true});
    }

    initializeElement(element: Element, {requestData = false} = {}) {
        this.elements[element.id] = element;

        element.on('change:presentOnDiagram', (self: Element, value: boolean, options: ChangeVisibilityOptions) => {
            if (options.isFromHandler) { return; }
            const isPresentOnDiagram = element.get('presentOnDiagram');
            if (isPresentOnDiagram) {
                delete element.collection;
                this.graph.addCell(element);
                // restore links
                for (const link of element.links) {
                    if (this.isSourceAndTargetVisible(link) && this.getLinkType(link.get('typeId')).get('visible')) {
                        this.graph.addCell(link);
                    }
                }
            } else {
                element.remove();
            }
        });

        if (requestData) {
            this.dataProvider.elementInfo({elementIds: [element.id]})
                .then(elements => this.onElementInfoLoaded(elements))
                .catch(err => console.error(err));
            this.requestLinksOfType();
        }
    }

    requestLinksOfType(linkTypeIds?: string[]) {
        let linkTypes = linkTypeIds;
        if (!linkTypes) {
            linkTypeIds = _.values(this.linkTypes).map(type => type.id);
        }
        return this.dataProvider.linksInfo({
            elementIds: _.keys(this.elements),
            linkTypeIds: linkTypeIds,
        }).then(links => this.onLinkInfoLoaded(links))
        .catch(err => console.error(err));
    }

    getPropertyLabelById(labelId: string): LazyLabel {
        if (!this.propertyLabelById[labelId]) {
            this.propertyLabelById[labelId] = new LazyLabel({
                id: labelId,
                label: {
                    values: [{lang: '', text: uri2name(labelId)}],
                },
            });
            this.propertyLabelFetchingThread.startFetchingThread(labelId).then(labelIds => {
                if (labelIds.length > 0) {
                    this.dataProvider.propertyInfo({labelIds: labelIds}).then(propLabels => {
                        for (const pl of propLabels) {
                            if (!this.propertyLabelById[pl.id]) { continue; }
                            this.propertyLabelById[pl.id].set('label', pl.label);
                        }
                    });
                }
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

    getLinkType(linkTypeId: string): FatLinkType {
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
        _.each(elements, (template: ElementModel, id: string) => {
            const element = this.elements[id];
            if (element) {
                element.template = normalizeTemplate(template);
                element.trigger('state:loaded');
            }
        });
    }

    private onLinkInfoLoaded(links: LinkModel[]) {
        this.initBatchCommand();
        for (const linkModel of links) {
            this.createLink(linkModel);
        }
        this.storeBatchCommand();
    }

    isSourceAndTargetVisible(link: Link) {
        return this.sourceOf(link).get('presentOnDiagram')
            && this.targetOf(link).get('presentOnDiagram');
    }

    createLink(linkModel: LinkModel, options?: IgnoreCommandHistory): Link {
        const existingLink: RegisteredLink = this.getLink(linkModel);
        if (existingLink) {
          if (existingLink.layoutOnly) {
            existingLink.set('layoutOnly', false, {ignoreCommandManager: true} as IgnoreCommandHistory);
          }
          existingLink.__existsInData = true;
          return existingLink;
        }
        const link: RegisteredLink = new Link({
            id: _.uniqueId('link_'),
            typeId: linkModel.linkTypeId,
            source: { id: linkModel.sourceId },
            target: { id: linkModel.targetId },
        });
        link.__existsInData = true;

        this.registerLink(link);

        if (this.isSourceAndTargetVisible(link) && this.getLinkType(link.get('typeId')).get('visible')) {
            this.graph.addCell(link, options);
        }

        return link;
    }

    private registerLink(link: Link) {
        const typeId = link.get('typeId');
        if (!this.linksByType.hasOwnProperty(typeId)) {
            this.linksByType[typeId] = [];
        }
        this.linksByType[typeId].push(link);

        if (link.typeIndex === undefined) {
            link.typeIndex = this.getLinkType(typeId).index;
        }

        this.sourceOf(link).links.push(link);
        this.targetOf(link).links.push(link);
    }

    getLink(linkModel: LinkModel): Link | undefined {
        const source = this.elements[linkModel.sourceId];
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
