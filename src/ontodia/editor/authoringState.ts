import { ElementModel, LinkModel, ElementIri, sameLink } from '../data/model';
import { hashFnv32a } from '../data/utils';

import { Element, Link } from '../diagram/elements';
import { DiagramModel } from '../diagram/model';

import { HashMap } from '../viewUtils/collections';

export interface AuthoringState {
    events: ReadonlyArray<AuthoringEvent>;
}

export type AuthoringEvent =
    | ElementChange
    | ElementDeletion
    | LinkChange
    | LinkDeletion;

export const enum AuthoringKind {
    ChangeElement = 'changeElement',
    DeleteElement = 'deleteElement',
    ChangeLink = 'changeLink',
    DeleteLink = 'deleteLink',
}

export interface ElementDeletion {
    readonly type: AuthoringKind.DeleteElement;
    readonly model: ElementModel;
    readonly items: ReadonlyArray<Element>;
}

export interface LinkDeletion {
    readonly type: AuthoringKind.DeleteLink;
    readonly model: LinkModel;
    readonly items: ReadonlyArray<Link>;
}

export interface ElementChange {
    readonly type: AuthoringKind.ChangeElement;
    readonly before?: ElementModel;
    readonly after: ElementModel;
}

export interface LinkChange {
    readonly type: AuthoringKind.ChangeLink;
    readonly before?: LinkModel;
    readonly after: LinkModel;
}

export interface AuthoringIndex {
    elements: Map<ElementIri, ElementChange | ElementDeletion>;
    links: HashMap<LinkModel, LinkChange | LinkDeletion>;
}

export namespace AuthoringState {
    export const empty: AuthoringState = {
        events: [],
    };

    export function set(state: AuthoringState, change: Partial<AuthoringState>): AuthoringState {
        return {...state, ...change};
    }

    export function addElements(state: AuthoringState, items: ReadonlyArray<ElementModel>) {
        if (items.length === 0) {
            return state;
        }
        const additional = items.map((item): ElementChange => {
            return {type: AuthoringKind.ChangeElement, after: item};
        });
        return AuthoringState.set(state, {events: [...state.events, ...additional]});
    }

    export function addLinks(state: AuthoringState, items: ReadonlyArray<LinkModel>) {
        if (items.length === 0) {
            return state;
        }
        const additional = items.map((item): LinkChange => {
            return {type: AuthoringKind.ChangeLink, after: item};
        });
        return AuthoringState.set(state, {events: [...state.events, ...additional]});
    }

    export function changeElement(state: AuthoringState, before: ElementModel, after: ElementModel) {
        const iriChanged = after.id !== before.id;
        if (iriChanged) {
            // disallow changing IRI for existing (non-new) entities
            const isNewEntity = state.events.find(e =>
                e.type === AuthoringKind.ChangeElement &&
                e.after.id === before.id &&
                !e.before
            );
            if (!isNewEntity) {
                throw new Error('Cannot change IRI of already persisted entity');
            }
        }
        const additional: AuthoringEvent[] = [];
        const events = state.events.filter(e => {
            if (e.type === AuthoringKind.ChangeElement) {
                if (e.after.id === before.id) {
                    additional.push({
                        type: AuthoringKind.ChangeElement,
                        before: e.before,
                        after: after,
                    });
                    return false;
                }
            } else if (e.type === AuthoringKind.ChangeLink) {
                if (iriChanged && linkConnectedToElement(e.after, before.id)) {
                    additional.push({
                        type: AuthoringKind.ChangeLink,
                        before: e.before,
                        after: updateLinkToReferByNewIri(e.after, before.id, after.id),
                    });
                    return false;
                }
            }
            return true;
        });
        return AuthoringState.set(state, {events: [...events, ...additional]});
    }

