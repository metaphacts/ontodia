import { Dictionary } from '../model';

export class RDFCompositeParser {
    constructor(public parserMap: Dictionary<any>) { }

    parse(body: string, mimeType?: string): Promise<any> {
        if (mimeType) {
            if (mimeType === 'application/rdf+xml') {
                // For some strange reason we've encountered xml parser errors
                // when parsing rdf/xml file with Collection tag.
                // As I remember, file came from x3c Ontology
                // and this workaround helps to get file through xml parsing.
                body = body.replace(/Collection/ig, 'Collection1');
            }
            if (!this.parserMap[mimeType]) {
                throw Error('There is no parser for this MIME type');
            }
            return this.parserMap[mimeType].parse(body);
        } else {
            return this.tryToGuessMimeType(body);
        }
    }

    private tryToGuessMimeType(body: string): Promise<any> {
        let i = 0;
        const mimeTypes = Object.keys(this.parserMap);
        const recursion = (): Promise<any> => {
            if (i < mimeTypes.length) {
                const mimeType = mimeTypes[i++];
                try {
                    return this.parserMap[mimeType].parse(body).catch(() => {
                        /* silent */
                        return recursion();
                    });
                } catch (error) {
                    return recursion();
                }
            } else {
                throw new Error('Unknow mime type');
            }
        };

        return recursion();
    }
}
