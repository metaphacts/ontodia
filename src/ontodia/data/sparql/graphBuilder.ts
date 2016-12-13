import * as N3 from 'n3';

import { LayoutData, LayoutCell, LayoutElement, LayoutLink } from '../../diagram/layoutData';
import { uniformGrid } from '../../viewUtils/layout';
import { DataProvider } from '../provider';
import { Dictionary, ElementModel, LinkModel } from '../model';

import { executeSparqlQuery } from './provider';
import { SparqlResponse, Triple } from './sparqlModels';

const DEFAULT_PREFIX =
`PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
 PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
 PREFIX owl:  <http://www.w3.org/2002/07/owl#>` + '\n\n';

const GREED_STEP = 150;

export class GraphBuilder {
    constructor(
        public dataProvider: DataProvider,
        public endpointUrl: string
    ) {}

    getGraphFromConstrunct(constructQuery: string): Promise<{
        preloadedElements: any,
        preloadedLinks: any[],
        layout: LayoutData,
    }> {
        const query = DEFAULT_PREFIX + constructQuery;
        return executeSparqlQuery<Triple>(this.endpointUrl, query)
            .then(normalizeSparqlResults)
            .then(graphLayout => this.getGraphFromRDFGraph(graphLayout.results.bindings));
    };

    getGraphFromRDFGraph(graph: Triple[]): Promise<{
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

    private getConstructElements(response: Triple[]): {
        elementIds: string[], links: LinkModel[]
    } {
        const elements: Dictionary<boolean> = {};
        const links: LinkModel[] = [];

        for (const {subject, predicate, object} of response) {
            if (subject.type === 'uri' && object.type === 'uri') {
                if (!elements[subject.value]) { elements[subject.value] = true; }
                if (!elements[object.value]) { elements[object.value]  = true; }
                links.push({
                    linkTypeId: predicate.value,
                    sourceId: subject.value,
                    targetId: object.value,
                });
            }
        }
        return { elementIds: Object.keys(elements), links: links };
    }

    private getLayout(elementsInfo: Dictionary<ElementModel>, linksInfo: LinkModel[]): LayoutData {
        const keys = Object.keys(elementsInfo);

        const rows = Math.ceil(Math.sqrt(keys.length));
        const grid = uniformGrid({rows, cellSize: {x: GREED_STEP, y: GREED_STEP}});

        const layoutElements: LayoutCell[] = keys.map<LayoutElement>((key, index) => {
            const element = elementsInfo[key];
            const {x, y} = grid(index);
            return {
                id: element.id,
                type: 'element',
                position: {x, y},
                presentOnDiagram: true,
            };
        });
        const layoutLinks = linksInfo.map<LayoutLink>((link, index) => {
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
}

function normalizeSparqlResults(result: string | SparqlResponse<Triple>) {
    return new Promise<SparqlResponse<Triple>>((resolve, reject) => {
        if (typeof result === 'string') {
            const jsonResponse: SparqlResponse<any> = {
                head: {vars: ['subject', 'predicate', 'object']},
                results: {bindings: []},
            };
            N3.Parser().parse(result, (error, triple, hash) => {
                if (triple) {
                    jsonResponse.results.bindings.push({
                        subject: toRdfNode(triple.subject),
                        predicate: toRdfNode(triple.predicate),
                        object: toRdfNode(triple.object),
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

function toRdfNode(entity: string) {
    if (entity.length >= 2 && entity[0] === '"' && entity[entity.length - 1] === '"') {
        return {type: 'literal', value: entity.substring(1, entity.length - 1)};
    } else {
        return {type: 'uri', value: entity};
    }
}

export default GraphBuilder;
