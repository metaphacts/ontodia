declare module "rdf-ext" {
    export function createStore(options?: any): RDFStore;

    export function createGraph(triples: Triple[]):RDFGraph;

    export function createNamedNode(value: string): NamedNode;

    export function createLiteral(value: string, language?: string, datatype?: string): Literal;

    export class RDFStore {
        graphs: {
            [id: string]: { _graph: Triple[] };
        };
        add: (id: string, graph: RDFGraph) => void;
        match: (
            subject?: string,
            predicat?: string,
            object?: string,
            iri?: string,
            callback?: (result: any) => void,
            limit?: number
        ) => Promise<RDFGraph>;
    }

    export class RDFGraph {
        toArray: () => Triple[];
        match: (
            subject?: string,
            predicat?: string,
            object?: string,
            iri?: string,
            callback?: (result: any) => void,
            limit?: number
        ) => RDFGraph;
    }

    export class Triple {
        object: Node;
        predicate: Node;
        subject: Node;
    }

    export type Node = NamedNode | Literal | BlankNode;

    export class BlankNode {
        interfaceName: 'BlankNode';
        nominalValue: string;
    }

    export class NamedNode {
        interfaceName: 'NamedNode';
        nominalValue: string;
    }

    export class Literal {
        interfaceName: 'Literal';
        language: string;
        nominalValue: string;
    }
}
