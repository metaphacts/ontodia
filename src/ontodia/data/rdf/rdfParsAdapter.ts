import { Parsers } from 'rdf-ext';
import { Dictionary } from '../model';
import { Stream, Quad, namedNode, literal, blankNode, Node, quad } from 'rdf-data-model';

export class RdfParsAdapter {
    constructor(private _super: any) { }
    import(datastream: any): any {
        let fullString = '';

        let onDataCallbacks: ((quad: Quad) => void)[] = [];
        let onDataEndCallbacks: ((quad: Quad) => void)[] = [];
        let onErrorCallbacks: ((error: Error) => void)[] = [];

        let endOfStream = false;
        let parseError: Error;

        datastream.on('data', (bytes: Uint8Array) => {
            fullString += Utf8ArrayToStr(bytes);
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


}

/* utf.js - UTF-8 <=> UTF-16 convertion
*
* Copyright (C) 1999 Masanao Izumo <iz@onicos.co.jp>
* Version: 1.0
* LastModified: Dec 25 1999
* This library is free.  You can redistribute it and/or modify it.
*/
function Utf8ArrayToStr(array: Uint8Array) {
    let out = '';

    for (let i = 0; i < array.length; ) {
        const c = array[i++];
        let char2;
        let char3;
        let char4;
        switch (c >> 4) {
            case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
                // 0xxxxxxx
                out += String.fromCharCode(c);
                break;
            case 12: case 13:
                // 110x xxxx   10xx xxxx
                char2 = array[i++];
                out += String.fromCharCode(
                    ((c & 0x1F) << 6) |
                    (char2 & 0x3F)
                );
                break;
            case 14:
                // 1110 xxxx  10xx xxxx  10xx xxxx
                char2 = array[i++];
                char3 = array[i++];
                out += String.fromCharCode(
                    ((c & 0x0F) << 12) |
                    ((char2 & 0x3F) << 6) |
                    ((char3 & 0x3F) << 0)
                );
                break;
            case 15:
                // 1111 0xxx  10xx xxxx  10xx xxxx  10xx xxxx
                char2 = array[i++];
                char3 = array[i++];
                char4 = array[i++];
                const largeCode = ((c & 0x07) << 18)
                    | ((char2 & 0x3F) << 12)
                    | ((char3 & 0x3F) << 6)
                    | ((char4 & 0x3F) << 0);
                // convert code point >= 0x10000 into surrogate pairs
                const code20bit = largeCode - 0x10000;
                const leadingCode = 0xD800 + ((code20bit & 0xFFC00) >>> 10);
                const trailingCode = 0xDC00 + (code20bit & 0x3FF);
                out += String.fromCharCode(leadingCode, trailingCode);
            default:
                continue;
        }
    }

    return out;
}
