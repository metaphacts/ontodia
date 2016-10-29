const DEFAULT_WAITING_TIME = 200;

export class DataFetchingThread {
    private fetchingPromise: Promise<string[]> = null;
    private fetchingQueue: string[] = [];
    private waitingTime: number;

    constructor(waitingTime?: number) {
        this.waitingTime = waitingTime || DEFAULT_WAITING_TIME;
    }

    public startFetchingThread(typeId: string): Promise<string[]> {
        this.fetchingQueue.push(typeId);
        if (this.fetchingPromise) {
            return Promise.resolve([]);
        } else {
            this.fetchingPromise = new Promise<string[]>((resolve) => {
                setTimeout(() => {
                    this.fetchingPromise = null;
                    const queue = this.fetchingQueue;
                    this.fetchingQueue = [];
                    resolve(queue);
                }, 200);
            });
            return this.fetchingPromise;
        }
    }

}
