import * as Backbone from 'backbone';
import * as _ from 'lodash';
import * as joint from 'jointjs';

import {
    Dictionary, LocalizedString, LinkType, ClassModel, ElementModel, LinkModel,
} from '../data/model';
import { DataProvider } from '../data/provider';

import { Element, Link, FatLinkType } from './elements';

export type IgnoreCommandHistory = { ignoreCommandManager?: boolean };

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
    private static serializedCellProperties = [
        'id', 'type', 'presentOnDiagram',          // common properties
        'size', 'angle', 'isExpanded', 'position', // element properties
        'typeId', 'source', 'target', 'vertices',  // link properties
    ];

    graph = new joint.dia.Graph;

    dataProvider: DataProvider;

    classTree: ClassTreeElement[];
    classesById: { [id: string]: ClassModel } = {};
    linkTypes: { [id: string]: FatLinkType };

    elements: { [id: string]: Element } = {};
    linksByType: { [type: string]: Link[] } = {};

    constructor(isViewOnly = false) {
        super();
        this.set('isViewOnly', isViewOnly);
        this.initializeExternalAddRemoveSupport();
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
                cell.set('presentOnDiagram', true, <any>{isFromHandler: true});
            } else if (cell instanceof Link) {
                const linkType = this.getLinkType(cell.get('typeId'));
                linkType.set('visible', true);
            }
        });
        this.listenTo(this.graph, 'remove', (cell: joint.dia.Cell) => {
            if (cell instanceof Element) {
                cell.set('presentOnDiagram', false, <any>{ isFromHandler: true });
            }
            // else if (cell instanceof Link) {
                // const linkType = this.linkTypes[cell.get('typeId')];
                // if (linkType && linkType.get('visible')) {
                //     const mustSwitch = !_.some(this.graph.getLinks(),
                //         (link: Link) => link.get('typeId') === cell.get('typeId'));
                //     if (mustSwitch) { linkType.set('visible', false); }
                // }
            // }
        });
        this.listenTo(this.graph, 'change:labels', (cell: joint.dia.Cell) => {
            if (cell instanceof Link) {
                const linkType = this.getLinkType(cell.get('typeId'));
                if (linkType) {
                    const hasLabels = cell.get('labels').length > 0;
                    linkType.set('showLabel', hasLabels);
                }
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
        _.each(linkTypes, (linkType: LinkType) => {
            this.linkTypes[linkType.id] = new FatLinkType({linkType: linkType, diagram: this});
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

        return Promise.all<any>([
            this.dataProvider.classTree(),
            this.dataProvider.linkTypes(),
        ]).then(([classTree, linkTypes]: [ClassModel[], LinkType[]]) => {
            this.setClassTree(classTree);
            this.initLinkTypes(linkTypes);
            this.trigger('state:endLoad', _.size(params.preloadedElements));
            this.initLinkSettings(params.linkSettings);
            return this.initDiagram({
                elements: params.preloadedElements,
                links: params.preloadedLinks,
                layoutData: params.layoutData,
                hideUnusedLinkTypes: params.hideUnusedLinkTypes,
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
        const layoutData = this.graph.toJSON();
        layoutData.cells = _.map(layoutData.cells, function (cell) {
            return _.pick(cell, DiagramModel.serializedCellProperties);
        });
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
            this.classesById[cl.id] = cl;
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
                try {
                    this.syncCellsWithLayout(
                        params.elements, params.links);
                    if (params.hideUnusedLinkTypes) {
                        this.hideUnusedLinkTypes(params.links);
                    }
                } catch (err) {
                    reject(err);
                }
                resolve();
                // notify when graph model is fully initialized
                this.trigger('state:dataLoaded');
            });

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
                const options = {preventLoading: true};
                type.set(_.defaults(settings, existingDefaults), options);
            });
        } else {
            const newDefaults = { visible: true, showLabel: true };
            _.each(this.linkTypes, type => type.set(newDefaults, <any>{preventLoading: true}));
        }
    }

    private initLayout(elements: Dictionary<ElementModel>, layoutData: LayoutData) {
        const cellModels = [];
        // create elements
        for (let i = 0; i < layoutData.cells.length; i++) {
            let cell = layoutData.cells[i];
            if (cell.type !== 'link') {
                cell = _.pick(cell, DiagramModel.serializedCellProperties);
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
                cell = _.pick(cell, DiagramModel.serializedCellProperties);
                if (elements[cell.source.id] && elements[cell.target.id]) {
                    const linkCellModel = new Link(cell);
                    this.registerLink(linkCellModel);
                    // mark link as only existing in layout
                    linkCellModel.set('layoutOnly', true);
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
                    const link = this.linkInstances(linkModel);
                    // link exists in underlying data, remove mark
                    link.set('layoutOnly', false);
                    link.trigger('state:loaded');
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

    initializeElement(element: Element, options?: { requestData?: boolean }) {
        this.elements[element.id] = element;

        element.on('change:presentOnDiagram', (self: Element, value: boolean, options: { isFromHandler?: boolean }) => {
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

        if (options && options.requestData) {
            this.dataProvider.elementInfo({elementIds: [element.id]})
                .then(elements => this.onElementInfoLoaded(elements))
                .catch(err => console.error(err));
            this.requestLinksOfType();
        }
    }

    requestLinksOfType(linkTypeIds?: string[]) {
        if (!linkTypeIds) {
            const linkTypes = _.values(this.linkTypes);
            linkTypeIds = _.chain(linkTypes)
                // .filter(type => type.get('visible'))
                .map((type: FatLinkType) => type.id)
                .value();
        }
        return this.dataProvider.linksInfo({
            elementIds: _.keys(this.elements),
            linkTypeIds: linkTypeIds,
        }).then(links => this.onLinkInfoLoaded(links))
        .catch(err => console.error(err));
    }

    getLinkType(linkTypeId: string) : FatLinkType {
        if (!this.linkTypes.hasOwnProperty(linkTypeId)) {
            const linkType = new FatLinkType({
                linkType: {
                    id: linkTypeId, count: 0,
                    label: {values: [{text: uri2name(linkTypeId), lang: ""}]}
                }, diagram: this
                //
            });
            linkType.set({visible: true, showLabel: true});
            this.linkTypes[linkTypeId] = linkType;
        }
        return this.linkTypes[linkTypeId];
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
            this.linkInstances(linkModel);
        }
        this.storeBatchCommand();
    }

    isSourceAndTargetVisible(link: Link) {
        return this.sourceOf(link).get('presentOnDiagram')
            && this.targetOf(link).get('presentOnDiagram');
    }

    private linkInstances(linkModel: LinkModel, options?: IgnoreCommandHistory): Link {
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
            source: { id: linkModel.sourceId },
            target: { id: linkModel.targetId },
        });

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

        this.sourceOf(link).links.push(link);
        this.targetOf(link).links.push(link);
    }

    private getLink(linkModel: LinkModel): Link {
        const source = this.elements[linkModel.sourceId];
        for (const link of source.links) {
            if (link.get('source').id === linkModel.sourceId &&
                link.get('target').id === linkModel.targetId &&
                link.get('typeId') === linkModel.linkTypeId
            ) {
                return link;
            }
        }
        return null;
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

export interface LayoutData {
    cells: any[];
}

export function normalizeTemplate(template: ElementModel): ElementModel {
    template.types.sort();
    return template;
}

export function uri2name(uri: string): string {
    const lastPartStart = uri.lastIndexOf('/');
    if (lastPartStart !== -1 && lastPartStart !== uri.length - 1) {
        return uri.substring(uri.lastIndexOf('/') + 1);
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
