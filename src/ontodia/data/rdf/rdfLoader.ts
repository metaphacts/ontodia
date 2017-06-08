import { RDFGraph } from 'rdf-ext';

import 'whatwg-fetch';
import { Dictionary } from '../model';
import RDFCompositeParser from './rdfCompositeParser';

export class RDFLoader {
    private fetchingFileCatche: Dictionary<Promise<RDFGraph>> = {};

    constructor(public parser: RDFCompositeParser) {
        /* */
    }

    private parseData(data: string, contentType?: string, prefix?: string): Promise<RDFGraph> {
        let result: Promise<RDFGraph>;
        result = this.parser.parse(data, contentType);
        return result;
    }

    downloadElement(elementId: string): Promise<RDFGraph> {
        const sharpIndex = elementId.indexOf('#');
        const fileUrl = sharpIndex !== -1 ? elementId.substr(0, sharpIndex) : elementId;
        let typePointer = 0;
        const mimeTypes = Object.keys(this.parser.parserMap);

        const recursivePart = (): Promise<RDFGraph> => {
            const acceptType = mimeTypes[typePointer++];

            if (acceptType && (elementId.startsWith('http') || elementId.startsWith('file'))) {
                return fetchFile({
                    url: elementId,
                    headers: {
                        'Accept': acceptType,
                    },
                }).then((body: string) => {
                    return this.parseData(body, acceptType, elementId)
                    .catch(error => {
                        console.warn(error);
                        if (typePointer < mimeTypes.length) {
                            return recursivePart();
                        } else {
                            throw Error(`Unable to parse response. Response: ${body}`);
                        }
                    });
                });
            } else {
                throw Error(`Unable to fetch data using this id (${elementId})`);
            }
        };

        if (!this.fetchingFileCatche[fileUrl]) {
            this.fetchingFileCatche[fileUrl] = recursivePart();
        }
        return this.fetchingFileCatche[fileUrl];
    }
}

export default RDFLoader;

function fetchFile(params: {
    url: string,
    headers?: any,
}) {
    return fetch(
        '/lod-proxy/' + params.url,
        {
            method: 'GET',
            credentials: 'same-origin',
            mode: 'cors',
            cache: 'default',
            headers: params.headers || {
                'Accept': 'application/rdf+xml',
            },
        },
    ).then(response => {
        if (response.ok) {
            return response.text();
        } else {
            const error = new Error(response.statusText);
            (<any> error).response = response;
            console.error(error);
            return undefined;
        }
    });
}
