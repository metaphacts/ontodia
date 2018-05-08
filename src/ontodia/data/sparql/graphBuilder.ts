import { keyBy } from 'lodash';

import {
    LayoutData,
    LayoutElement,
    LayoutLink,
    diagramContextV1,
    emptyDiagram,
    SerializedDiagram, newSerializedDiagram
} from '../../editor/serializedDiagram';
import { uniformGrid } from '../../viewUtils/layout';

import { Dictionary, ElementModel, LinkModel, ElementIri, LinkTypeIri } from '../model';

import { DataProvider } from '../provider';
import { Triple } from './sparqlModels';
import { parseTurtleText } from './turtle';
import {generateID, IDKind} from '../../..';

const GREED_STEP = 150;

export class GraphBuilder {
    constructor(public dataProvider: DataProvider) {}

    createGraph(graph: { elementIds: ElementIri[]; links: LinkModel[] }): Promise<{
        preloadedElements: Dictionary<ElementModel>;
        diagram: SerializedDiagram;
    }> {
        return this.dataProvider.elementInfo({elementIds: graph.elementIds}).then(elementsInfo => ({
            preloadedElements: elementsInfo,
            diagram: this.getDiagram(graph.elementIds, graph.links),
        }));
    }

    getGraphFromRDFGraph(graph: Triple[]): Promise<{
        preloadedElements: Dictionary<ElementModel>;
        diagram: SerializedDiagram;
    }> {
        const {elementIds, links} = this.getGraphElements(graph);
        return this.createGraph({elementIds, links});
    }

    getGraphFromTurtleGraph(graph: string): Promise<{
        preloadedElements: Dictionary<ElementModel>;
        diagram: SerializedDiagram;
    }> {
        return parseTurtleText(graph).then(triples => this.getGraphFromRDFGraph(triples));
    }

    private getGraphElements(response: Triple[]): {
        elementIds: ElementIri[];
        links: LinkModel[];
    } {
        const elements: Dictionary<boolean> = {};
        const links: LinkModel[] = [];

        for (const {subject, predicate, object} of response) {
            if (subject.type === 'uri' && !elements[subject.value]) {
                elements[subject.value] = true;
            }

            if (object.type === 'uri' && !elements[object.value]) {
                elements[object.value] = true;
            }

            if (subject.type === 'uri' && object.type === 'uri') {
                links.push({
                    linkTypeId: predicate.value as LinkTypeIri,
                    sourceId: subject.value as ElementIri,
                    targetId: object.value as ElementIri,
                });
            }
        }
        return {elementIds: Object.keys(elements) as ElementIri[], links};
    }

    private getDiagram(elementsIds: ElementIri[], linksInfo: LinkModel[]): SerializedDiagram {
        const rows = Math.ceil(Math.sqrt(elementsIds.length));
        const grid = uniformGrid({rows, cellSize: {x: GREED_STEP, y: GREED_STEP}});

        const elements: LayoutElement[] = elementsIds.map<LayoutElement>((id, index) => {
            const {x, y} = grid(index);
            return {'@type': 'Element', '@id': generateID(IDKind.element), iri: id, position: {x, y}, isExpanded: false};
        });

        const layoutElementsMap: {[iri: string]: LayoutElement} = keyBy(elements, 'iri');
        const links: LayoutLink[] = [];

        linksInfo.forEach((link, index) => {
            const source = layoutElementsMap[link.sourceId];
            const target = layoutElementsMap[link.targetId];

            if (!source || !target) { return; }

            links.push({
                '@type': 'Link',
                '@id': generateID(IDKind.link),
                property: link.linkTypeId,
                source: {'@id': source['@id']},
                target: {'@id': target['@id']},
            });
        });
        return newSerializedDiagram({layoutData: {'@type': 'Layout', elements, links}, linkTypeOptions: []});
    }
}

export default GraphBuilder;
