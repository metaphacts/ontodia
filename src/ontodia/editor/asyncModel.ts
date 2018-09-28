import {
    Dictionary, ElementModel, LinkModel, ClassModel, LinkType,
    ElementIri, LinkTypeIri, ElementTypeIri, PropertyTypeIri,
} from '../data/model';
import { DataProvider } from '../data/provider';
import { PLACEHOLDER_LINK_TYPE } from '../data/schema';

import { Element, FatLinkType, FatClassModel, RichProperty, FatLinkTypeEvents, Link } from '../diagram/elements';
import { CommandHistory, Command } from '../diagram/history';
import { DiagramModel, DiagramModelEvents, placeholderDataFromIri } from '../diagram/model';

import { EventSource, Events, Listener } from '../viewUtils/events';

import { DataFetcher } from './dataFetcher';
import {
    LayoutData, LayoutElement, makeLayoutData, convertToSerializedDiagram, emptyDiagram,
    LinkTypeOptions, SerializedDiagram, makeSerializedDiagram, emptyLayoutData
} from './serializedDiagram';

export interface GroupBy {
    linkType: string;
    linkDirection: 'in' | 'out';
}

export interface AsyncModelEvents extends DiagramModelEvents {
    loadingStart: { source: AsyncModel };
    loadingSuccess: { source: AsyncModel };
    loadingError: {
        source: AsyncModel;
        error: any;
    };
    changeClassTree: { source: AsyncModel };
    createLoadedLink: {
        source: AsyncModel;
        model: LinkModel;
        cancel(): void;
    };
}

export class AsyncModel extends DiagramModel {
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

    private get asyncSource(): EventSource<AsyncModelEvents> {
        return this.source as EventSource<any>;
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
        this.asyncSource.trigger('loadingStart', {source: this});

        return Promise.all([
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
            // tslint:disable-next-line:no-console
            console.error(error);
            this.asyncSource.trigger('loadingError', {source: this, error});
            return Promise.reject(error);
        });
    }

    importLayout(params: {
        dataProvider: DataProvider;
        preloadedElements?: Dictionary<ElementModel>;
        validateLinks?: boolean;
        diagram?: SerializedDiagram;
        hideUnusedLinkTypes?: boolean;
    }): Promise<void> {
        this.resetGraph();
        this.setDataProvider(params.dataProvider);
        this.asyncSource.trigger('loadingStart', {source: this});

        return Promise.all<ClassModel[], LinkType[]>([
            this.dataProvider.classTree(),
            this.dataProvider.linkTypes(),
        ]).then(([classTree, linkTypes]) => {
            this.setClassTree(classTree);
            const allLinkTypes = this.initLinkTypes(linkTypes);
            const diagram = params.diagram ? params.diagram : emptyDiagram();
            this.setLinkSettings(diagram.linkTypeOptions);
            const loadingModels = this.loadAndRenderLayout({
                layoutData: diagram.layoutData,
                preloadedElements: params.preloadedElements || {},
                markLinksAsLayoutOnly: params.validateLinks || false,
                allLinkTypes,
                hideUnusedLinkTypes: params.hideUnusedLinkTypes,
            });
            const requestingLinks = params.validateLinks
                ? this.requestLinksOfType() : Promise.resolve();
            return Promise.all([loadingModels, requestingLinks]);
        }).then(() => {
            this.asyncSource.trigger('loadingSuccess', {source: this});
        }).catch(error => {
            // tslint:disable-next-line:no-console
            console.error(error);
            this.asyncSource.trigger('loadingError', {source: this, error});
            return Promise.reject(error);
        });
    }

    exportLayout(): SerializedDiagram {
        const layoutData = makeLayoutData(this.graph.getElements(), this.graph.getLinks());
        const linkTypeOptions = this.graph.getLinkTypes()
            // do not serialize default link type options
            .filter(linkType => (!linkType.visible || !linkType.showLabel) && linkType.id !== PLACEHOLDER_LINK_TYPE)
            .map(({id, visible, showLabel}): LinkTypeOptions =>
                ({'@type': 'LinkTypeOptions', property: id, visible, showLabel}));
        return makeSerializedDiagram({layoutData, linkTypeOptions});
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
        this.asyncSource.trigger('changeClassTree', {source: this});
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

    private setLinkSettings(settings: ReadonlyArray<LinkTypeOptions>) {
        for (const setting of settings) {
            const {visible = true, showLabel = true} = setting;
            const linkTypeId = setting.property as LinkTypeIri;
            this.linkSettings[linkTypeId] = {'@type': 'LinkTypeOptions', property: linkTypeId, visible, showLabel};
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
            layoutData = emptyLayoutData(),
            preloadedElements = {},
            markLinksAsLayoutOnly,
            hideUnusedLinkTypes,
        } = params;

        const elementIrisToRequestData: ElementIri[] = [];
        const usedLinkTypes: { [typeId: string]: FatLinkType } = {};

        for (const layoutElement of layoutData.elements) {
            const {'@id': id, iri, position, size, isExpanded, group} = layoutElement;
            const template = preloadedElements[iri];
            const data = template || placeholderDataFromIri(iri);
            const element = new Element({id, data, position, size, expanded: isExpanded, group});
            this.graph.addElement(element);
            if (!template) {
                elementIrisToRequestData.push(element.iri);
            }
        }

        for (const layoutLink of layoutData.links) {
            const {'@id': id, property, source, target, vertices} = layoutLink;
            const linkType = this.createLinkType(property);
            usedLinkTypes[linkType.id] = linkType;
            const link = this.addLink(new Link({
                id,
                typeId: linkType.id,
                sourceId: source['@id'],
                targetId: target['@id'],
                vertices,
            }));
            if (link) {
                link.setLayoutOnly(markLinksAsLayoutOnly);
            }
        }

        this.subscribeGraph();
        const requestingModels = this.requestElementData(elementIrisToRequestData);

        if (hideUnusedLinkTypes && params.allLinkTypes) {
            this.hideUnusedLinkTypes(params.allLinkTypes, usedLinkTypes);
        }

        return requestingModels;
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
        let allowToCreate: boolean;
        const cancel = () => { allowToCreate = false; };

        for (const linkModel of links) {
            this.createLinkType(linkModel.linkTypeId);
            allowToCreate = true;
            this.asyncSource.trigger('createLoadedLink', {source: this, model: linkModel, cancel});
            if (allowToCreate) {
                this.createLinks(linkModel);
            }
        }
    }

    createLinks(data: LinkModel) {
        const sources = this.graph.getElements().filter(el => el.iri === data.sourceId);
        const targets = this.graph.getElements().filter(el => el.iri === data.targetId);
        const typeId = data.linkTypeId;

        for (const source of sources) {
            for (const target of targets) {
                this.addLink(new Link({typeId, sourceId: source.id, targetId: target.id, data}));
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
