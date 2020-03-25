import { ElementModel, ElementTypeIri, LinkTypeIri, PropertyTypeIri, LinkModel, ElementIri } from './model';
import { LinkDirection } from '../diagram/elements';
import { CancellationToken } from '../viewUtils/async';

export interface MetadataApi {
    /**
     * Can user create element and link from this element?
     */
    canDropOnCanvas(source: ElementModel, ct: CancellationToken): Promise<boolean>;

    /**
     * Can we create link between two elements? Maybe it's unnesesary.
     */
    canDropOnElement(source: ElementModel, target: ElementModel, ct: CancellationToken): Promise<boolean>;

    /**
     * Links of which types can we create between elements?
     */
    possibleLinkTypes(source: ElementModel, target: ElementModel, ct: CancellationToken): Promise<DirectedLinkType[]>;

    /**
     * If new element is created by dragging link from existing element, this should return available element types.
     */
    typesOfElementsDraggedFrom(source: ElementModel, ct: CancellationToken): Promise<ElementTypeIri[]>;

    /**
     * List properties for type meant to be edited in-place.
     */
    propertiesForType(type: ElementTypeIri, ct: CancellationToken): Promise<PropertyTypeIri[]>;

    filterConstructibleTypes(
        types: ReadonlySet<ElementTypeIri>, ct: CancellationToken
    ): Promise<ReadonlySet<ElementTypeIri>>;

    canDeleteElement(element: ElementModel, ct: CancellationToken): Promise<boolean>;

    canEditElement(element: ElementModel, ct: CancellationToken): Promise<boolean>;

    canLinkElement(element: ElementModel, ct: CancellationToken): Promise<boolean>;

    canDeleteLink(link: LinkModel, source: ElementModel, target: ElementModel, ct: CancellationToken): Promise<boolean>;

    canEditLink(link: LinkModel, source: ElementModel, target: ElementModel, ct: CancellationToken): Promise<boolean>;

    generateNewElement(types: ReadonlyArray<ElementTypeIri>, ct: CancellationToken): Promise<ElementModel>;
}

export interface DirectedLinkType {
    readonly linkTypeIri: LinkTypeIri;
    readonly direction: LinkDirection;
}
