import { cloneDeep, keyBy, map, each } from 'lodash';
import { DataProvider, LinkElementsParams, FilterParams } from '../provider';
import {
    Dictionary, ClassModel, LinkType, ElementModel, LinkModel, LinkCount,
    ElementIri, ClassIri, LinkTypeIri, PropertyTypeIri,
} from '../model';

export class DemoDataProvider implements DataProvider {
    constructor(
        private allClasses: ClassModel[],
        private allLinkTypes: LinkType[],
        private allElements: Dictionary<ElementModel>,
        private allLinks: LinkModel[],
    ) {}

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
        return this.simulateNetwork(this.allClasses);
    }

    classInfo(params: { classIds: ClassIri[] }) {
        const classIds = params.classIds || [];
        return this.simulateNetwork(this.allClasses.filter(cl => classIds.indexOf(cl.id)));
    }

    linkTypes() {
        return this.simulateNetwork(this.allLinkTypes);
    }

    linkTypesInfo(params: { linkTypeIds: LinkTypeIri[] }): Promise<LinkType[]> {
        const types = keyBy(params.linkTypeIds);
        const linkTypes = this.allLinkTypes.filter(type => types[type.id]);
        return this.simulateNetwork(linkTypes);
    }

    elementInfo(params: { elementIds: ElementIri[] }): Promise<Dictionary<ElementModel>> {
        const elements = params.elementIds
            .map(elementId => this.allElements[elementId])
            .filter(element => element !== undefined);
        return this.simulateNetwork(
            keyBy(elements, element => element.id));
    }

    linksInfo(params: {
        elementIds: ElementIri[];
        linkTypeIds: LinkTypeIri[];
    }) {
        const nodes = keyBy(params.elementIds);
        const types = keyBy(params.linkTypeIds);
        const links = this.allLinks.filter(link =>
        types[link.linkTypeId] && nodes[link.sourceId] && nodes[link.targetId]);
        return this.simulateNetwork(links);
    }

    linkTypesOf(params: { elementId: ElementIri }) {
        const counts: Dictionary<LinkCount> = {};
        for (const link of this.allLinks) {
            if (link.sourceId === params.elementId ||
                link.targetId === params.elementId
            ) {
                const linkCount = counts[link.linkTypeId];
                const isSource = link.sourceId === params.elementId;
                if (linkCount) {
                    isSource ? linkCount.outCount++ : linkCount.inCount++;
                } else {
                    counts[link.linkTypeId] = isSource
                        ? {id: link.linkTypeId, inCount: 0, outCount: 1}
                        : {id: link.linkTypeId, inCount: 1, outCount: 0};
                }
            }
        }
        return this.simulateNetwork(map(counts));
    }

    linkElements(params: LinkElementsParams): Promise<Dictionary<ElementModel>> {
        // for sparql we have rich filtering features and we just reuse filter.
        return this.filter({
            refElementId: params.elementId,
            refElementLinkId: params.linkId,
            linkDirection: params.direction,
            limit: params.limit,
            offset: params.offset,
            languageCode: '',
        });
    }

    filter(params: FilterParams): Promise<Dictionary<ElementModel>> {
        if (params.limit === undefined) { params.limit = 100; }

        if (params.offset > 0) { return Promise.resolve({}); }

        let filtered: Dictionary<ElementModel> = {};
        if (params.elementTypeId) {
            each(this.allElements, element => {
                if (element.types.indexOf(params.elementTypeId) >= 0) {
                    filtered[element.id] = element;
                }
            });
        } else if (params.refElementId) {
            const filteredLinks = params.refElementLinkId
                ? this.allLinks.filter(link => link.linkTypeId === params.refElementLinkId)
                : this.allLinks;
            const nodeId = params.refElementId;
            for (const link of filteredLinks) {
                let linkedElementId: string;
                if (link.sourceId === nodeId && params.linkDirection !== 'in') {
                    linkedElementId = link.targetId;
                } else if (link.targetId === nodeId && params.linkDirection !== 'out') {
                    linkedElementId = link.sourceId;
                }
                if (linkedElementId !== undefined) {
                    const linkedElement = this.allElements[linkedElementId];
                    if (linkedElement) {
                        filtered[linkedElement.id] = linkedElement;
                    }
                }
            }
        } else if (params.text) {
            filtered = this.allElements; // filtering by text is done below
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
