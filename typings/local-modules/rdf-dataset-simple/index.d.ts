declare module "rdf-dataset-simple" {
    import { Node, Quad, Graph, Stream  } from 'rdf-data-model';

    class SimpleDataset {
        constructor (quads?: Quad[], factory?: { dataset(quads: Quad[]): SimpleDataset});

        match(
            subject?: Node,
            predicat?: Node,
            object?: Node,
            graph?: Graph,
        ): SimpleDataset;

        import(dataStream: Stream<Quad>): Promise<Quad>;
        add(quad: Quad): void;
        addAll(quads: Quad[]): void;
        merge(other: SimpleDataset): SimpleDataset;

        toArray(): Quad[];
        toStream(): Stream<Quad>;

        clone(): SimpleDataset;
        forEach(calback: (quad: Quad) => void): void;
        includes(quad: Quad): boolean;
        
        _quads: Quad[];
        _dataFactory(quads: Quad[]): SimpleDataset;
        readonly length: number;
    }

    export = SimpleDataset;

    // export default Dataset;
}
