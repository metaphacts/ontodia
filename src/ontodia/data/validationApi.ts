import { ElementModel, LinkModel, PropertyTypeIri } from './model';
import { AuthoringState } from '../editor/authoringState';
import { CancellationToken } from '../viewUtils/async';
import { DiagramModel } from '../diagram/model';

export interface ElementError {
    readonly message: string;
    readonly propertyType?: PropertyTypeIri;
}

export interface LinkError {
    readonly message: string;
}

export interface ValidationEvent {
    readonly element: ElementModel;
    readonly data: DiagramModel;
    readonly state: AuthoringState;
    readonly cancellation: CancellationToken;
    readonly addElementErrors: (
        target: ElementModel,
        errors: Promise<ElementError[]>
    ) => void;
    readonly addLinkErrors: (
        target: LinkModel,
        errors: Promise<LinkError[]>
    ) => void;
}

export interface ValidationApi {
    validate(event: ValidationEvent): void;
}
