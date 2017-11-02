import * as Backbone from 'backbone';

export type Listener<T> = (data: T) => void;
export type Unsubscribe = () => void;

export class Event<T = undefined> {
    private listeners: { [key: number]: Listener<T> } = {};
    private nextKey = 1;

    constructor(readonly owner: EventSource) {}

    listen(listener: Listener<T>): Unsubscribe {
        const key = this.nextKey++;
        this.listeners[key] = listener;
        return () => this.stopListening(key);
    }

    private stopListening(key: number) {
        delete this.listeners[key];
    }

    trigger(owner: EventSource, data: T) {
        if (owner !== this.owner) {
            throw new Error('Cannot trigger event using invalid owner');
        }
        for (const key in this.listeners) {
            if (!this.listeners.hasOwnProperty(key)) { continue; }
            const listener = this.listeners[key];
            listener(data);
        }
    }
}

export class EventSource {
    createEvent(): Event<any> {
        return new Event(this);
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
        this.backbone.stopListening();
    }
}
