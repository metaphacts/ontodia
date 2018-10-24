import { ElementModel, LinkModel, ElementIri, PropertyTypeIri } from './model';
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

export interface ValidatingElement {
    readonly type: 'element';
    readonly target: ElementIri;
    readonly errors: Promise<ElementError[]>;
}

export interface ValidatingLink {
    readonly type: 'link';
    readonly target: LinkModel;
    readonly errors: Promise<LinkError[]>;
}

export type ValidationOperation = ValidatingElement | ValidatingLink;

export interface ValidationEvent {
    readonly target: ElementModel;
    readonly model: DiagramModel;
    readonly state: AuthoringState;
    readonly cancellation: CancellationToken;
}

export interface ValidationApi {
    validate(event: ValidationEvent): ReadonlyArray<ValidationOperation>;
}
