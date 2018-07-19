import { TypeStyleResolver } from './props';

const classIcon = require<string>('../../../images/icons/class.svg');
const objectPropertyIcon = require<string>('../../../images/icons/objectProperty.svg');
const datatypePropertyIcon = require<string>('../../../images/icons/datatypeProperty.svg');
const personIcon = require<string>('../../../images/icons/person.svg');
const countryIcon = require<string>('../../../images/icons/country.svg');
const organizationIcon = require<string>('../../../images/icons/organization.svg');
const locationIcon = require<string>('../../../images/icons/location.svg');
const eventIcon = require<string>('../../../images/icons/event.svg');
const objectIcon = require<string>('../../../images/icons/object.svg');

export const DefaultTypeStyleBundle: TypeStyleResolver[] = [
    types => {
        if (types.indexOf('http://www.w3.org/2002/07/owl#Class') !== -1 ||
            types.indexOf('http://www.w3.org/2000/01/rdf-schema#Class') !== -1
        ) {
            return {color: '#eaac77', icon: classIcon};
        } else if (types.indexOf('http://www.w3.org/2002/07/owl#ObjectProperty') !== -1) {
            return {color: '#34c7f3', icon: objectPropertyIcon};
        } else if (types.indexOf('http://www.w3.org/2002/07/owl#DatatypeProperty') !== -1) {
            return {color: '#34c7f3', icon: datatypePropertyIcon};
        } else if (
            types.indexOf('http://xmlns.com/foaf/0.1/Person') !== -1 ||
            types.indexOf('http://www.wikidata.org/entity/Q5') !== -1
        ) {
            return {color: '#eb7777', icon: personIcon};
        } else if (types.indexOf('http://www.wikidata.org/entity/Q6256') !== -1) {
            return {color: '#77ca98', icon: countryIcon};
        } else if (
            types.indexOf('http://schema.org/Organization') !== -1 ||
            types.indexOf('http://dbpedia.org/ontology/Organisation') !== -1 ||
            types.indexOf('http://xmlns.com/foaf/0.1/Organization') !== -1 ||
            types.indexOf('http://www.wikidata.org/entity/Q43229') !== -1
        ) {
            return {color: '#77ca98', icon: organizationIcon};
        } else if (types.indexOf('http://www.wikidata.org/entity/Q618123') !== -1) {
            return {color: '#bebc71', icon: locationIcon};
        } else if (types.indexOf('http://www.wikidata.org/entity/Q1190554') !== -1) {
            return {color: '#b4b1fb', icon: eventIcon};
        } else if (types.indexOf('http://www.wikidata.org/entity/Q488383') !== -1) {
            return {color: '#53ccb2', icon: objectIcon};
        } else {
            return undefined;
        }
    },
];
