import { EventSource, Events } from '../viewUtils/events';

export interface Command {
    readonly title?: string;
    readonly invoke: CommandAction;
}

/** @returns Inverse command */
export type CommandAction = () => Command;

export namespace Command {
    export function create(title: string, action: CommandAction): Command {
        return {title, invoke: action};
    }

    export function effect(title: string, body: () => void): Command {
        const perform = {
            title,
            invoke: () => {
                body();
                return skip;
            }
        };
        const skip = {
            title: 'Skipped effect: ' + title,
            invoke: () => perform,
        };
        return perform;
    }
}

export interface CommandHistoryEvents {
    historyChanged: { hasChanges: boolean };
}

export interface CommandHistory {
    readonly events: Events<CommandHistoryEvents>;
    readonly undoStack: ReadonlyArray<Command>;
    readonly redoStack: ReadonlyArray<Command>;
    reset(): void;
    undo(): void;
    redo(): void;
    execute(command: Command): void;
    registerToUndo(command: Command): void;
    startBatch(title?: string): Batch;
}

export interface Batch {
    readonly history: CommandHistory;
    store(): void;
    discard(): void;
}

export class NonRememberingHistory implements CommandHistory {
    private readonly source = new EventSource<CommandHistoryEvents>();
    readonly events: Events<CommandHistoryEvents> = this.source;

    readonly undoStack: ReadonlyArray<Command> = [];
    readonly redoStack: ReadonlyArray<Command> = [];

    reset() {
        this.source.trigger('historyChanged', {hasChanges: false});
    }
    undo() {
        throw new Error('Undo is unsupported');
    }
    redo() {
        throw new Error('Redo is unsupported');
    }

    execute(command: Command) {
        command.invoke();
        this.source.trigger('historyChanged', {hasChanges: true});
    }
    registerToUndo(command: Command) {
        this.source.trigger('historyChanged', {hasChanges: true});
    }
    startBatch(title?: string): Batch {
        return {
            history: this,
            store: this.storeBatch,
            discard: this.discardBatch,
        };
    }
    private storeBatch = () => {/* nothing */};
    private discardBatch = () => {/* nothing */};
}
