import * as N3 from 'n3';

import { RdfNode, Triple } from './sparqlModels';

export function parseTurtleText(turtleText: string): Promise<Triple[]> {
    return new Promise<Triple[]>((resolve, reject) => {
        const triples: Triple[] = [];
        N3.Parser().parse(turtleText, (error, triple, hash) => {
            if (error) {
                reject(error);
            } else if (triple) {
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

export function n3toRdfNode(entity: string): RdfNode {
    if (N3.Util.isLiteral(entity)) {
        return {
            type: 'literal',
            value: N3.Util.getLiteralValue(entity),
            datatype: N3.Util.getLiteralType(entity),
            'xml:lang': N3.Util.getLiteralLanguage(entity),
        };
    } else {
        return {type: 'uri', value: entity};
    }
}
