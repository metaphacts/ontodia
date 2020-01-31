import {
    ElementModel, ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
} from '../data/model';
import { GenerateID } from '../data/schema';

import { EventSource, Events, EventObserver, AnyEvent } from '../viewUtils/events';

import {
    Element, ElementEvents, Link, LinkEvents, FatLinkType, FatLinkTypeEvents,
    FatClassModel, FatClassModelEvents, RichProperty,
} from './elements';
import { Graph, CellsChangedEvent } from './graph';
import { CommandHistory, Command } from './history';

export interface DiagramModelEvents {
    changeCells: CellsChangedEvent;
    elementEvent: AnyEvent<ElementEvents>;
    linkEvent: AnyEvent<LinkEvents>;
    linkTypeEvent: AnyEvent<FatLinkTypeEvents>;
    classEvent: AnyEvent<FatClassModelEvents>;
    changeGroupContent: { group: string };
}

/**
 * Model of diagram.
 */
export class DiagramModel {
    protected readonly source = new EventSource<DiagramModelEvents>();
    readonly events: Events<DiagramModelEvents> = this.source;

    protected graph = new Graph();
    protected graphListener = new EventObserver();

    constructor(
        readonly history: CommandHistory,
    ) {}

    get elements() { return this.graph.getElements(); }
    get links() { return this.graph.getLinks(); }

    getElement(elementId: string): Element | undefined {
        return this.graph.getElement(elementId);
    }

    getLinkById(linkId: string): Link | undefined {
        return this.graph.getLink(linkId);
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

    resetGraph() {
        if (this.graphListener) {
            this.graphListener.stopListening();
            this.graphListener = new EventObserver();
        }
        this.graph = new Graph();
    }

    subscribeGraph() {
        this.graphListener.listen(this.graph.events, 'changeCells', e => {
            this.source.trigger('changeCells', e);
        });
        this.graphListener.listen(this.graph.events, 'elementEvent', e => {
            this.source.trigger('elementEvent', e);
        });
        this.graphListener.listen(this.graph.events, 'linkEvent', e => {
            this.source.trigger('linkEvent', e);
        });
        this.graphListener.listen(this.graph.events, 'linkTypeEvent', e => {
            this.source.trigger('linkTypeEvent', e);
        });
        this.graphListener.listen(this.graph.events, 'classEvent', e => {
            this.source.trigger('classEvent', e);
        });

        this.source.trigger('changeCells', {updateAll: true});
    }

    reorderElements(compare: (a: Element, b: Element) => number) {
        this.graph.reorderElements(compare);
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
            ? placeholderDataFromIri(elementIri)
            : elementIriOrModel as ElementModel;
        data = {...data, id: data.id};
        const element = new Element({id: GenerateID.forElement(), data, group});
        this.addElement(element);
        return element;
    }

    addElement(element: Element): void {
        this.history.execute(
            addElement(this.graph, element, [])
        );
    }

    removeElement(elementId: string) {
        const element = this.getElement(elementId);
        if (element) {
            this.history.execute(
                removeElement(this.graph, element)
            );
        }
    }

    addLink(link: Link): Link {
        const {typeId, sourceId, targetId, data} = link;
        if (data && data.linkTypeId !== typeId) {
            throw new Error('linkTypeId must match linkType.id');
        }

        const existingLink = this.findLink(typeId, sourceId, targetId);
        if (existingLink) {
            if (link.data) {
                existingLink.setLayoutOnly(false);
                existingLink.setData(data);
            }
            return existingLink;
        }

        const linkType = this.createLinkType(link.typeId);
        const source = this.getElement(sourceId);
        const target = this.getElement(targetId);
        const shouldBeVisible = linkType.visible && source && target;
        if (!shouldBeVisible) {
            return undefined;
        }

        if (!link.data) {
            link.setData({linkTypeId: typeId, sourceId: source.iri, targetId: target.iri});
        }
        this.graph.addLink(link);
        return link;
    }

    removeLink(linkId: string) {
        this.graph.removeLink(linkId);
    }

    getClass(classIri: ElementTypeIri): FatClassModel {
        return this.graph.getClass(classIri);
    }

    createClass(classIri: ElementTypeIri): FatClassModel {
        const existing = this.graph.getClass(classIri);
        if (existing) {
            return existing;
        }
        const classModel = new FatClassModel({id: classIri});
        this.addClass(classModel);
        return classModel;
    }

    addClass(model: FatClassModel) {
        this.graph.addClass(model);
    }

    getLinkType(linkTypeIri: LinkTypeIri): FatLinkType | undefined {
        return this.graph.getLinkType(linkTypeIri);
    }

    createLinkType(linkTypeIri: LinkTypeIri): FatLinkType {
        const existing = this.graph.getLinkType(linkTypeIri);
        if (existing) {
            return existing;
        }
        const linkType = new FatLinkType({id: linkTypeIri});
        this.graph.addLinkType(linkType);
        return linkType;
    }

    getProperty(propertyTypeIri: PropertyTypeIri): RichProperty {
        return this.graph.getProperty(propertyTypeIri);
    }

    createProperty(propertyIri: PropertyTypeIri): RichProperty {
        const existing = this.graph.getProperty(propertyIri);
        if (existing) {
            return existing;
        }
        const property = new RichProperty({id: propertyIri});
        this.graph.addProperty(property);
        return property;
    }

    triggerChangeGroupContent(group: string) {
        this.source.trigger('changeGroupContent', {group});
    }

    createTemporaryElement(): Element {
        const target = new Element({
            id: GenerateID.forElement(),
            data: placeholderDataFromIri('' as ElementIri),
            temporary: true,
        });

        this.graph.addElement(target);

        return target;
    }
}

export function placeholderDataFromIri(iri: ElementIri): ElementModel {
    return {
        id: iri,
        types: [],
        label: {values: []},
        properties: {},
    };
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
