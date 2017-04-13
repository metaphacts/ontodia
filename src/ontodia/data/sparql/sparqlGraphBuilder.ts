import { SparqlDataProvider } from './sparqlDataProvider';
import { Triple } from './sparqlModels';
import { LayoutData } from '../../diagram/layoutData';
import { Dictionary, ElementModel, LinkModel } from '../model';

import { GraphBuilder } from './graphBuilder';

const DEFAULT_PREFIX =
    `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
 PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
 PREFIX owl:  <http://www.w3.org/2002/07/owl#>` + '\n\n';


export class SparqlGraphBuilder {
    graphBuilder: GraphBuilder;

    constructor(public dataProvider: SparqlDataProvider) {
        this.graphBuilder = new GraphBuilder(dataProvider);
    }

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
        return this.graphBuilder.createGraph({elementIds, links});
    };

    private getConstructElements(response: Triple[]): {
        elementIds: string[], links: LinkModel[]
    } {
        const elements: Dictionary<boolean> = {};
        const links: LinkModel[] = [];

        for (const {subject, predicate, object} of response) {
            if (subject.type === 'uri' && object.type === 'uri') {
                if (!elements[subject.value]) {
                    elements[subject.value] = true;
                }
                if (!elements[object.value]) {
                    elements[object.value] = true;
                }
                links.push({
                    linkTypeId: predicate.value,
                    sourceId: subject.value,
                    targetId: object.value,
                });
            }
        }
        return {elementIds: Object.keys(elements), links: links};
    }
}
