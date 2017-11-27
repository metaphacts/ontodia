import { Parsers } from 'rdf-ext';
import { Dictionary } from '../model';
import { Stream, Quad } from 'rdf-data-model';

export enum ReaderState {
    reading,
    success,
    fail,
}

export type StreamReader<Type> = {
    mimeType: string,
    stream: Stream<Type>,
    state: ReaderState,
};

export class RDFCompositeParser {
    private parsers: Parsers;

    constructor(parserMap: Dictionary<any>) {
        this.parsers = new Parsers(parserMap);
    }

    list(): string[] {
        return this.parsers.list();
    }

    import(dataStream: Stream<number[]>, mimeType?: string): Stream<Quad> {
        if (!mimeType || !this.parsers.find(mimeType)) {
            return this.tryToGuess(dataStream);
        }
        return this.parsers.import(mimeType, dataStream);
    }

    private tryToGuess(dataStream: Stream<number[]>): Stream<Quad> {
        const readers: StreamReader<Quad>[] = this.parsers.list().map(
            mimeType => ({
                mimeType: mimeType,
                state: ReaderState.reading,
                stream: this.parsers.import(mimeType, dataStream),
            }),
        );
        const results: {[id: string]: Quad[]} = {};

        for (let reader of readers) {
            results[reader.mimeType] = [];

            reader.stream.once('end', () => {
                reader.state = ReaderState.success;
                if (isParsingCompleted()) {
                    onParsingCompleted();
                }
            });

            reader.stream.once('error', () => {
                reader.state = ReaderState.fail;
                if (isParsingCompleted()) {
                    onParsingCompleted();
                }
            });

            reader.stream.on('data', (quad) => {
                results[reader.mimeType].push(quad);
            });
        }

        let parseError: Error = null;
        let endOfStream = false;
        const onDataCallbacks: ((data?: Quad) => void)[] = [];
        const onEndCallbacks: ((data?: Quad) => void)[] = [];
        const onErrorCallbacks: ((data?: Error) => void)[] = [];

        return {
            on: on,
            once: on,
        };

        function on(event: string, calback: (data?: any) => void) {
            if (event === 'data') {
                onDataCallbacks.push(calback);
            } else if (event === 'end') {
                onEndCallbacks.push(calback);
                if (endOfStream) {
                    calback(null);
                }
            } else if (event === 'error') {
                onErrorCallbacks.push(calback);
                if (parseError) {
                    calback(parseError);
                }
            }
        };

        function onParsingCompleted() {
            endOfStream = true;
            const successReader = readers.find(reader => reader.state === ReaderState.success);
            if (successReader) {
                console.warn(`It's figured out that the file MIME type is ${successReader.mimeType}`);
                ;
                for (const quad of results[successReader.mimeType]) {
                    for (const callback of onDataCallbacks) {
                        callback(quad);
                    }
                }
                for (const callback of onEndCallbacks) {
                    callback(null);
                }
            } else {
                parseError = Error('There is no parser for this MIME type');
                for (const callback of onErrorCallbacks) {
                    callback(parseError);
                }
            }
        }

        function isParsingCompleted() {
            return readers.filter(
                reader => reader.state === ReaderState.reading
            ).length === 0;
        }
    }
}
