import { TemplateResolver } from '../props';

import { PersonTemplate, OrganizationTemplate, LocationTemplate } from './standard';

export * from './standard';
export * from './group';

export const DefaultTemplateBundle: TemplateResolver[] = [
    types => {
        if (types.indexOf('http://xmlns.com/foaf/0.1/Person') !== -1 ||
            types.indexOf('http://www.wikidata.org/entity/Q5') !== -1 ) {
            return PersonTemplate;
        } else if (types.indexOf('http://www.wikidata.org/entity/Q6256') !== -1) {
            return undefined;
        } else if (
            types.indexOf('http://schema.org/Organization') !== -1 ||
            types.indexOf('http://dbpedia.org/ontology/Organisation') !== -1 ||
            types.indexOf('http://xmlns.com/foaf/0.1/Organization') !== -1 ||
            types.indexOf('http://www.wikidata.org/entity/Q43229') !== -1
        ) {
            return OrganizationTemplate;
        } else if (types.indexOf('http://www.wikidata.org/entity/Q618123') !== -1) {
            return LocationTemplate;
        } else {
            return undefined;
        }
    },
];
