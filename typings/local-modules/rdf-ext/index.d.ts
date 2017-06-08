declare module "rdf-ext" {
    export function createStore(options?: any): RDFStore;

    export function createGraph(triples: Triple[]):RDFGraph;

    export class RDFStore {
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

    export type Node = NamedNode | Literal;

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
