import {ElementTypeIri, ElementModel, LinkType} from '../data/model';
import {LinkTypeIri, PropertyTypeIri} from '../..';
import {CancellationToken} from '../viewUtils/async';

export interface MetadataApi {
    // link creation

    /**
     * Can user create links from this element?
     * @param {ElementModel} source
     * @returns {boolean}
     */
    canLink(source: ElementModel, ct: CancellationToken): Promise<boolean>;

    /**
     * Can we create link between two elements? Maybe it's unnesesary.
     * @param {ElementModel} source
     * @param {ElementModel} target
     * @returns {boolean}
     */
    canDrop(source: ElementModel, target: ElementModel, ct: CancellationToken): Promise<boolean>;

    /**
     * Links of which types can we create between elements?
     * @param {ElementModel} source
     * @param {ElementModel} target
     * @returns {LinkType[]}
     */
    possibleLinkTypes(source: ElementModel, target: ElementModel, ct: CancellationToken): Promise<LinkTypeIri[]>;

    // element creation

    /**
     * If new element is created by dragging link from existing element, this should return available element types.
     *
     * @param {ElementModel} source
     * @returns {string[]}
     */
    typesOfElementsDraggedFrom(source: ElementModel, ct: CancellationToken): Promise<ElementTypeIri[]>;

    /**
     * list properties for type meant to be edited in-place
     * @param {string} type
     * @returns {string[]}
     */
    propertiesForType(type: ElementTypeIri, ct: CancellationToken): Promise<PropertyTypeIri | LinkTypeIri>[];

}
