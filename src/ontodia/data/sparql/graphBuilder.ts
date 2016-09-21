import * as N3 from 'n3';

import { LayoutData } from '../../diagram/model';
import { executeSparqlQuery } from './provider';
import { DataProvider } from '../provider';
import {
    Dictionary, ElementModel, LinkModel,
} from '../model';

import * as Sparql from './sparqlModels';

const DEFAULT_PREFIX =
`PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
 PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
 PREFIX owl:  <http://www.w3.org/2002/07/owl#>` + '\n\n';

const GREED_STEP = 150;

export class GraphBuilder {
    constructor(public dataProvider: DataProvider, public endpointUrl) { }

    getGraphFromConstrunct(constructQuery: string): Promise<{
        preloadedElements: any,
        preloadedLinks: any[],
        layout: LayoutData,
    }> {
        const query = DEFAULT_PREFIX + constructQuery;
        return executeSparqlQuery<Sparql.ConstructResponse>(this.endpointUrl, query)
            .then(this.normalizeResults)
            .then(graphLayout => this.getGraphFromRDFGraph(graphLayout.results.bindings));
    };

    getGraphFromRDFGraph(graph: Sparql.ConstructElement[]): Promise<{
        preloadedElements: any,
        preloadedLinks: any[],
        layout: LayoutData,
    }> {
        let {elementIds, links} = this.getConstructElements(graph);
        return this.dataProvider.elementInfo({elementIds}).then(elementsInfo => ({
            preloadedElements: elementsInfo,
            preloadedLinks: links,
            layout: this.getLayout(elementsInfo, links),
        }));
    };

    private normalizeResults(result: any) {
        return new Promise<Sparql.SparqlResponse>((resolve, reject) => {
            if (typeof result === 'string') {
                const jsonResponse: Sparql.SparqlResponse = {
                    head: {vars: ['subject', 'predicate', 'object']},
                    results: {bindings: []},
                };
                N3.Parser().parse(result, (error, triple, hash) => {
                    if (!triple) {
                        jsonResponse.results.bindings.push({
                            subject:   {type: 'iri', value: triple.subject  },
                            predicate: {type: 'iri', value: triple.predicate},
                            object:    {type: 'iri', value: triple.object   },
                        });
                    } else {
                        resolve(jsonResponse);
                    }
                });
            } else if (typeof result === 'object' && result) {
                resolve(result);
            } else {
                reject(result);
            }
        });
    }

    private getConstructElements(response: Sparql.ConstructElement[]): {
        elementIds: string[], links: LinkModel[]
    } {
        const sElements: Sparql.ConstructElement[] = response;
        const elements: Dictionary<boolean> = {};
        const links: LinkModel[] = [];

        for (const constructElement of sElements) {
            if (!elements[constructElement.subject.value]) { elements[constructElement.subject.value] = true; }
            if (!elements[constructElement.object.value])  { elements[constructElement.object.value]  = true; }

            links.push({
                linkTypeId: constructElement.predicate.value,
                sourceId: constructElement.subject.value,
                targetId: constructElement.object.value,
            });
        }
        return { elementIds: Object.keys(elements), links: links };
    }

    private getLayout(elementsInfo: Dictionary<ElementModel>, linksInfo: LinkModel[]): LayoutData {
        const keys = Object.keys(elementsInfo);
        const maxXY = Math.ceil(Math.sqrt(keys.length));
        let x = 0;
        let y = 0;
        const layoutElements: any[] = keys.map(key => {
            const element = elementsInfo[key];
            if (x > maxXY) { x = 0; y++; }
            return {
                id: element.id,
                type: 'Ontodia.Element',
                position: {x: (x++) * GREED_STEP, y: y * GREED_STEP},
                presentOnDiagram: true,
            };
        });
        const layoutLinks: any[] = linksInfo.map((link, index) => {
            return {
                id: 'link_' + index,
                typeId: link.linkTypeId,
                type: 'link',
                source: {id: link.sourceId},
                target: {id: link.targetId},
            };
        });
        return {cells: layoutElements.concat(layoutLinks)};
    }
};

export default GraphBuilder;
