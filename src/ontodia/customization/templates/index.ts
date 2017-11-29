import { TemplateResolver } from '../props';

import { VowlClassTemplate } from './VowlClass';
import { BigIconTemplate } from './bigIcon';
import { VowlProperty } from './VowlProperty';
import { DefaultOwlTemplate } from './defaultOwl';
import { DefaultElementTemplate } from './default';
import { LeftBarTemplate } from './leftBar';
import { OrganizationTemplate } from './organization';
import { PersonTemplate } from './person';

export * from './defaultOwl';
export * from './VowlClass';
export * from './VowlProperty';
export * from './default';
export * from './bigIcon';
export * from './leftBar';
export * from './organization';
export * from './person';

export const VowlTemplateBundle: TemplateResolver[] = [
    types => {
        if (types.indexOf('http://www.w3.org/2000/01/rdf-schema#Class') !== -1) {
            return VowlClassTemplate;
        } else if (types.indexOf('http://www.w3.org/2002/07/owl#Class') !== -1) {
            return VowlClassTemplate;
        } else if (types.indexOf('http://www.w3.org/2002/07/owl#ObjectProperty') !== -1) {
            return VowlProperty;
        } else if (types.indexOf('http://www.w3.org/2002/07/owl#DatatypeProperty') !== -1) {
            return VowlProperty;
        } else { return DefaultOwlTemplate; }
    },
];
export const DefaultTemplateBundle: TemplateResolver[] = [
    types => {
        if (types.indexOf('http://www.w3.org/2000/01/rdf-schema#Class') !== -1) {
            return BigIconTemplate;
        } else if (types.indexOf('http://www.w3.org/2002/07/owl#Class') !== -1) {
            return BigIconTemplate;
        } else if (types.indexOf('http://www.w3.org/2002/07/owl#ObjectProperty') !== -1) {
            return LeftBarTemplate;
        } else if (types.indexOf('http://www.w3.org/2002/07/owl#DatatypeProperty') !== -1) {
            return LeftBarTemplate;
        } else if (types.indexOf('http://xmlns.com/foaf/0.1/Person') !== -1 ||
            types.indexOf('http://www.wikidata.org/entity/Q5') !== -1) {
            return PersonTemplate;
        } else if (
            types.indexOf('http://schema.org/Organization') !== -1 ||
            types.indexOf('http://dbpedia.org/ontology/Organisation') !== -1 ||
            types.indexOf('http://xmlns.com/foaf/0.1/Organization') !== -1
        ) {
            return OrganizationTemplate;
        } else {
            return DefaultElementTemplate;
        }
    },
];