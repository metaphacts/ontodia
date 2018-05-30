import { ElementModel, LinkType, ElementTypeIri, LinkTypeIri, PropertyTypeIri } from './model';
import { CancellationToken } from '../viewUtils/async';

export interface MetadataApi {
    /**
     * Can user create links from this element?
     */
    canLink(source: ElementModel, ct: CancellationToken): Promise<boolean>;

    /**
     * Can we create link between two elements? Maybe it's unnesesary.
     */
    canDrop(source: ElementModel, target: ElementModel, ct: CancellationToken): Promise<boolean>;

    /**
     * Links of which types can we create between elements?
     */
    possibleLinkTypes(source: ElementModel, target: ElementModel, ct: CancellationToken): Promise<LinkTypeIri[]>;

    /**
     * If new element is created by dragging link from existing element, this should return available element types.
     */
    typesOfElementsDraggedFrom(source: ElementModel, ct: CancellationToken): Promise<ElementTypeIri[]>;

    /**
     * List properties for type meant to be edited in-place.
     */
    propertiesForType(type: ElementTypeIri, ct: CancellationToken): Promise<PropertyTypeIri[]>;
}
