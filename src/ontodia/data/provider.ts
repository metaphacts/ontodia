import {
    Dictionary, ClassModel, LinkType, ElementModel, LinkModel, LinkCount, PropertyModel,
} from './model';

export interface DataProvider {
    classTree(): Promise<ClassModel[]>;

    classInfo(params: {
        classIds: string[];
    }): Promise<ClassModel[]>;

    propertyInfo?(params: { propertyIds: string[] }): Promise<Dictionary<PropertyModel>>;

    linkTypes(): Promise<LinkType[]>;

    linkTypesInfo(params: {
        linkTypeIds: string[];
    }): Promise<LinkType[]>;

    elementInfo(params: { elementIds: string[]; }): Promise<Dictionary<ElementModel>>;

    linksInfo(params: {
        elementIds: string[];
        linkTypeIds: string[];
    }): Promise<LinkModel[]>;

    linkTypesOf(params: { elementId: string; }): Promise<LinkCount[]>;

    filter(params: FilterParams): Promise<Dictionary<ElementModel>>;
}

export default DataProvider;

export interface FilterParams {
    elementTypeId?: string;
    text?: string;
    refElementId?: string;
    refElementLinkId?: string;
    limit: number;
    offset: number;
    languageCode: string;
}
