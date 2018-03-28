import * as React from 'react';

import { StandardTemplate } from './standard';

// temporary solution to show beautiful types in wikidata
export class OrganizationTemplate extends StandardTemplate {
    protected getTypesLabel = (): string => {
        return 'Organization';
    }
}
