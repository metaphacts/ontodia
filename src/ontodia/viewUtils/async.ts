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

export class DataFetchingThread<Key extends string> extends BatchingScheduler {
    private fetchingPromise: Promise<Key[]>;
    private fetchingQueue: { [key: string]: true } = Object.create(null);

    private resolve: (queue: Key[]) => void;
    private reject: (error: any) => void;

    constructor(waitingTime = 200) {
        super(waitingTime);
    }

    push(key: Key): Promise<Key[]> {
        this.fetchingQueue[key] = true;
        if (this.fetchingPromise) {
            return Promise.resolve([]);
        } else {
            this.fetchingPromise = new Promise<Key[]>((resolve, reject) => {
                this.resolve = resolve;
                this.reject = reject;
                this.schedule();
            });
            return this.fetchingPromise;
        }
    }

    clear() {
        this.fetchingQueue = Object.create(null);
    }

    protected run() {
        const {fetchingQueue, resolve} = this;
        this.fetchingPromise = undefined;
        this.fetchingQueue = Object.create(null);
        this.resolve = undefined;
        this.reject = undefined;
        resolve(Object.keys(fetchingQueue) as Key[]);
    }

    dispose() {
        super.dispose();
        const {reject} = this;
        this.resolve = undefined;
        this.reject = undefined;
        if (reject) {
            reject(new Error('DataFetchingThread was disposed'));
        }
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
