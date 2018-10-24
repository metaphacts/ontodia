import { ElementModel, LinkModel, PropertyTypeIri } from './model';
import { AuthoringState } from '../editor/authoringState';
import { CancellationToken } from '../viewUtils/async';
import { DiagramModel } from '../diagram/model';

export enum ValidationKind {
    ElementValidation = 'elementValidation',
    LinkValidation = 'linkValidation',
}

export interface ElementError {
    readonly message: string;
    readonly propertyType?: PropertyTypeIri;
}

export interface LinkError {
    readonly message: string;
}

export interface ElementValidationResult {
    readonly type: ValidationKind.ElementValidation;
    target: ElementModel;
    errors: Promise<ElementError[]>;
}

export interface LinkValidationResult {
    readonly type: ValidationKind.LinkValidation;
    target: LinkModel;
    errors: Promise<LinkError[]>;
}

export type ValidationResult = ElementValidationResult | LinkValidationResult;

export interface ValidationEvent {
    readonly element: ElementModel;
    readonly data: DiagramModel;
    readonly state: AuthoringState;
    readonly cancellation: CancellationToken;
}

export interface ValidationApi {
    validate(event: ValidationEvent): ValidationResult[];
}
