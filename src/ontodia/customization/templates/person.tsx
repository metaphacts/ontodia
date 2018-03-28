import * as React from 'react';

import { StandardTemplate } from './standard';

// temporary solution to show beautiful types in wikidata
export class PersonTemplate extends StandardTemplate {
    protected getTypesLabel(): string {
        return 'Person';
    }
}
