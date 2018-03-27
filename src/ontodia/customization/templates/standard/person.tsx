import * as React from 'react';

import { DefaultElementTemplate } from './default';

export class PersonTemplate extends DefaultElementTemplate {
    protected getTypesLabel = (): string => {
        return 'Person';
    }
}
