import { ElementModel, LinkModel, ElementIri, sameLink, hashLink } from '../data/model';
import { hashFnv32a } from '../data/utils';
import { ElementError, LinkError } from '../data/validationApi';

import { Element, Link } from '../diagram/elements';
import { DiagramModel } from '../diagram/model';

import { HashMap, ReadonlyHashMap, cloneMap } from '../viewUtils/collections';

export interface AuthoringState {
    readonly events: ReadonlyArray<AuthoringEvent>;
    readonly index: AuthoringIndex;
}

export type AuthoringEvent =
    | ElementChange
    | ElementDeletion
    | LinkChange
    | LinkDeletion;

export enum AuthoringKind {
    ChangeElement = 'changeElement',
    DeleteElement = 'deleteElement',
    ChangeLink = 'changeLink',
    DeleteLink = 'deleteLink',
}

export interface ElementDeletion {
    readonly type: AuthoringKind.DeleteElement;
    readonly model: ElementModel;
}

export interface LinkDeletion {
    readonly type: AuthoringKind.DeleteLink;
    readonly model: LinkModel;
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
    readonly elements: ReadonlyMap<ElementIri, ElementChange | ElementDeletion>;
    readonly links: ReadonlyHashMap<LinkModel, LinkChange | LinkDeletion>;
}

export namespace AuthoringState {
    export const empty: AuthoringState = {
        events: [],
        index: makeIndex([]),
    };

    export function set(state: AuthoringState, change: Pick<AuthoringState, 'events'>): AuthoringState {
        const events = change.events || state.events;
        const index = makeIndex(events);
        return {...state, events, index};
    }

    export function discard(state: AuthoringState, discarded: AuthoringEvent): AuthoringState {
        const index = state.events.indexOf(discarded);
        if (index < 0) {
            return state;
        }
        const newElementIri = discarded.type === AuthoringKind.ChangeElement && !discarded.before
            ? discarded.after.id : undefined;
        const events = state.events.filter(e => {
            if (e.type === AuthoringKind.ChangeLink) {
                if (newElementIri && isLinkConnectedToElement(e.after, newElementIri)) {
                    return false;
                }
            }
            return e !== discarded;
        });
        return set(state, {events});
    }

    export function addElement(state: AuthoringState, item: ElementModel) {
        const event: ElementChange = {type: AuthoringKind.ChangeElement, after: item};
        return AuthoringState.set(state, {events: [...state.events, event]});
    }

