import { TypeStyleResolver } from './props';

export const DefaultTypeStyleBundle: TypeStyleResolver[] = [
    types => {
        if (types.indexOf('http://www.w3.org/2002/07/owl#Class') !== -1 ||
            types.indexOf('http://www.w3.org/2000/01/rdf-schema#Class') !== -1
        ) {
            return {color: '#eaac77', icon: 'ontodia-class-icon'};
        }
    },
    types => {
        if (types.indexOf('http://www.w3.org/2002/07/owl#ObjectProperty') !== -1) {
            return {color: '#34c7f3', icon: 'ontodia-object-property-icon'};
        }
    },
    types => {
        if (types.indexOf('http://www.w3.org/2002/07/owl#DatatypeProperty') !== -1) {
            return {color: '#34c7f3', icon: 'ontodia-datatype-property-icon'};
        }
    },
    types => {
        if (types.indexOf('http://xmlns.com/foaf/0.1/Person') !== -1) {
            return {color: '#eb7777', icon: 'ontodia-person-icon'};
        }
    },
    types => {
        if (types.indexOf('http://schema.org/Organization') !== -1 ||
            types.indexOf('http://dbpedia.org/ontology/Organisation') !== -1 ||
            types.indexOf('http://xmlns.com/foaf/0.1/Organization') !== -1) {
            return {color: '#77ca98', icon: 'ontodia-organization-icon'};
        }
    },
];
