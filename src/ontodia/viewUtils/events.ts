import * as Backbone from 'backbone';

type Listener<T> = (data: T) => void;
type Unsubscribe = () => void;

export interface Event<T> {
    listen(listener: Listener<T>): Unsubscribe;
}

export class EventSource<T = undefined> {
    private listeners: { [key: number]: Listener<T> } = {};
    private nextKey = 1;

    private listen = (listener: Listener<T>): Unsubscribe => {
        const key = this.nextKey++;
        this.listeners[key] = listener;
        return () => this.stopListening(key);
    }

    private stopListening(key: number) {
        delete this.listeners[key];
    }

    readonly event: Event<T> = {
        listen: this.listen,
    };

    trigger(data: T) {
        for (const key in this.listeners) {
            if (!this.listeners.hasOwnProperty(key)) { continue; }
            const listener = this.listeners[key];
            listener(data);
        }
    }
}

export class EventObserver {
    private backbone = new Backbone.Model();
    private onDispose: Array<Unsubscribe> = [];

    listen<T>(event: Event<T>, listener: Listener<T>) {
        this.onDispose.push(event.listen(listener));
    }

    listenTo(source: Backbone.Events, events: string, listener: Function) {
        this.backbone.listenTo(source, events, listener);
    }

    stopListening() {
        for (const unsubscribe of this.onDispose) {
            unsubscribe();
        }
        this.onDispose.length = 0;
    }
}
