import { ElementModel, ElementIri, LinkModel, sameLink } from '../data/model';

import { Element, Link, FatLinkType, Cell, LinkVertex } from './elements';
import { Vector, isPolylineEqual } from './geometry';
import { Command } from './history';
import { DiagramModel } from './model';

export class RestoreGeometry implements Command {
    readonly title = 'Move elements and links';

    constructor(
        private elementState: ReadonlyArray<{ element: Element; position: Vector }>,
        private linkState: ReadonlyArray<{ link: Link; vertices: ReadonlyArray<Vector> }>,
    ) {}

    static capture(model: DiagramModel) {
        return RestoreGeometry.captureElementsAndLinks(model.elements, model.links);
    }

    private static captureElementsAndLinks(
        elements: ReadonlyArray<Element>,
        links: ReadonlyArray<Link>,
    ) {
        return new RestoreGeometry(
            elements.map(element => ({element, position: element.position})),
            links.map(link => ({link, vertices: link.vertices})),
        );
    }

    hasChanges() {
        return this.elementState.length > 0 || this.linkState.length > 0;
    }

    filterOutUnchanged(): RestoreGeometry {
        return new RestoreGeometry(
            this.elementState.filter(
                ({element, position}) => !Vector.equals(element.position, position)
            ),
            this.linkState.filter(
                ({link, vertices}) => !isPolylineEqual(link.vertices, vertices)
            ),
        );
    }

    invoke(): RestoreGeometry {
        const previous = RestoreGeometry.captureElementsAndLinks(
            this.elementState.map(state => state.element),
            this.linkState.map(state => state.link)
        );
        // restore in reverse order to workaround position changed event
        // handling in EmbeddedLayer inside nested elements
        // (child's position change causes group to resize or move itself)
        for (const {element, position} of [...this.elementState].reverse()) {
            element.setPosition(position);
        }
        for (const {link, vertices} of this.linkState) {
            link.setVertices(vertices);
        }
        return previous;
    }
}

export function restoreCapturedLinkGeometry(link: Link): Command {
    const vertices = link.vertices;
    return Command.create('Change link vertices', () => {
        const capturedInverse = restoreCapturedLinkGeometry(link);
        link.setVertices(vertices);
        return capturedInverse;
    });
}

export function setElementExpanded(element: Element, expanded: boolean): Command {
    const title = expanded ? 'Expand element' : 'Collapse element';
    return Command.create(title, () => {
        element.setExpanded(expanded);
        return setElementExpanded(element, !expanded);
    });
}

export function changeLinkTypeVisibility(params: {
    linkType: FatLinkType;
    visible: boolean;
    showLabel: boolean;
    preventLoading?: boolean;
}): Command {
    const {linkType, visible, showLabel, preventLoading} = params;
    return Command.create('Change link type visibility', () => {
        const previousVisible = linkType.visible;
        const previousShowLabel = linkType.showLabel;
        linkType.setVisibility({visible, showLabel, preventLoading});
        return changeLinkTypeVisibility({
            linkType,
            visible: previousVisible,
            showLabel: previousShowLabel,
            preventLoading,
        });
    });
}

export function setElementData(model: DiagramModel, target: ElementIri, data: ElementModel): Command {
    const elements = model.elements.filter(el => el.iri === target);
    const previous = elements.length > 0 ? elements[0].data : undefined;
    return Command.create('Set element data', () => {
        for (const element of model.elements.filter(el => el.iri === target)) {
            element.setData(data);
            updateLinksToReferByNewIri(element, previous.id, data.id);
        }
        return setElementData(model, target, previous);
    });
}

function updateLinksToReferByNewIri(element: Element, oldIri: ElementIri, newIri: ElementIri) {
    if (oldIri === newIri) { return; }
    for (const link of element.links) {
        let data = link.data;
        if (data.sourceId === oldIri) {
            data = {...data, sourceId: newIri};
        }
        if (data.targetId === oldIri) {
            data = {...data, targetId: newIri};
        }
        link.setData(data);
    }
}

export function setLinkData(model: DiagramModel, oldData: LinkModel, newData: LinkModel): Command {
    if (!sameLink(oldData, newData)) {
        throw new Error('Cannot change typeId, sourceId or targetId when changing link data');
    }
    return Command.create('Set link data', () => {
        for (const link of model.links) {
            if (sameLink(link.data, oldData)) {
                link.setData(newData);
            }
        }
        return setLinkData(model, newData, oldData);
    });
}
