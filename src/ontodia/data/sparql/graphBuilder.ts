import * as N3 from 'n3';

import { LayoutData, LayoutCell, LayoutElement, LayoutLink } from '../../diagram/layoutData';
import { uniformGrid } from '../../viewUtils/layout';
import { Dictionary, ElementModel, LinkModel } from '../model';

import { SparqlDataProvider } from './sparqlDataProvider';
import { SparqlResponse, Triple } from './sparqlModels';

const DEFAULT_PREFIX =
`PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
 PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
 PREFIX owl:  <http://www.w3.org/2002/07/owl#>` + '\n\n';

const GREED_STEP = 150;

export class GraphBuilder {
    constructor(public dataProvider: SparqlDataProvider) {}

    getGraphFromConstruct(constructQuery: string): Promise<{
        preloadedElements: Dictionary<ElementModel>,
        layoutData: LayoutData,
    }> {
        const query = DEFAULT_PREFIX + constructQuery;
        return this.dataProvider.executeSparqlConstruct(query)
            .then(graph => this.getGraphFromRDFGraph(graph));
    };

    getGraphFromRDFGraph(graph: Triple[]): Promise<{
        preloadedElements: Dictionary<ElementModel>,
        layoutData: LayoutData,
    }> {
        let {elementIds, links} = this.getConstructElements(graph);
        return this.dataProvider.elementInfo({elementIds}).then(elementsInfo => ({
            preloadedElements: elementsInfo,
            layoutData: this.getLayout(elementsInfo, links),
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

export default GraphBuilder;
