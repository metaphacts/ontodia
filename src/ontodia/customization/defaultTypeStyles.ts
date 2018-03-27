import { TypeStyleResolver } from './props';

const CLASS_NAME = 'ontodia-standard-icon';

export const DefaultTypeStyleBundle: TypeStyleResolver[] = [
    types => {
        if (types.indexOf('http://www.w3.org/2002/07/owl#Class') !== -1 ||
            types.indexOf('http://www.w3.org/2000/01/rdf-schema#Class') !== -1
        ) {
            return {color: '#eaac77', icon: 'ontodia-class-icon'};
        } else if (types.indexOf('http://www.w3.org/2002/07/owl#ObjectProperty') !== -1) {
            return {color: '#34c7f3', icon: 'ontodia-object-property-icon'};
        } else if (types.indexOf('http://www.w3.org/2002/07/owl#DatatypeProperty') !== -1) {
            return {color: '#34c7f3', icon: 'ontodia-datatype-property-icon'};
        } else if (
            types.indexOf('http://xmlns.com/foaf/0.1/Person') !== -1 ||
            types.indexOf('http://www.wikidata.org/entity/Q5') !== -1
        ) {
            return {color: '#eb7777', icon: `${CLASS_NAME}-person`};
        } else if (types.indexOf('http://www.wikidata.org/entity/Q6256') !== -1) {
            return {color: '#77ca98', icon: `${CLASS_NAME}-country`};
        } else if (
            types.indexOf('http://schema.org/Organization') !== -1 ||
            types.indexOf('http://dbpedia.org/ontology/Organisation') !== -1 ||
            types.indexOf('http://xmlns.com/foaf/0.1/Organization') !== -1 ||
            types.indexOf('http://www.wikidata.org/entity/Q43229') !== -1
        ) {
            return {color: '#77ca98', icon: `${CLASS_NAME}-organization`};
        } else if (types.indexOf('http://www.wikidata.org/entity/Q618123') !== -1) {
            return {color: '#bebc71', icon: `${CLASS_NAME}-location`};
        } else if (types.indexOf('http://www.wikidata.org/entity/Q1190554') !== -1) {
            return {color: '#b4b1fb', icon: `${CLASS_NAME}-event`};
        } else if (types.indexOf('http://www.wikidata.org/entity/Q35120') !== -1) {
            return {color: '#53ccb2', icon: `${CLASS_NAME}-object`};
        } else {
            return undefined;
        }
    },
];
