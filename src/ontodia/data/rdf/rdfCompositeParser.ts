import { Dictionary } from '../model';

function workaroundForRDFXmlParser(body: string) {
    // For some strange reason we've encountered xml parser errors
    // when parsing rdf/xml file with Collection tag.
    // As I remember, file came from x3c Ontology
    // and this workaround helps to get file through xml parsing.
    return body.replace(/parseType=["']Collection["']/ig, 'parseType="Collection1"');
}

const POSTFIX_TO_MIME: { [key: string]: string } = {
    'xml': 'application/rdf+xml',
    'rdf': 'application/rdf+xml',
    'owl': 'application/rdf+xml',
    'nttl': 'application/x-turtle',
    'jsonld': 'application/ld+json',
    'rj': 'application/ld+json',
    'ttl': 'text/turtle',
    'nt': 'text/turtle',
    'nq': 'text/turtle',
};

function getMimeTypeByFileName(fileName: string): string {
    const postfix = (fileName.match(/\.([\S]*)$/i) || [])[1];
    return postfix ? POSTFIX_TO_MIME[postfix] : undefined;
}

export class RDFCompositeParser {
    constructor(public parserMap: Dictionary<any>) { }

    parse(body: string, mimeType?: string, fileName?: string): Promise<any> {
        if (mimeType) {
            if (mimeType === 'application/rdf+xml') {
                body = workaroundForRDFXmlParser(body);
            }
            if (!this.parserMap[mimeType]) {
                throw Error('There is no parser for this MIME type');
            }
            return this.parserMap[mimeType].parse(body);
        } else {
            return this.tryToGuessMimeType(body, fileName);
        }
    }

    private tryToGuessMimeType(body: string, fileName?: string): Promise<any> {
        let mimeTypeIndex = 0;
        let mimeTypes = Object.keys(this.parserMap);

        if (fileName) {
            const mime = getMimeTypeByFileName(fileName);
            if (mime) {
                mimeTypes = [mime].concat(mimeTypes.filter(type => type !== mime));
            }
        }

        const errors: Array<{ mimeType: string; error: Error }> = [];

        const recursion = (): Promise<any> => {
            if (mimeTypeIndex < mimeTypes.length) {
                const mimeType = mimeTypes[mimeTypeIndex++];
                try {
                    const bodyToParse = mimeType === 'application/rdf+xml' ?
                        workaroundForRDFXmlParser(body) : body;

                    return this.parserMap[mimeType].parse(bodyToParse).catch((error: Error) => {
                        errors.push({ mimeType, error });
                        return recursion();
                    });
                } catch (error) {
                    return recursion();
                }
            } else {
                throw new Error('Unknow mime type. Parse errors:\n' +
                    errors.map(e => `${e.mimeType}: ${e.error.message} ${e.error.stack};\n`).join('\n'),
                );
            }
        };
        return recursion();
    }
}
