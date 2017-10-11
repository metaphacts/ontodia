declare module "string-to-stream" {
    import { Node, Quad, Graph, Stream  } from 'rdf-data-model';

    function stringToStream(string: string): Stream<number[]>;
    export = stringToStream;
}
