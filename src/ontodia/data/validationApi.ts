import { CancellationToken } from '../viewUtils/async';
import { ElementModel, LinkTypeIri, PropertyTypeIri } from './model';
import { AuthoringState } from '../editor/authoringState';

export interface ElementError {
    message: string;
    relationIri: LinkTypeIri | PropertyTypeIri;
}

export interface ValidationApi {
    /**
     * Validates element model
     */
    validateElement(element: ElementModel, state: AuthoringState, ct: CancellationToken): Promise<ElementError[]>;
}
