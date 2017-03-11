import {
    Dictionary, ClassModel, LinkType, ElementModel, LinkModel, LinkCount, PropertyModel,
} from './model';

export interface DataProvider {
    // schema extraction

    /** should return start-up class tree. In case of huge class tree some limits should be imposed.
     * It can contain count of instances for each class if it's possible to get it from source.
     */
    classTree(): Promise<ClassModel[]>;
    /*
     initial fetching of link types along with statistics.
     Since this list is not much use in UI, this method is subject to be removed.
      */
    linkTypes(): Promise<LinkType[]>;

    // schema on-demand information extraction.
    // If Ontodia does not know about some schema element in data, it would query it as needed.
    // Ontodia combines requests for these elements into batch requests.

    /**
     * Class information
     */
    classInfo(params: {
        classIds: string[];
    }): Promise<ClassModel[]>;

    /**
     * Data properties information
     */
    propertyInfo?(params: { propertyIds: string[] }): Promise<Dictionary<PropertyModel>>;

    /**
     * Link type information.
     */
    linkTypesInfo(params: {
        linkTypeIds: string[];
    }): Promise<LinkType[]>;

    /**
     * getting the elements from the data source on diagram initialization and on navigation events
     */
    elementInfo(params: { elementIds: string[]; }): Promise<Dictionary<ElementModel>>;

    /**
     * Should return all links between elements.
     * linkTypeIds is ignored in current sparql providers and is subject to be removed
     */
    linksInfo(params: {
        elementIds: string[];
        linkTypeIds: string[];
    }): Promise<LinkModel[]>;

    /**
     * Get link types of element to build navigation menu
     */
    linkTypesOf(params: { elementId: string; }): Promise<LinkCount[]>;

    /**
     * returns elements following link for specified element.
     * Has overlapping functionality with filter, but easier less powerful and easier to implement
     * linkId could be null, if it's the case method should return all elements from all links from current element.
     */
    linkElements(params: {elementId: string, linkId: string, limit: number, offset: number}) : Promise<Dictionary<ElementModel>>;

    /**
     * Supports filter functionality with different filters - by type, by element and it's connection, by full-text search
     */
    filter(params: FilterParams): Promise<Dictionary<ElementModel>>;
}

export default DataProvider;

export interface FilterParams {
    // element type filter
    elementTypeId?: string;
    // text search
    text?: string;
    // follow link filter
    refElementId?: string;
    refElementLinkId?: string;

    //support for pagination
    limit: number;
    offset: number;

    // right now this is unused in sparql data provider.
    // It were introduced to order results by particular language when doing substring match for
    languageCode: string;
}
