declare module "rdf-data-model" {
    export class Stream<Type> {
        on(targetEvent: string, callback: (response: Type) => void): void;
        once(targetEvent: string, callback: (response: Type | Error) => void): void;
    }
    
    export class Quad {
        object: Node;
        predicate: Node;
        subject: Node;
        graph: string;
        equals(other: Quad): boolean;
    }

    export interface Node {
        termType: string;
        value: string;
        equals(other: Node): boolean;
    }

    export class NamedNode implements Node {
        termType: 'NamedNode';
        value: string;
        datatype: string;
        equals(other: NamedNode): boolean;
    }

    export class BlankNode implements Node {
        termType: 'BlankNode';
        value: string;
        datatype: string;
        equals(other: BlankNode): boolean;
    }

    export class Literal {
        termType: 'Literal';
        value: string;
        language: string;
        datatype: string;
        langStringDatatype: string;
        equals(other: Literal): boolean;
    }

    export class Graph {
        value: string;
        termType: string;
        equals(other: Graph): boolean;
    }

    export function namedNode(iri: string): NamedNode;
    export function blankNode(iri: string): BlankNode;
    export function literal(iri: string): Literal;
    export function triple(subject: Node, predicate: Node, object: Node): Quad;
    export function quad(subject: Node, predicate: Node, object: Node, graph?: Graph): Quad;
    export function defaultGraph(iri: string): Graph;
}
