import { last } from 'lodash';

import { EventSource, Events } from '../viewUtils/events';

import { DiagramModel } from './model';

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
        const perform = create(title, () => {
            body();
            return create(title, () => perform);
        });
        return perform;
    }
}

export interface CommandHistoryEvents {
    historyChanged: {};
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
        // do nothing
    }
    undo() {
        throw new Error('Undo is unsupported');
    }
    redo() {
        throw new Error('Redo is unsupported');
    }

    execute(command: Command) {
        command.invoke();
    }
    registerToUndo(command: Command) {
        // do nothing
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
