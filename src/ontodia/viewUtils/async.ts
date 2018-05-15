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
    private signal: Promise<never>;
    private reject: ((error: CancelledError) => void) | undefined;

    readonly token: CancellationToken;

    constructor() {
        this.signal = new Promise((resolve, reject) => {
            this.reject = reject;
        });
        this.token = new (class {
            constructor(private parent: Cancellation) {}
            get cancelled() { return this.parent.cancelled; }
            get signal() { return this.parent.signal; }
        })(this);
    }

    get cancelled(): boolean {
        return Boolean(this.reject);
    }

    cancel() {
        const {reject} = this;
        if (reject) {
            this.reject = undefined;
            reject(new CancelledError('Task was cancelled'));
        }
    }
}

export interface CancellationToken {
    readonly cancelled: boolean;
    readonly signal: Promise<never>;
}

export class CancelledError extends Error {
    constructor(message: string) {
        super(message);
        this.name = CancelledError.name;
        Object.setPrototypeOf(this, CancelledError.prototype);
    }
}

AbortController;
