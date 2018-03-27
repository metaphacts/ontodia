import * as React from 'react';

import { DefaultElementTemplate } from './default';

export class OrganizationTemplate extends DefaultElementTemplate {
    protected getTypesLabel = (): string => {
        return 'Organization';
    }
}
