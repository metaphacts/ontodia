import { ElementModel, LinkModel } from '../data/model';

import { Element, Link } from '../diagram/elements';

export interface AuthoringState {
    created: ReadonlyArray<Element | Link>;
    deleted: ReadonlyArray<Element | Link>;
    changed: ReadonlyArray<ElementChange | LinkChange>;
}

export interface ElementChange {
    readonly type: 'element';
    readonly model: ElementModel;
}

export interface LinkChange {
    readonly type: 'link';
    readonly model: LinkModel;
}

export namespace AuthoringState {
    export const empty: AuthoringState = {
        created: [],
        deleted: [],
        changed: [],
    };

    export function set(state: AuthoringState, change: Partial<AuthoringState>): AuthoringState {
        return {...state, ...change};
    }

    export function changeElement(state: AuthoringState, model: ElementModel) {
        const changed = [...state.changed];
        const index = changed.findIndex(change => change.type === 'element' && change.model.id === model.id);
        if (index >= 0) {
            changed.splice(index, 1, {type: 'element', model});
        } else {
            changed.push({type: 'element', model});
        }
        return AuthoringState.set(state, {changed});
    }
}
