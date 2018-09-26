import { ElementIri, ElementTypeIri, LinkTypeIri } from './model';
import { generate128BitID } from './utils';

// context could be imported directly from NPM package, e.g.
//   import OntodiaContextV1 from 'ontodia/schema/context-v1.json';
export const DIAGRAM_CONTEXT_URL_V1 = 'https://ontodia.org/context/v1.json';

export const PLACEHOLDER_ELEMENT_TYPE = 'http://ontodia.org/NewEntity' as ElementTypeIri;
export const PLACEHOLDER_LINK_TYPE = 'http://ontodia.org/NewLink' as LinkTypeIri;

export namespace GenerateID {
    export function forElement() { return 'e_' + generate128BitID(); }
    export function forLink() { return 'l_' + generate128BitID(); }
    export function forNewEntity(): ElementIri {
        return `http://ontodia.org/newEntity_${generate128BitID()}` as ElementIri;
    }
}
