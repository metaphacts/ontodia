import { LayoutData, SerializedDiagram } from '../../editor/serializedDiagram';

import { Dictionary, ElementModel } from '../model';

import { GraphBuilder } from './graphBuilder';
import { SparqlDataProvider } from './sparqlDataProvider';

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
        preloadedElements: Dictionary<ElementModel>;
        diagram: SerializedDiagram;
    }> {
        const query = DEFAULT_PREFIX + constructQuery;
        return this.dataProvider.executeSparqlConstruct(query)
            .then(graph => this.graphBuilder.getGraphFromRDFGraph(graph));
    }
}
