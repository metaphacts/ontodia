import {
    Dictionary, ElementModel, LinkModel, ClassModel, LinkType,
    ElementIri, LinkTypeIri, ElementTypeIri, PropertyTypeIri,
} from '../data/model';
import { DataProvider } from '../data/provider';

import { Element, FatLinkType, FatClassModel, RichProperty, FatLinkTypeEvents } from '../diagram/elements';
import { CommandHistory, Command } from '../diagram/history';
import { DiagramModel, DiagramModelEvents, placeholderDataFromIri } from '../diagram/model';

import { EventSource, Events, Listener } from '../viewUtils/events';

import { DataFetcher } from './dataFetcher';
import { LayoutData, LayoutElement, normalizeImportedCell, exportLayoutData } from './layoutData';

export interface GroupBy {
    linkType: string;
    linkDirection: 'in' | 'out';
}

export interface LinkTypeOptions {
    id: string; // LinkTypeIri
    visible: boolean;
    showLabel?: boolean;
}

export interface AsyncModelEvents extends DiagramModelEvents {
    loadingStart: { source: AsyncModel };
    loadingSuccess: { source: AsyncModel };
    loadingError: {
        source: AsyncModel;
        error: any;
    };
}

export class AsyncModel extends DiagramModel {
    protected readonly source: EventSource<AsyncModelEvents>;
    readonly events: Events<AsyncModelEvents>;

    private _dataProvider: DataProvider;
    private fetcher: DataFetcher;

    private classTree: FatClassModel[] = [];
    private linkSettings: { [linkTypeId: string]: LinkTypeOptions } = {};

    constructor(
        history: CommandHistory,
        private groupByProperties: ReadonlyArray<GroupBy>,
    ) {
        super(history);
    }

    get dataProvider() { return this._dataProvider; }

    getClasses() {
        return this.classTree;
    }

    subscribeGraph() {
        super.subscribeGraph();

        this.graphListener.listen(this.graph.events, 'linkTypeEvent', e => {
            if (e.key === 'changeVisibility') {
                this.onLinkTypeVisibilityChanged(e.data[e.key], e.key);
            }
        });
    }

    private setDataProvider(dataProvider: DataProvider) {
        this._dataProvider = dataProvider;
        this.fetcher = new DataFetcher(this.graph, dataProvider);
    }

    createNewDiagram(dataProvider: DataProvider): Promise<void> {
        this.resetGraph();
        this.setDataProvider(dataProvider);
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

    importLayout(params: {
        dataProvider: DataProvider;
        preloadedElements?: Dictionary<ElementModel>;
        layoutData?: LayoutData;
        validateLinks?: boolean;
        linkSettings?: LinkTypeOptions[];
        hideUnusedLinkTypes?: boolean;
    }): Promise<void> {
        this.resetGraph();
        this.setDataProvider(params.dataProvider);
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

    private initLinkTypes(linkTypes: LinkType[]): FatLinkType[] {
        const types: FatLinkType[] = [];
        for (const {id, label} of linkTypes) {
            const linkType = new FatLinkType({id, label: label.values});
            this.graph.addLinkType(linkType);
            types.push(linkType);
        }
        return types;
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
                const data = template || placeholderDataFromIri(iri);
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
            elementIds: this.graph.getElements().map(element => element.iri),
            linkTypeIds: linkTypes,
        }).then(links => this.onLinkInfoLoaded(links));
    }

    createClass(classId: ElementTypeIri): FatClassModel {
        if (this.graph.getClass(classId)) {
            return super.createClass(classId);
        }
        const classModel = super.createClass(classId);
        this.fetcher.fetchClass(classModel);
        return classModel;
    }

    createLinkType(linkTypeId: LinkTypeIri): FatLinkType {
        if (this.graph.getLinkType(linkTypeId)) {
            return super.createLinkType(linkTypeId);
        }
        const linkType = super.createLinkType(linkTypeId);
        const setting = this.linkSettings[linkType.id];
        if (setting) {
            const {visible, showLabel} = setting;
            linkType.setVisibility({visible, showLabel, preventLoading: true});
        }
        this.fetcher.fetchLinkType(linkType);
        return linkType;
    }

    createProperty(propertyIri: PropertyTypeIri): RichProperty {
        if (this.graph.getProperty(propertyIri)) {
            return super.createProperty(propertyIri);
        }
        const property = super.createProperty(propertyIri);
        this.fetcher.fetchPropertyType(property);
        return property;
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
        const sources = this.graph.getElements().filter(el => el.iri === data.sourceId);
        const targets = this.graph.getElements().filter(el => el.iri === data.targetId);

        for (const source of sources) {
            for (const target of targets) {
                this.createLink({linkType, sourceId: source.id, targetId: target.id, data});
            }
        }
    }

    loadEmbeddedElements(elementIri: ElementIri): Promise<Dictionary<ElementModel>> {
        const elements = this.groupByProperties.map(groupBy =>
            this.dataProvider.linkElements({
                elementId: elementIri,
                linkId: groupBy.linkType as LinkTypeIri,
                offset: 0,
                direction: groupBy.linkDirection,
            })
        );
        return Promise.all(elements).then(res =>
            res.reduce((memo, current) => Object.assign(memo, current), {})
        );
    }
}

export function restoreLinksBetweenElements(model: AsyncModel, elementIris: ReadonlyArray<ElementIri>): Command {
    return Command.effect('Restore links between elements', () => {
        model.requestElementData(elementIris);
        model.requestLinksOfType();
    });
}
