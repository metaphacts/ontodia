import { waitFor } from 'rdf-ext';
import { Node, Quad, Graph, Literal, NamedNode, Stream, namedNode } from 'rdf-data-model';
import SimpleDataset = require('rdf-dataset-simple');
import { Dictionary } from '../model';
import { RDFCompositeParser } from './rdfCompositeParser';
import { uniqueId } from 'lodash';

const DEFAULT_STORAGE_TYPE = 'text/turtle';
const DEFAULT_STORAGE_URI = 'http://ontodia.org/defaultGraph';
const RDF_TYPE = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');

export function prefixFactory(prefix: string): ((id: string) => string) {
    const lastSymbol = prefix[prefix.length - 1];
    const _prefix = lastSymbol === '/' || lastSymbol === '#' ? prefix : prefix + '/';
    return (id: string) => {
        return _prefix + id;
    };
}

export function isLiteral(el: Node): el is Literal {
    return el.termType === 'Literal';
}

export function isNamedNode(el: Node): el is NamedNode {
    return el.termType === 'NamedNode';
}

export type MatchStatement = {
    subject?: Node,
    predicate?: Node,
    object?: Node,
    graph?: Graph,
};

export const LABEL_URIS = [
    namedNode('http://www.w3.org/2004/02/skos/core#prefLabel'),
    'http://www.w3.org/2004/02/skos/core#label',
    'http://www.w3.org/2004/02/skos/core#altLabel',
    'http://www.w3.org/2000/01/rdf-schema#prefLabel',
    'http://www.w3.org/2000/01/rdf-schema#label',
    'http://xmlns.com/foaf/0.1/name',
    'http://schema.org/name',
];

export const LABEL_POSTFIXES = [
    'prefLabel',
    'prefName',
    'label',
    'name',
    'title',
];

export class RDFCacheableStore {
    private _super: SimpleDataset;
    private labelsMap: Dictionary<Quad[]> = {};
    private countMap: Dictionary<number> = {};
    private elementTypes: Dictionary<Quad[]> = {};

    constructor(quads?: Quad[]) {
        this._super = new SimpleDataset(quads);
        this._super.add = (quad: Quad) => {
            this._super._quads.push(quad);
        };
    }

    import(dataStream: Stream<Quad>): Promise<any> {
        dataStream.on('data', this.indexData);
        return this._super.import(dataStream);
    }

    get length () {
        return this._super.length;
    }

    toArray(): Quad[] {
        return this._super.toArray();
    }

    add(quad: Quad) {
        this.indexData(quad);
        this._super.add(quad);
    }

    addAll(quads: Quad[]) {
        for (const quad of quads) {
            this.indexData(quad);
        }
        this._super.addAll(quads);
    }

    match(
        subject?: Node,
        predicate?: Node,
        object?: Node,
        graph?: Graph,
    ): SimpleDataset {
        if (subject && predicate && (
                LABEL_URIS.indexOf(predicate.value) !== -1 || predicate.equals(RDF_TYPE)
            ) && !object
        ) {
            if (predicate.equals(RDF_TYPE)) {
                return this.getTypes(subject.value);
            } else {
                return this.getLabels(subject.value);
            }
        } else {
            return this._super.match(
                subject,
                predicate,
                object,
                graph,
            );
        }
    }

    matchAll(statements: MatchStatement[]): SimpleDataset {
        const slowQueries: MatchStatement[] = [];
        const responses: SimpleDataset[] = [];

        statements.forEach(statement => {
            if (
                statement.subject &&
                statement.predicate &&
                (LABEL_URIS.indexOf(statement.predicate.value) !== -1 || statement.predicate.equals(RDF_TYPE)) &&
                !statement.object
            ) {
                if (statement.predicate.equals(RDF_TYPE)) {
                    responses.push(this.getTypes(statement.subject.value));
                } else {
                    responses.push(this.getLabels(statement.subject.value));
                }
            } else {
                slowQueries.push(statement);
            }
        });

        responses.push(this.multipleMatch(slowQueries));

        return this.mergeDatasets(responses); // fix it.
    }

    getLabels(id: string): SimpleDataset {
        return new SimpleDataset(this.labelsMap[id]);
    }

    // Checks whetger the element is in the storage.
    isIncludes(id: string): boolean {
        return (
            this.labelsMap[id] !== undefined ||
            this._super.match(namedNode(id), null, null).length > 0
        );
    }

    getTypeCount(id: string): number {
        return this.countMap[id] || 0;
    }

    private indexData = (quad: Quad) => {
        const subject = quad.subject.value;
        const predicate = quad.predicate.value;
        const object = quad.object.value;
        if (
            LABEL_URIS.indexOf(predicate) !== -1 ||
            (
                !this.labelsMap[subject] &&
                LABEL_POSTFIXES.find((value, index, array) => {
                    const type = predicate.toLocaleLowerCase();
                    const postfix = value.toLocaleLowerCase();
                    return type.indexOf(postfix) !== -1;
                })
            )
        ) {
            if (!this.labelsMap[subject]) {
                this.labelsMap[subject] = [];
            }
            if (isLiteral(quad.object)) {
                this.labelsMap[subject].push(quad);
                this.labelsMap[subject].sort((a, b) => {
                    const index1 = LABEL_URIS.indexOf(a.predicate.value);
                    const index2 = LABEL_URIS.indexOf(b.predicate.value);
                    if (index1 > index2) {
                        return 1;
                    } else if (index1 < index2) {
                        return -1;
                    } else {
                        return 0;
                    }
                });
            }
        } else if (quad.predicate.equals(RDF_TYPE)) {
            if (!this.elementTypes[object]) {
                this.elementTypes[object] = [];
                this.countMap[object] = 0;
            }
            this.elementTypes[object].push(quad);
            this.countMap[object] = this.elementTypes[object].length;
        }
    }

    private mergeDatasets(datasets: SimpleDataset[]): SimpleDataset {
        let compositeDataset;
        for (const ds of datasets) {
            if (!compositeDataset) {
                compositeDataset = ds;
            } else {
                compositeDataset = compositeDataset.merge(ds);
            }
        }
        return compositeDataset;
    }

    private getTypes(id: string): SimpleDataset {
        return new SimpleDataset(this.elementTypes[id]);
    }

    private multipleMatch(statements: MatchStatement[]): SimpleDataset {
        const foundQuads: Quad[] = [];
        for (const quad of this._super._quads) {
            for (const statement of statements) {
                if (
                    ((!statement.object) || statement.object.equals(quad.object)) &&
                    ((!statement.predicate) || statement.predicate.equals(quad.predicate)) &&
                    ((!statement.subject) || statement.subject.equals(quad.subject))
                ) {
                    foundQuads.push(quad);
                    continue;
                }
            }
        }
        return new SimpleDataset(foundQuads);
    }
}