    export function addLink(state: AuthoringState, item: LinkModel) {
        const event: LinkChange = {type: AuthoringKind.ChangeLink, after: item};
        return AuthoringState.set(state, {events: [...state.events, event]});
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
        let previousBefore: ElementModel | undefined = before;
        const additional: AuthoringEvent[] = [];
        const events = state.events.filter(e => {
            if (e.type === AuthoringKind.DeleteElement) {
                if (e.model.id === before.id) {
                    previousBefore = e.model;
                    return false;
                }
            } else if (e.type === AuthoringKind.ChangeElement) {
                if (e.after.id === before.id) {
                    previousBefore = e.before;
                    return false;
                }
            } else if (e.type === AuthoringKind.ChangeLink) {
                if (iriChanged && isLinkConnectedToElement(e.after, before.id)) {
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
        additional.unshift({
            type: AuthoringKind.ChangeElement,
            before: previousBefore,
            after: after,
        });
        return AuthoringState.set(state, {events: [...events, ...additional]});
    }

    export function changeLink(state: AuthoringState, before: LinkModel, after: LinkModel) {
        if (!sameLink(before, after)) {
            throw new Error('Cannot move link to another element or change its type');
        }
        let previousBefore: LinkModel | undefined = before;
        const events = state.events.filter(e => {
            if (e.type === AuthoringKind.ChangeLink) {
                if (sameLink(e.after, before)) {
                    previousBefore = e.before;
                    return false;
                }
            }
            return true;
        });
        const event: AuthoringEvent = {
            type: AuthoringKind.ChangeLink,
            before: previousBefore,
            after: after,
        };
        return AuthoringState.set(state, {events: [...events, event]});
    }

    export function deleteElement(state: AuthoringState, model: ElementModel) {
        const events = state.events.filter(e => {
            if (e.type === AuthoringKind.ChangeElement) {
                if (e.after.id === model.id) {
                    return false;
                }
            } else if (e.type === AuthoringKind.ChangeLink) {
                if (isLinkConnectedToElement(e.after, model.id)) {
                    return false;
                }
            } else if (e.type === AuthoringKind.DeleteLink) {
                if (isLinkConnectedToElement(e.model, model.id)) {
                    return false;
                }
            }
            return true;
        });

        if (!isNewElement(state, model.id)) {
            events.push({type: AuthoringKind.DeleteElement, model});
        }
        return AuthoringState.set(state, {events});
    }

    export function deleteLink(state: AuthoringState, target: LinkModel) {
        const events = state.events.filter(e => {
            if (e.type === AuthoringKind.ChangeLink) {
                if (sameLink(e.after, target)) {
                    return false;
                }
            } else if (e.type === AuthoringKind.DeleteLink) {
                if (sameLink(e.model, target)) {
                    return false;
                }
            }
            return true;
        });
        if (!isNewLink(state, target)) {
            events.push({
                type: AuthoringKind.DeleteLink,
                model: target,
            });
        }
        return AuthoringState.set(state, {events});
    }

    function makeIndex(events: ReadonlyArray<AuthoringEvent>): AuthoringIndex {
        const elements = new Map<ElementIri, ElementChange | ElementDeletion>();
        const links = new HashMap<LinkModel, LinkChange | LinkDeletion>(hashLink, sameLink);
        for (const e of events) {
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

    export function isNewElement(state: AuthoringState, elementIri: ElementIri): boolean {
        const event = state.index.elements.get(elementIri);
        return event && event.type === AuthoringKind.ChangeElement && !event.before;
    }

    export function isNewLink(state: AuthoringState, linkModel: LinkModel): boolean {
        const event = state.index.links.get(linkModel);
        return event && event.type === AuthoringKind.ChangeLink && !event.before;
    }
}

export interface TemporaryState {
    readonly elements: ReadonlyMap<ElementIri, ElementModel>;
    readonly links: ReadonlyHashMap<LinkModel, LinkModel>;
}

export namespace TemporaryState {
    export const empty: TemporaryState = {
        elements: new Map<ElementIri, ElementModel>(),
        links: new HashMap<LinkModel, LinkModel>(hashLink, sameLink),
    };

    export function addElement(state: TemporaryState, element: ElementModel) {
        const elements = cloneMap(state.elements);
        elements.set(element.id, element);
        return {...state, elements};
    }

    export function deleteElement(state: TemporaryState, element: ElementModel) {
        const elements = cloneMap(state.elements);
        elements.delete(element.id);
        return {...state, elements};
    }

    export function addLink(state: TemporaryState, link: LinkModel) {
        const links = state.links.clone();
        links.set(link, link);
        return {...state, links};
    }
    export function deleteLink(state: TemporaryState, link: LinkModel) {
        const links = state.links.clone();
        links.delete(link);
        return {...state, links};
    }
}

export interface ValidationState {
   readonly elements: ReadonlyMap<ElementIri, ElementValidation>;
   readonly links: ReadonlyHashMap<LinkModel, LinkValidation>;
}

export interface ElementValidation {
    readonly loading: boolean;
    readonly errors: ReadonlyArray<ElementError>;
}

export interface LinkValidation {
    readonly loading: boolean;
    readonly errors: ReadonlyArray<LinkError>;
}

export namespace ValidationState {
    export const empty: ValidationState = createMutable();
    export const emptyElement: ElementValidation = {loading: false, errors: []};
    export const emptyLink: LinkValidation = {loading: false, errors: []};

    export function createMutable() {
        return {
            elements: new Map<ElementIri, ElementValidation>(),
            links: new HashMap<LinkModel, LinkValidation>(hashLink, sameLink),
        };
    }

    export function setElementErrors(
        state: ValidationState, target: ElementIri, errors: ReadonlyArray<ElementError>
    ): ValidationState {
        const elements = cloneMap(state.elements);
        if (errors.length > 0) {
            elements.set(target, {loading: false, errors});
        } else {
            elements.delete(target);
        }
        return {...state, elements};
    }
}

export function isLinkConnectedToElement(link: LinkModel, elementIri: ElementIri) {
    return link.sourceId === elementIri || link.targetId === elementIri;
}

function updateLinkToReferByNewIri(link: LinkModel, oldIri: ElementIri, newIri: ElementIri): LinkModel {
    return {
        ...link,
        sourceId: link.sourceId === oldIri ? newIri : link.sourceId,
        targetId: link.targetId === oldIri ? newIri : link.targetId,
    };
}
