import { Events, EventSource } from './events';

export abstract class BatchingScheduler {
    private useAnimationFrame: boolean;
    private scheduled: number | undefined;

    constructor(readonly waitingTime = 0) {
        this.useAnimationFrame = waitingTime === 0;
        this.runSynchronously = this.runSynchronously.bind(this);
    }

    protected schedule() {
        if (typeof this.scheduled === 'undefined') {
            if (this.useAnimationFrame) {
                this.scheduled = requestAnimationFrame(this.runSynchronously);
            } else {
                this.scheduled = setTimeout(this.runSynchronously, this.waitingTime);
            }
        }
    }

    protected abstract run(): void;

    runSynchronously() {
        const wasScheduled = this.cancelScheduledTimeout();
        if (wasScheduled) {
            this.run();
        }
    }

    dispose() {
        this.cancelScheduledTimeout();
    }

    private cancelScheduledTimeout(): boolean {
        if (typeof this.scheduled !== 'undefined') {
            if (this.useAnimationFrame) {
                cancelAnimationFrame(this.scheduled);
            } else {
                clearTimeout(this.scheduled);
            }
            this.scheduled = undefined;
            return true;
        }
        return false;
    }
}

export class BufferingQueue<Key extends string> extends BatchingScheduler {
    private fetchingQueue: { [key: string]: true } = Object.create(null);

    constructor(
        private onFetch: (keys: Key[]) => void,
        waitingTime = 200
    ) {
        super(waitingTime);
    }

    push(key: Key) {
        this.fetchingQueue[key] = true;
        this.schedule();
    }

    clear() {
        this.fetchingQueue = Object.create(null);
    }

    protected run() {
        const {fetchingQueue, onFetch} = this;
        this.fetchingQueue = Object.create(null);
        onFetch(Object.keys(fetchingQueue) as Key[]);
    }
}

export class Debouncer extends BatchingScheduler {
    private callback: (() => void) | undefined;

    call(callback: () => void) {
        this.callback = callback;
        this.schedule();
    }

    protected run() {
        const callback = this.callback;
        callback();
    }
}

export class Cancellation {
    private source: EventSource<{ abort: undefined }> | undefined = new EventSource();
    private aborted = false;

    readonly signal: CancellationToken;

    constructor() {
        this.signal = new (class {
            constructor(private parent: Cancellation) {}
            get aborted() { return this.parent.aborted; }
            addEventListener(event: 'abort', handler: () => void) {
                if (event !== 'abort') { return; }
                if (this.parent.source) {
                    this.parent.source.on('abort', handler);
                } else {
                    handler();
                }
            }
            removeEventListener(event: 'abort', handler: () => void) {
                if (event !== 'abort') { return; }
                if (this.parent.source) {
                    this.parent.source.off('abort', handler);
                }
            }
        })(this);
    }

    abort() {
        if (this.aborted) { return; }
        this.aborted = true;
        this.source.trigger('abort', undefined);
        this.source = undefined;
    }
}

export interface CancellationToken {
    readonly aborted: boolean;
    addEventListener(event: 'abort', handler: () => void): void;
    removeEventListener(event: 'abort', handler: () => void): void;
}

export class CancelledError extends Error {
    constructor(message: string) {
        super(message);
        this.name = CancelledError.name;
        Object.setPrototypeOf(this, CancelledError.prototype);
    }
}
