import * as N3 from 'n3';
import { RdfNode, Triple } from './sparql/sparqlModels';

export function n3toRdfNode(entity: string): RdfNode {
    if (N3.Util.isLiteral(entity)) {
        return {type: 'literal', value: N3.Util.getLiteralValue(entity), 'xml:lang': ''};
    } else {
        return {type: 'uri', value: entity};
    }
}

export function parseTurtleText(turtleText: string): Promise<Triple[]> {
    const triples: Triple[] = [];
    return new Promise<Triple[]>((resolve, reject) => {
        N3.Parser().parse(turtleText, (error, triple, hash) => {
            if (error) { reject(error); }

            if (triple) {
                triples.push({
                    subject: n3toRdfNode(triple.subject),
                    predicate: n3toRdfNode(triple.predicate),
                    object: n3toRdfNode(triple.object),
                });
            } else {
                resolve(triples);
            }
        });
    });
}
