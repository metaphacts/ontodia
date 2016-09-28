export type ElementStyle = {color?: string; icon?: string};
export type ElementStyleResolver = (types: string[]) => ElementStyle;

export const DEFAULT_ELEMENT_STYLE_BUNDLE: ElementStyleResolver[] = [
    types => {
        if (
            types.indexOf('http://www.w3.org/2002/07/owl#Class') !== -1 ||
            types.indexOf('http://www.w3.org/2000/01/rdf-schema#Class') !== -1
        ) {
            return {color: '#eaac77', icon: 'ontodia-class-icon'};
        } else {
            return undefined;
        }
    },
    types => {
        if (types.indexOf('http://www.w3.org/2002/07/owl#ObjectProperty') !== -1) {
            return {color: '#34c7f3', icon: 'ontodia-object-property-icon'};
        } else {
            return undefined;
        }
    },
    types => {
        if (types.indexOf('http://www.w3.org/2002/07/owl#DatatypeProperty') !== -1) {
            return {color: '#34c7f3', icon: 'ontodia-datatype-property-icon'};
        } else {
            return undefined;
        }
    },
    types => {
        if (types.indexOf('http://xmlns.com/foaf/0.1/Person') !== -1) {
            return {color: '#eb7777', icon: 'ontodia-person-icon'};
        } else {
            return undefined;
        }
    },
    types => {
        if (types.indexOf('http://schema.org/Organization') !== -1) {
            return {color: '#77ca98', icon: 'ontodia-organization-icon'};
        } else {
            return undefined;
        }
    },
];
