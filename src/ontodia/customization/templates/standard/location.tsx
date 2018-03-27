import * as React from 'react';

import { DefaultElementTemplate } from './default';

export class LocationTemplate extends DefaultElementTemplate {
    protected getTypesLabel = (): string => {
        return 'Location';
    }
}
