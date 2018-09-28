import { RDFGraph } from 'rdf-ext';
import { Dictionary } from '../model';
import { RDFCompositeParser } from './rdfCompositeParser';

export const DEFAULT_PROXY = '/lod-proxy/';

export class RDFLoader {
    private fetchingFileCatche: Dictionary<Promise<RDFGraph>> = {};
    public parser: RDFCompositeParser;
    public proxy: string;

    constructor(parameters: {
        parser: RDFCompositeParser;
        proxy?: string;
    }) {
        this.parser = parameters.parser;
        this.proxy = parameters.proxy || DEFAULT_PROXY;
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
                    proxy: this.proxy,
                    headers: {
                        'Accept': acceptType,
                    },
                }).then((body: string) => {
                    return this.parseData(body, acceptType, elementId)
                    .catch(error => {
                        // tslint:disable-next-line:no-console
                        console.warn(error);
                        if (typePointer < mimeTypes.length) {
                            return recursivePart();
                        } else {
                            throw new Error(`Unable to parse response. Response: ${body}`);
                        }
                    });
                });
            } else {
                throw new Error(`Unable to fetch data using this id (${elementId})`);
            }
        };

        if (!this.fetchingFileCatche[fileUrl]) {
            this.fetchingFileCatche[fileUrl] = recursivePart();
        }
        return this.fetchingFileCatche[fileUrl];
    }
}

function fetchFile(params: {
    url: string;
    proxy: string;
    headers?: any;
}) {
    return fetch(
        params.proxy + params.url,
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
            (error as any).response = response;
            throw error;
        }
    });
}
