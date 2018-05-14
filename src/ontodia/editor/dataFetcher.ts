import {
    ElementModel, ClassModel, LinkType, PropertyModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri,
} from '../data/model';
import { DataProvider } from '../data/provider';

import { FatClassModel, FatLinkType, RichProperty } from '../diagram/elements';
import { Graph } from '../diagram/graph';

import { BufferingQueue } from '../viewUtils/async';
import { hasOwnProperty } from '../viewUtils/collections';

export class DataFetcher {
    private classQueue = new BufferingQueue<ElementTypeIri>(classIds => {
        this.dataProvider.classInfo({classIds}).then(this.onClassesLoaded);
    });
    private linkTypeQueue = new BufferingQueue<LinkTypeIri>(linkTypeIds => {
        this.dataProvider.linkTypesInfo({linkTypeIds}).then(this.onLinkTypesLoaded);
    });
    private propertyTypeQueue = new BufferingQueue<PropertyTypeIri>(propertyIds => {
        this.dataProvider.propertyInfo({propertyIds}).then(this.onPropertyTypesLoaded);
    });

    constructor(
        private graph: Graph,
        private dataProvider: DataProvider,
    ) {}

    fetchElementData(elementIris: ReadonlyArray<ElementIri>): Promise<void> {
        if (elementIris.length === 0) {
            return Promise.resolve();
        }
        return this.dataProvider.elementInfo({elementIds: [...elementIris]})
            .then(this.onElementInfoLoaded);
    }

    private onElementInfoLoaded = (elements: { [elementId: string]: ElementModel }) => {
        for (const element of this.graph.getElements()) {
            const loadedModel = elements[element.iri];
            if (loadedModel) {
                element.setData(loadedModel);
            }
        }
    }

    fetchClass(model: FatClassModel): void {
        this.classQueue.push(model.id);
    }

    private onClassesLoaded = (classInfos: ClassModel[]) => {
        for (const {id, label, count} of classInfos) {
            const model = this.graph.getClass(id);
            if (!model) { continue; }
            model.setLabel(label.values);
            if (typeof count === 'number') {
                model.setCount(count);
            }
        }
    }

    fetchLinkType(linkType: FatLinkType): void {
        this.linkTypeQueue.push(linkType.id);
    }

    private onLinkTypesLoaded = (linkTypesInfo: LinkType[]) => {
        for (const {id, label} of linkTypesInfo) {
            const model = this.graph.getLinkType(id);
            if (!model) { continue; }
            model.setLabel(label.values);
        }
    }

    fetchPropertyType(propertyType: RichProperty): void {
        if (!this.dataProvider.propertyInfo) { return; }
        this.propertyTypeQueue.push(propertyType.id);
    }

    private onPropertyTypesLoaded = (propertyModels: { [propertyId: string]: PropertyModel }) => {
        for (const propId in propertyModels) {
            if (!hasOwnProperty(propertyModels, propId)) { continue; }
            const {id, label} = propertyModels[propId];
            const targetProperty = this.graph.getProperty(id);
            if (targetProperty) {
                targetProperty.setLabel(label.values);
            }
        }
    }
}
