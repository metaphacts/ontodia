import { ElementModel } from '../data/model';

export type ElementStyle = {color?: string; icon?: string};
export type ElementStyleResolver = (elementModel: ElementModel) => ElementStyle;

export const DEFAULT_ELEMENT_STYLE_BUNDLE: ElementStyleResolver[] = [
    elementModel => {
        if (elementModel.types.indexOf('http://www.w3.org/2000/01/rdf-schema#Class') !== -1) {
            return {icon: 'ontodia-class-icon'};
        } else {
            return undefined;
        }
    },
    elementModel => {
        if (elementModel.types.indexOf('http://www.w3.org/2002/07/owl#Class') !== -1) {
            return {icon: 'ontodia-class-icon'};
        } else {
            return undefined;
        }
    },
    elementModel => {
        if (elementModel.types.indexOf('http://www.w3.org/2002/07/owl#ObjectProperty') !== -1) {
            return {icon: 'ontodia-object-property-icon'};
        } else {
            return undefined;
        }
    },
    elementModel => {
        if (elementModel.types.indexOf('http://www.w3.org/2002/07/owl#DatatypeProperty') !== -1) {
            return {icon: 'ontodia-datatype-property-icon'};
        } else {
            return undefined;
        }
    },
    elementModel => {
        if (elementModel.types.indexOf('http://xmlns.com/foaf/0.1/Person') !== -1) {
            return {icon: 'ontodia-person-icon'};
        } else {
            return undefined;
        }
    },
    elementModel => {
        if (elementModel.types.indexOf('http://schema.org/Organization') !== -1) {
            return {icon: 'ontodia-organization-icon'};
        } else {
            return undefined;
        }
    },
];
