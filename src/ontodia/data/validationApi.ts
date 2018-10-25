import { DiagramModel } from '../diagram/model';
import { AuthoringState } from '../editor/authoringState';
import { CancellationToken } from '../viewUtils/async';

import { ElementModel, LinkModel, ElementIri, PropertyTypeIri } from './model';

export interface ElementError {
    readonly type: 'element';
    readonly target: ElementIri;
    readonly message: string;
    readonly propertyType?: PropertyTypeIri;
}

export interface LinkError {
    readonly type: 'link';
    readonly target: LinkModel;
    readonly message: string;
}

export interface ValidationEvent {
    readonly target: ElementModel;
    readonly outboundLinks: ReadonlyArray<LinkModel>;
    readonly model: DiagramModel;
    readonly state: AuthoringState;
    readonly cancellation: CancellationToken;
}

export interface ValidationApi {
    validate(e: ValidationEvent): Promise<Array<ElementError | LinkError>>;
}
