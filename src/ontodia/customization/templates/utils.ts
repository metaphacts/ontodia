import { Dictionary, Property, isIriProperty, isLiteralProperty } from '../../data/model';

export function getProperty(props: Dictionary<Property>, id: string) {
    if (props && props[id]) {
        return getPropertyValues(props[id]).join(', ');
    } else {
        return undefined;
    }
}

export function getPropertyValues(property: Property): string[] {
    if (isIriProperty(property)) {
        return property.values.map(({value}) => value);
    } else if (isLiteralProperty(property)) {
        return property.values.map(({value}) => value);
    }
    return [];
}
