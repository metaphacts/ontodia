import {ElementTypeIri, LinkTypeIri, PropertyTypeIri} from '../data/model';

import { FatClassModelEvents, FatLinkTypeEvents, RichPropertyEvents } from '../diagram/elements';
import { DiagramModel } from '../diagram/model';

import { Unsubscribe, Listener } from './events';

export class KeyedObserver<Key extends string> {
    private observedKeys = new Map<string, Unsubscribe>();

    constructor(readonly subscribe: (key: Key) => Unsubscribe | undefined) {}

    observe(keys: ReadonlyArray<Key>) {
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

export function createTypesObserver(model: DiagramModel, listener: Listener<FatClassModelEvents, 'changeLabel'>) {
    return new KeyedObserver<ElementTypeIri>(key => {
        const type = model.getClass(key);
        if (type) {
            type.events.on('changeLabel', listener);
            return () => type.events.off('changeLabel', listener);
        }
        return undefined;
    });
}

export function createPropertiesObserver(model: DiagramModel, listener: Listener<RichPropertyEvents, 'changeLabel'>) {
    return new KeyedObserver<PropertyTypeIri>(key => {
        const property = model.getProperty(key);
        if (property) {
            property.events.on('changeLabel', listener);
            return () => property.events.off('changeLabel', listener);
        }
        return undefined;
    });
}

export function createFatLinkTypeObserver(model: DiagramModel, listener: Listener<FatLinkTypeEvents, 'changeLabel'>) {
    return new KeyedObserver<LinkTypeIri>(key => {
        const type = model.createLinkType(key);
        if (type) {
            type.events.on('changeLabel', listener);
            return () => type.events.off('changeLabel', listener);
        }
        return undefined;
    });
}
