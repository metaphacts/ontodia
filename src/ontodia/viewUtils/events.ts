import { createNumberMap, createStringMap, hasOwnProperty } from './collections';

export type Listener<Data, Key extends keyof Data> = (data: Data[Key], key: Key) => void;
export type AnyListener<Data> = (data: Partial<Data>, key: string) => void;
export type Unsubscribe = () => void;

export interface PropertyChange<Source, Value> {
    source: Source;
    previous: Value;
}

export interface AnyEvent<Data> {
    key: string;
    data: Partial<Data>;
}

export interface Events<Data> {
    on<Key extends keyof Data>(eventKey: Key, listener: Listener<Data, Key>): void;
    off<Key extends keyof Data>(eventKey: Key, listener: Listener<Data, Key>): void;
    onAny(listener: AnyListener<Data>): void;
    offAny(listener: AnyListener<Data>): void;
}

export class EventSource<Data> implements Events<Data> {
    private listeners = createStringMap<any>() as { [K in keyof Data]?: Array<Listener<Data, K>> };
    private anyListeners: Array<AnyListener<Data>> | undefined;

    on<Key extends keyof Data>(eventKey: Key, listener: Listener<Data, Key>): void {
        let listeners = this.listeners[eventKey];
        if (!listeners) {
            listeners = [];
            this.listeners[eventKey] = listeners;
        }
        listeners.push(listener);
    }

    onAny(listener: AnyListener<Data>): void {
        let listeners = this.anyListeners;
        if (!listeners) {
            listeners = [];
            this.anyListeners = listeners;
        }
        listeners.push(listener);
    }

    off<Key extends keyof Data>(eventKey: Key, listener: Listener<Data, Key>): void {
        const listeners = this.listeners[eventKey];
        if (!listeners) { return; }
        const index = listeners.indexOf(listener);
        if (index >= 0) {
            listeners.splice(index, 1);
        }
    }

    offAny(listener: AnyListener<Data>): void {
        const listeners = this.anyListeners;
        if (!listeners) { return; }
        const index = listeners.indexOf(listener);
        if (index >= 0) {
            listeners.splice(index, 1);
        }
    }

    trigger<Key extends keyof Data>(eventKey: Key, data: Data[Key]): void {
        const listeners = this.listeners[eventKey];
        if (listeners) {
            for (const listener of listeners) {
                listener(data, eventKey);
            }
        }

        if (this.anyListeners) {
            for (const anyListener of this.anyListeners) {
                anyListener({[eventKey]: data} as any, eventKey as string);
            }
        }
    }
}

export class EventObserver {
    private unsubscribeByKey = createStringMap<Unsubscribe[]>();
    private onDispose: Array<Unsubscribe> = [];

    listen<Data, Key extends keyof Data>(
        events: Events<Data>, eventKey: Key, listener: Listener<Data, Key>
    ) {
        events.on(eventKey, listener);
        this.onDispose.push(() => events.off(eventKey, listener));
    }

    listenAny<Data>(events: Events<Data>, listener: AnyListener<Data>) {
        events.onAny(listener);
        this.onDispose.push(() => events.offAny(listener));
    }

    listenOnce<Data, Key extends keyof Data>(
        events: Events<Data>, eventKey: Key, listener: Listener<Data, Key>
    ) {
        let handled = false;
        const onceListener: Listener<Data, Key> = (data, key) => {
            handled = true;
            events.off(eventKey, onceListener);
            listener(data, key);
        };
        events.on(eventKey, onceListener);
        this.onDispose.push(() => {
            if (handled) { return; }
            events.off(eventKey, onceListener);
        });
    }

    stopListening() {
        for (const unsubscribe of this.onDispose) {
            unsubscribe();
        }
        this.onDispose.length = 0;

        for (const key in this.unsubscribeByKey) {
            if (!hasOwnProperty(this.unsubscribeByKey, key)) { continue; }
            const unsubscribers = this.unsubscribeByKey[key];
            for (const unsubscribe of unsubscribers) {
                unsubscribe();
            }
        }
        this.unsubscribeByKey = {};
    }
}
