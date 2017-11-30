import { waitFor } from 'rdf-ext';
import { Node, Quad, Graph, Literal, NamedNode, Stream, namedNode } from 'rdf-data-model';
import SimpleDataset = require('rdf-dataset-simple');
import { Dictionary } from '../model';
import { RdfCompositeParser } from './rdfCompositeParser';
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
    'http://www.w3.org/2004/02/skos/core#prefLabel',
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
    private base: SimpleDataset;
    private labelsMap: Dictionary<Quad[]> = {};
    private countMap: Dictionary<number> = {};
    private elementTypes: Dictionary<Quad[]> = {};

    constructor(quads?: Quad[]) {
        this.base = new SimpleDataset(quads);
        this.base.add = (quad: Quad) => {
            this.base._quads.push(quad);
        };
    }

    import(dataStream: Stream<Quad>): Promise<any> {
        dataStream.on('data', this.indexData);
        return this.base.import(dataStream);
    }

    get length () {
        return this.base.length;
    }

    toArray(): Quad[] {
        return this.base.toArray();
    }

    add(quad: Quad) {
        this.indexData(quad);
        this.base.add(quad);
    }

    addAll(quads: Quad[]) {
        for (const quad of quads) {
            this.indexData(quad);
        }
        this.base.addAll(quads);
    }

    match(
        subject?: Node,
        predicate?: Node,
        object?: Node,
        graph?: Graph,
    ): SimpleDataset {
        const isLabel = predicate && LABEL_URIS.indexOf(predicate.value) !== -1;
        const isType = predicate && predicate.equals(RDF_TYPE);
        const valueNotFetched = subject && predicate && !object;
        if (valueNotFetched && (isLabel || isType)) {
            if (predicate.equals(RDF_TYPE)) {
                return this.getTypes(subject.value);
            } else {
                return this.getLabels(subject.value);
            }
        } else {
            return this.base.match(
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
            const {subject, predicate, object} = statement;
            const isLabel = predicate && LABEL_URIS.indexOf(predicate.value) !== -1;
            const isType = predicate && predicate.equals(RDF_TYPE);
            const valueNotFetched = subject && predicate && !object;

            if (valueNotFetched && (isLabel || isType)) {
                if (predicate.equals(RDF_TYPE)) {
                    responses.push(this.getTypes(subject.value));
                } else {
                    responses.push(this.getLabels(subject.value));
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

    // Checks whether the element is in the storage.
    isIncludes(id: string): boolean {
        return (
            this.labelsMap[id] !== undefined ||
            this.base.match(namedNode(id), null, null).length > 0
        );
    }

    getTypeCount(id: string): number {
        return this.countMap[id] || 0;
    }

    private indexData = (quad: Quad) => {
        const subject = quad.subject.value;
        const predicate = quad.predicate.value;
        const object = quad.object.value;
        const isLabel = LABEL_URIS.indexOf(predicate) !== -1;
        const typeURI = predicate.toLocaleLowerCase();
        const hasLabelLikePostfix = LABEL_POSTFIXES.find((value, index, array) => {
            const postfix = value.toLocaleLowerCase();
            return typeURI.indexOf(postfix) !== -1;
        });
        if (isLabel || (!this.labelsMap[subject] && hasLabelLikePostfix)) {
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
        for (const quad of this.base._quads) {
            for (const statement of statements) {
                const {subject, predicate, object} = statement;
                const similarObjects = !object || object.equals(quad.object);
                const similarPredicates = !predicate || predicate.equals(quad.predicate);
                const similarSubjects = !subject || subject.equals(quad.subject);

                if (similarObjects && similarPredicates && similarSubjects) {
                    foundQuads.push(quad);
                }
            }
        }
        return new SimpleDataset(foundQuads);
    }
}
