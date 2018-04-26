import { ElementTypeIri, LinkTypeIri, PropertyTypeIri } from '../data/model';

import { FatClassModelEvents, FatLinkTypeEvents, RichPropertyEvents } from '../diagram/elements';
import { DiagramModel } from '../diagram/model';

import { Unsubscribe, Listener } from './events';

export class KeyedObserver<Key extends string> {
    private observedKeys = new Map<string, Unsubscribe>();

    constructor(readonly subscribe: (key: Key) => Unsubscribe | undefined) {}

    observe(keys: ReadonlyArray<Key>) {
        if (keys.length === 0 && this.observedKeys.size === 0) {
            return;
        }
        const newObservedKeys = new Map<string, Unsubscribe>();

        for (const key of keys) {
            if (newObservedKeys.has(key)) { continue; }
            let token = this.observedKeys.get(key);
            if (!token) {
                token = this.subscribe(key);
            }
            newObservedKeys.set(key, token);
        }

        for (const key in this.observedKeys) {
            if (!newObservedKeys.has(key)) {
                const unsubscribe = this.observedKeys.get(key);
                unsubscribe();
            }
        }

        this.observedKeys = newObservedKeys;
    }

    stopListening() {
        this.observe([]);
    }
}

export function observeElementTypes<Event extends keyof FatClassModelEvents>(
    model: DiagramModel, event: Event, listener: Listener<FatClassModelEvents, Event>
) {
    return new KeyedObserver<ElementTypeIri>(key => {
        const type = model.getClass(key);
        if (type) {
            type.events.on(event, listener);
            return () => type.events.off(event, listener);
        }
        return undefined;
    });
}

export function observeProperties<Event extends keyof RichPropertyEvents>(
    model: DiagramModel, event: Event, listener: Listener<RichPropertyEvents, Event>
) {
    return new KeyedObserver<PropertyTypeIri>(key => {
        const property = model.getProperty(key);
        if (property) {
            property.events.on(event, listener);
            return () => property.events.off(event, listener);
        }
        return undefined;
    });
}

export function observeLinkTypes<Event extends keyof FatLinkTypeEvents>(
    model: DiagramModel, event: Event, listener: Listener<FatLinkTypeEvents, Event>
) {
    return new KeyedObserver<LinkTypeIri>(key => {
        const type = model.createLinkType(key);
        if (type) {
            type.events.on(event, listener);
            return () => type.events.off(event, listener);
        }
        return undefined;
    });
}
