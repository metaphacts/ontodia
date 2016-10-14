import { TemplateResolver } from '../props';

import { LeftBarTemplate, BigIconTemplate, PersonTemplate, OrganizationTemplate } from './stringTemplates';

export const DefaultTemplateBundle: TemplateResolver[] = [
    types => {
        if (types.indexOf('http://www.w3.org/2000/01/rdf-schema#Class') !== -1) {
            return BigIconTemplate;
        } else {
            return undefined;
        }
    },
    types => {
        if (types.indexOf('http://www.w3.org/2002/07/owl#Class') !== -1) {
            return BigIconTemplate;
        } else {
            return undefined;
        }
    },
    types => {
        if (types.indexOf('http://www.w3.org/2002/07/owl#ObjectProperty') !== -1) {
            return LeftBarTemplate;
        } else {
            return undefined;
        }
    },
    types => {
        if (types.indexOf('http://www.w3.org/2002/07/owl#DatatypeProperty') !== -1) {
            return LeftBarTemplate;
        } else {
            return undefined;
        }
    },
    types => {
        if (types.indexOf('http://xmlns.com/foaf/0.1/Person') !== -1 ||
            types.indexOf('http://www.wikidata.org/entity/Q5') !== -1 ) {
            return PersonTemplate;
        } else {
            return undefined;
        }
    },
    types => {
        if (
            types.indexOf('http://schema.org/Organization') !== -1 ||
            types.indexOf('http://dbpedia.org/ontology/Organisation') !== -1 ||
            types.indexOf('http://xmlns.com/foaf/0.1/Organization') !== -1 ||
            types.indexOf('http://www.wikidata.org/entity/Q43229') !== -1
        ) {
            return OrganizationTemplate;
        } else {
            return undefined;
        }
    },
];
