import * as N3 from "n3";
import { RdfNode, Triple } from './sparql/sparqlModels';

export function N3toRdfNode(entity: string): RdfNode {
    if (entity.length >= 2 && entity[0] === '"' && entity[entity.length - 1] === '"') {
        return {type: 'literal', value: entity.substring(1, entity.length - 1), 'xml:lang': ''};
    } else {
        return {type: 'uri', value: entity};
    }
}

export function parseTurtleText(turtleText: string): Promise<Triple[]> {
    const triples: Triple[] = [];
    return new Promise<Triple[]>((resolve, reject) => {
        N3.Parser().parse(turtleText, (error, triple, hash) => {
            if (triple) {
                triples.push({
                    subject: N3toRdfNode(triple.subject),
                    predicate: N3toRdfNode(triple.predicate),
                    object: N3toRdfNode(triple.object),
                });
            } else {
                resolve(triples);
            }
        });
    });
}
