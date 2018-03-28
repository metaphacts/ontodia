import { TemplateResolver } from '../props';

import { PersonTemplate } from './person';
import { OrganizationTemplate } from './organization';

export * from './default';
export * from './group';
export * from './standard';
export * from './organization';
export * from './person';

export const DefaultTemplateBundle: TemplateResolver[] = [
    types => {
        if (types.indexOf('http://xmlns.com/foaf/0.1/Person') !== -1 ||
            types.indexOf('http://www.wikidata.org/entity/Q5') !== -1 ) {
            return PersonTemplate;
        } else if (types.indexOf('http://www.wikidata.org/entity/Q6256') !== -1) {
            // using default template for country as a temporary solution
            return undefined;
        } else if (
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
