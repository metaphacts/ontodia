import { uniqueId } from 'lodash';

import { Triple, RdfNode, RdfBlank, RdfLiteral } from './sparqlModels';

const BLANK_PREFIX = 'blank:';

export function isEncodedBlank(iri: string) {
    return iri.startsWith(BLANK_PREFIX);
}

export function encodeTriplesToIRI(triples: Triple[]) {
    //const normalized = randomizeBlankNodes(triples, () => 'b');
    //normalized.sort(compareTriple);
    return BLANK_PREFIX + triples.map(t => {
        const subject = encodeNode(t.subject);
        const predicate = encodeNode(t.predicate);
        const object = encodeNode(t.object);
        return `${subject},${predicate},${object}`;
    }).join(';');
}

function compareTriple(left: Triple, right: Triple): number {
    let result = compareNode(left.subject, right.subject);
    if (result !== 0) { return result; }
    result = compareNode(left.predicate, right.predicate);
    if (result !== 0) { return result; }
    return compareNode(left.object, right.object);
}

function compareNode(left: RdfNode, right: RdfNode): number {
    let result = left.type.localeCompare(right.type);
    if (result !== 0) { return result; }
    result = left.value.localeCompare(right.value);
    if (result !== 0 || left.type !== 'literal') { return result; }
    const rightLiteral = right as RdfLiteral;
    result = left.datatype.localeCompare(rightLiteral.datatype);
    if (result !== 0) { return result; }
    return (left['xml:lang'] || '').localeCompare(rightLiteral['xml:lang'] || '');
}

export function decodeTriplesFromIRI(iri: string): Triple[] {
    if (!isEncodedBlank(iri)) { throw new Error(`Invalid blank node ot decode: ${iri}`); }
    const encodedTriples = iri.substring(BLANK_PREFIX.length).split(';');
    return encodedTriples.map((encodedTriple): Triple => {
        const [s, p, o] = encodedTriple.split(',');
        return {subject: decodeNode(s), predicate: decodeNode(p), object: decodeNode(o)};
    });
}

function encodeNode(node: RdfNode) {
    const value = encodeToSparql(node);
    return encodeURIComponent(value);
}

function decodeNode(encoded: string): RdfNode {
    const value = decodeURIComponent(encoded);
    return decodeFromSparql(value);
}

export function encodeToSparql(node: RdfNode) {
    if (node.type === 'literal') {
        const lang = node['xml:lang'];
        if (lang) {
            return `"${escapeRdfLiteral(node.value)}"@${lang}`;
        } else {
            return `"${escapeRdfLiteral(node.value)}"^^<${node.datatype}>`;
        }
    } else if (node.type === 'uri') {
        return `<${node.value}>`;
    } else if (node.type === 'bnode') {
        return `_:${node.value}`;
    } else {
        throw new Error(`Unknown RDF node type '${(node as RdfNode).type}'`);
    }
}

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';

export function decodeFromSparql(value: string): RdfNode {
    if (value.startsWith('"')) {
        const end = indexOfRdfLiteralEnd(value);
        if (end < 0) { throw new Error(`Invalid escaped node: ${value}`); }
        const literal = unescapeRdfLiteral(value.substring(1, end));
        if ((end + 2) < value.length && value[end + 1] === '^' && value[end + 2] === '^') {
            if ((end + 3) >= value.length) { throw new Error(`Invalid literal with datatype: ${value}`); }
            const datatype = decodeFromSparql(value.substring(end + 3)).value;
            return {type: 'literal', value: literal, datatype: datatype, 'xml:lang': ''};
        } else if ((end + 1) < value.length && value[end + 1] === '@') {
            if ((end + 2) >= value.length) { throw new Error(`Invalid lang literal: ${value}`); }
            const lang = value.substring(end + 2);
            return {type: 'literal', value: literal, datatype: XSD_STRING, 'xml:lang': lang};
        } else {
            return {type: 'literal', value: literal, datatype: XSD_STRING, 'xml:lang': ''};
        }
    } else if (value.startsWith('<') && value.length > 2) {
        return {type: 'uri', value: value.substring(1, value.length - 1)};
    } else if (value.startsWith('_:')) {
        return {type: 'bnode', value: value.substring('_:'.length)};
    } else {
        throw new Error(`Invalid Sparql value: ${value}`);
    }
}

function indexOfRdfLiteralEnd(literal: string): number {
    let index = 1;
    while (index < literal.length) {
        if (literal[index] === '"' && literal[index - 1] !== '\\') { break; }
        index++;
    }
    return index < literal.length ? index : -1;
}

export function escapeRdfLiteral(literal: string): string {
    // TODO: implement by spec
    return literal.replace('"', '\\"');
}

export function unescapeRdfLiteral(escaped: string): string {
    // TODO: implement by spec
    return escaped.replace('\\"', '"');
}

export function findBlankNode(triples: Triple[]): RdfBlank | undefined {
    for (const {subject, object} of triples) {
        if (subject.type === 'bnode') {
            return subject;
        } else if (object.type === 'bnode') {
            return object;
        }
    }
    return undefined;
}

export function randomizeBlankNodes(triples: Triple[], name = () => uniqueId('ob')): Triple[] {
    const mapping: { [blank: string]: RdfBlank } = {};
    const mapBlank = (blank: RdfBlank): RdfNode => {
        if (!mapping[blank.value]) {
            mapping[blank.value] =  {type: 'bnode', value: name()};
        }
        return mapping[blank.value];
    };
    return triples.map((t): Triple => {
        const subject = t.subject.type === 'bnode' ? mapBlank(t.subject) : t.subject;
        const object = t.object.type === 'bnode' ? mapBlank(t.object) : t.object;
        return {subject, predicate: t.predicate, object};
    });
}
