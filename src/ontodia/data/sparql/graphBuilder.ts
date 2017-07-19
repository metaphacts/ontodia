import { LayoutData, LayoutCell, LayoutElement, LayoutLink } from '../../diagram/layoutData';
import { uniformGrid } from '../../viewUtils/layout';
import { Dictionary, ElementModel, LinkModel } from '../model';

import { DataProvider } from '../provider';

const GREED_STEP = 150;

export class GraphBuilder {
    constructor(public dataProvider: DataProvider) {}

    createGraph(graph: { elementIds: string[], links: LinkModel[] }): Promise<{
        preloadedElements: Dictionary<ElementModel>,
        layoutData: LayoutData,
    }> {
        return this.dataProvider.elementInfo({elementIds: graph.elementIds}).then(elementsInfo => ({
            preloadedElements: elementsInfo,
            layoutData: this.getLayout(graph.elementIds, graph.links),
        }));
    }

    private getLayout(elementsIds: string[], linksInfo: LinkModel[]): LayoutData {
        const rows = Math.ceil(Math.sqrt(elementsIds.length));
        const grid = uniformGrid({rows, cellSize: {x: GREED_STEP, y: GREED_STEP}});

        const layoutElements: LayoutCell[] = elementsIds.map<LayoutElement>((id, index) => {
            const {x, y} = grid(index);
            return {type: 'element', id, position: {x, y}};
        });
        const layoutLinks = linksInfo.map<LayoutLink>((link, index) => {
            return {
                type: 'link',
                id: 'link_' + index,
                typeId: link.linkTypeId,
                source: {id: link.sourceId},
                target: {id: link.targetId},
            };
        });
        return {cells: layoutElements.concat(layoutLinks)};
    }
}

export default GraphBuilder;
