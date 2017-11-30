import { waitFor } from 'rdf-ext';
import SimpleDataset = require('rdf-dataset-simple');
import { Dictionary } from '../model';
import { RdfCompositeParser } from './rdfCompositeParser';

const stringToStream = require<(input: string) => any>('string-to-stream');

export const DEFAULT_PROXY = '/lod-proxy/';

export class RDFLoader {
    private fetchingFileCatche: Dictionary<Promise<SimpleDataset>> = {};
    public parser: RdfCompositeParser;
    public proxy: string;

    constructor(parameters: {
        parser: RdfCompositeParser,
        proxy?: string;
    }) {
        this.parser = parameters.parser;
        this.proxy = parameters.proxy || DEFAULT_PROXY;
    }

    private parseData(data: string, contentType?: string, prefix?: string): Promise<SimpleDataset> {
        let dataset = new SimpleDataset();
        return dataset.import(
            this.parser.import(stringToStream(data), contentType),
        ).then(() => dataset);
    }

    downloadElement(elementId: string): Promise<SimpleDataset> {
        const sharpIndex = elementId.indexOf('#');
        const fileUrl = sharpIndex !== -1 ? elementId.substr(0, sharpIndex) : elementId;
        let typePointer = 0;
        const mimeTypes: any[] = this.parser.list();

        const recursivePart = (): Promise<SimpleDataset> => {
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

function fetchFile(params: {
    url: string,
    proxy: string,
    headers?: any,
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
            (<any> error).response = response;
            console.error(error);
            return undefined;
        }
    });
}
