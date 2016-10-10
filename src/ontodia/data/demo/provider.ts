import { cloneDeep, keyBy, map, each } from 'lodash';
import { DataProvider, FilterParams } from '../provider';
import { Dictionary, ClassModel, LinkType, ElementModel, LinkModel, LinkCount } from '../model';

const CLASSES = require<ClassModel[]>('json!./data/classes.json');
const LINK_TYPES = require<LinkType[]>('json!./data/linkTypes.json');
const ELEMENTS = require<Dictionary<ElementModel>>('json!./data/elements.json');
const LINKS  = require<LinkModel[]>('json!./data/links.json');

export class DemoDataProvider implements DataProvider {
    private simulateNetwork<T>(result: T) {
        const MEAN_DELAY = 200;
        const cloned = cloneDeep(result);
        // simulate exponential distribution
        const delay = -Math.log(Math.random()) * MEAN_DELAY;
        return new Promise<T>(resolve => {
            setTimeout(() => resolve(cloned), delay);
        });
    }

    classTree() {
        return this.simulateNetwork(CLASSES);
    }

    linkTypes() {
        return this.simulateNetwork(LINK_TYPES);
    }

    linkTypesInfo(params: {linkTypeIds: string[]}): Promise<LinkType[]> {
        const types = keyBy(params.linkTypeIds);
        const links = LINKS.filter(link =>
        types[link.linkTypeId]);
        return this.simulateNetwork(links);
    }

    elementInfo(params: { elementIds: string[]; }): Promise<Dictionary<ElementModel>> {
        const elements = params.elementIds
            .map(elementId => ELEMENTS[elementId])
            .filter(element => element !== undefined);
        return this.simulateNetwork(
            keyBy(elements, element => element.id));
    }

    linksInfo(params: {
        elementIds: string[];
        linkTypeIds: string[];
    }) {
        const nodes = keyBy(params.elementIds);
        const types = keyBy(params.linkTypeIds);
        const links = LINKS.filter(link =>
        types[link.linkTypeId] && nodes[link.sourceId] && nodes[link.targetId]);
        return this.simulateNetwork(links);
    }

    linkTypesOf(params: { elementId: string; }) {
        const counts: Dictionary<LinkCount> = {};
        for (const link of LINKS) {
            if (link.sourceId === params.elementId ||
                link.targetId === params.elementId
            ) {
                const linkCount = counts[link.linkTypeId];
                if (linkCount) {
                    linkCount.count++;
                } else {
                    counts[link.linkTypeId] = {id: link.linkTypeId, count: 1};
                }
            }
        }
        return this.simulateNetwork(map(counts));
    }

    filter(params: FilterParams): Promise<Dictionary<ElementModel>> {
        if (params.offset > 0) { return Promise.resolve({}); }

        let filtered: Dictionary<ElementModel> = {};
        if (params.elementTypeId) {
            each(ELEMENTS, element => {
                if (element.types.indexOf(params.elementTypeId) >= 0) {
                    filtered[element.id] = element;
                }
            });
        } else if (params.refElementId) {
            const filteredLinks = params.refElementLinkId
                ? LINKS.filter(link => link.linkTypeId === params.refElementLinkId)
                : LINKS;
            const nodeId = params.refElementId;
            for (const link of filteredLinks) {
                let linkedElementId: string = undefined;
                if (link.sourceId === nodeId) {
                    linkedElementId = link.targetId;
                } else if (link.targetId === nodeId) {
                    linkedElementId = link.sourceId;
                }
                if (linkedElementId !== undefined) {
                    const linkedElement = ELEMENTS[linkedElementId];
                    if (linkedElement) {
                        filtered[linkedElement.id] = linkedElement;
                    }
                }
            }
        } else if (params.text) {
            filtered = ELEMENTS; // filtering by text is done below
        } else {
            return Promise.reject(new Error('This type of filter is not implemented'));
        }

        if (params.text) {
            const filteredByText: Dictionary<ElementModel> = {};
            const text = params.text.toLowerCase();
            each(filtered, element => {
                let found = false;
                if (element.id.toLowerCase().indexOf(text) >= 0) {
                    found = true;
                } else {
                    found = element.label.values.some(
                        label => label.text.toLowerCase().indexOf(text) >= 0);
                }
                if (found) {
                    filteredByText[element.id] = element;
                }
            });
            return this.simulateNetwork(filteredByText);
        } else {
            return this.simulateNetwork(filtered);
        }
    }
}
