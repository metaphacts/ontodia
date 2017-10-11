import { Parsers } from 'rdf-ext';
import { Dictionary } from '../model';
import { Stream, Quad, namedNode, literal, blankNode, Node, quad } from 'rdf-data-model';

export class RDFParsAdapter {
    constructor(private _super: any) { }
    import(datastream: any): any {
        let fullString = '';

        let onDataCallbacks: ((quad: Quad) => void)[] = [];
        let onDataEndCallbacks: ((quad: Quad) => void)[] = [];
        let onErrorCallbacks: ((error: Error) => void)[] = [];

        let endOfStream = false;
        let parseError: Error;

        datastream.on('data', (bytes: number[]) => {
            fullString += this.byteArrayToString(bytes);
        });

        datastream.on('end', () => {
            this._super.parse(fullString).then((rdfGraph: any) => {
                const quads = this.triplesToQuads(rdfGraph.toArray());

                if (onDataCallbacks) {
                    for (const quad of quads) {
                        for (const callback of onDataCallbacks) {
                            callback(quad);
                        }
                    }
                }
                endOfStream = true;
                if (onDataEndCallbacks) {
                    for (const callback of onDataEndCallbacks) {
                        callback(null);
                    }
                }
            }).catch((error: Error) => {
                parseError = error;
                endOfStream = true;
                if (onErrorCallbacks) {
                    for (const callback of onErrorCallbacks) {
                        callback(error);
                    }
                }
            });
        });

        const on = (event: string, calback: (data?: (Quad | Error)) => void) => {
            if (event === 'data') {
                onDataCallbacks.push(calback);
            } else if (event === 'end') {
                onDataEndCallbacks.push(calback);
                if (endOfStream) {
                    calback(null);
                }
            } else if (event === 'error') {
                onErrorCallbacks.push(calback);
                if (parseError) {
                    calback(parseError);
                }
            }
        };

        return {
            on: on,
            once: on,
        };
    }

    private tripleToQuad(triple: any): Quad {
        return quad(
            this.createNode(triple.subject),
            this.createNode(triple.predicate),
            this.createNode(triple.object),
        );
    }

    private createNode(oldTerm: any): Node {
        switch (oldTerm.interfaceName) {
            case 'Literal': return literal(oldTerm.nominalValue);
            case 'NamedNode': return namedNode(oldTerm.nominalValue);
            case 'BlankNode': return blankNode(oldTerm.nominalValue);
            default: return namedNode(oldTerm.nominalValue);
        }
    }

    private triplesToQuads(triples: any[]): Quad[] {
        return triples.map(t => this.tripleToQuad(t));
    }

    private byteArrayToString(bytes: number[]) {
        let line = '';
        for (const b of bytes) {
            line += String.fromCharCode(b);
        }
        return line;
    }
}
