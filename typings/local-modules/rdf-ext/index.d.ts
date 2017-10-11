declare module "rdf-ext" {
    import { Node, Quad, Graph, Stream, NamedNode, BlankNode, Literal } from 'rdf-data-model';
    import SimpleDataset = require('rdf-dataset-simple');
    
    export function waitFor(stream: any): Promise<any>;

    export class Parser {
        import(data: Stream<number[]>): Stream<Quad>;
    }

    export class Parsers {
        constructor(parserMap: { [mimeType: string]: Parser });
        import(mimeType: string, data: any): Stream<Quad>;
        find(mimeType: string): Parser;
        list(): string[];
    }

    export const factory: {
        namedNode(iri: string): NamedNode,
        blankNode(iri: string): BlankNode,
        literal(iri: string): Literal,
        triple(subject: Node, predicate: Node, object: Node): Quad,
        quad(subject: Node, predicate: Node, object: Node, graph?: Graph): Quad,
        defaultGraph(iri: string): Graph,
        dataset(quads: Quad[]): SimpleDataset;
    }
}