    export function changeLink(state: AuthoringState, before: LinkModel, after: LinkModel) {
        const additional: AuthoringEvent[] = [];
        const events = state.events.filter(e => {
            if (e.type === AuthoringKind.ChangeLink) {
                if (sameLink(e.after, before)) {
                    additional.push({
                        type: AuthoringKind.ChangeLink,
                        before: e.before,
                        after: after,
                    });
                    return false;
                }
            }
            return true;
        });
        return AuthoringState.set(state, {events: [...events, ...additional]});
    }

    export function deleteElement(state: AuthoringState, targetIri: ElementIri, model: DiagramModel) {
        const additional: AuthoringEvent[] = [];
        const events = state.events.filter(e => {
            if (e.type === AuthoringKind.ChangeElement) {
                if (e.after.id === targetIri) {
                    if (isNewElement(e)) {
                        additional.push({
                            type: AuthoringKind.DeleteElement,
                            model: e.before,
                            items: model.elements.filter(el => el.iri === e.before.id),
                        });
                    }
                    return false;
                }
            } else if (e.type === AuthoringKind.ChangeLink) {
                if (linkConnectedToElement(e.after, targetIri)) {
                    if (isSourceOrTargetChanged(e)) {
                        additional.push({
                            type: AuthoringKind.DeleteLink,
                            model: e.before,
                            items: model.links.filter(link => sameLink(link.data, e.before)),
                        });
                    }
                    return false;
                }
            } else if (e.type === AuthoringKind.DeleteLink) {
                if (linkConnectedToElement(e.model, targetIri)) {
                    return false;
                }
            }
            return true;
        });
        return AuthoringState.set(state, {events: [...events, ...additional]});
    }

    export function deleteLink(state: AuthoringState, target: LinkModel, model: DiagramModel) {
        let existingLink = true;
        const events = state.events.filter(e => {
            if (e.type === AuthoringKind.ChangeLink) {
                if (sameLink(e.after, target)) {
                    existingLink = Boolean(e.before);
                    return false;
                }
            }
            return true;
        });
        if (existingLink) {
            events.push({
                type: AuthoringKind.DeleteLink,
                model: target,
                items: model.links.filter(link => sameLink(link.data, target)),
            });
        }
        return AuthoringState.set(state, {events});
    }
}

export namespace AuthoringIndex {
    export function fromState(state: AuthoringState): AuthoringIndex {
        const elements = new Map<ElementIri, ElementChange | ElementDeletion>();
        const links = new HashMap<LinkModel, LinkChange | LinkDeletion>(
            ({linkTypeId, sourceId, targetId}) => {
                let hash = hashFnv32a(linkTypeId);
                hash = hash * 31 + hashFnv32a(sourceId);
                hash = hash * 31 + hashFnv32a(targetId);
                return hash;
            },
            sameLink,
        );
        for (const e of state.events) {
            if (e.type === AuthoringKind.ChangeElement) {
                elements.set(e.after.id, e);
            } else if (e.type === AuthoringKind.DeleteElement) {
                elements.set(e.model.id, e);
            } else if (e.type === AuthoringKind.ChangeLink) {
                links.set(e.after, e);
            } else if (e.type === AuthoringKind.DeleteLink) {
                links.set(e.model, e);
            }
        }
        return {elements, links};
    }

    export function getElementState(index: AuthoringIndex, elementIri: ElementIri): AuthoringKind | undefined {
        const event = index.elements.get(elementIri);
        return event ? event.type : undefined;
    }
}

function isNewElement(change: ElementChange) {
    return !change.before;
}

function linkConnectedToElement(link: LinkModel, elementIri: ElementIri) {
    return link.sourceId === elementIri || link.targetId === elementIri;
}

function isSourceOrTargetChanged(change: LinkChange) {
    const {before, after} = change;
    return before && !(
        before.sourceId === after.sourceId &&
        before.targetId === after.targetId
    );
}

function updateLinkToReferByNewIri(link: LinkModel, oldIri: ElementIri, newIri: ElementIri): LinkModel {
    return {
        ...link,
        sourceId: link.sourceId === oldIri ? newIri : link.sourceId,
        targetId: link.targetId === oldIri ? newIri : link.targetId,
    };
}
