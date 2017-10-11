import { Parsers } from 'rdf-ext';
import { Dictionary } from '../model';
import { Stream, Quad } from 'rdf-data-model';

export class RDFCompositeParser {
    private parsers: Parsers;

    constructor(parserMap: Dictionary<any>) {
        this.parsers = new Parsers(parserMap);
    }

    list(): string[] {
        return this.parsers.list();
    }

    import(dataStream: Stream<number[]>, mimeType: string): Stream<Quad> {
        if (!this.parsers.find(mimeType)) {
            throw Error('There is no parser for this MIME type');
        }
        return this.parsers.import(mimeType, dataStream);
    }
}
