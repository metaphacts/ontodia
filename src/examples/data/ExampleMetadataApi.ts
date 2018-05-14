import {MetadataAPI} from '../../ontodia/editor/metadata';
import {ElementModel, ElementTypeIri, LinkTypeIri, PropertyTypeIri} from '../..';
import {CancellationToken} from '../../ontodia/viewUtils/async';

const owlPrefix = 'http://www.w3.org/2002/07/owl#';
const rdfsPrefix = 'http://www.w3.org/2000/01/rdf-schema#';

const schema = {
    class: owlPrefix + 'Class' as ElementTypeIri,
    objectProperty: owlPrefix + 'ObjectProperty' as ElementTypeIri,
    domain: owlPrefix + 'domain' as LinkTypeIri,
    range: owlPrefix + 'range' as LinkTypeIri,
    subClassOf: rdfsPrefix + 'subClassOf' as LinkTypeIri,
    subPropertyOf: rdfsPrefix + 'subPropertyOf' as LinkTypeIri
};

function type(model: ElementModel) {
    return model.types[0];
}

export class ExampleMetadataApi implements MetadataAPI {
    canLink(source: ElementModel, ct: CancellationToken): Promise<boolean> {
        return Promise.resolve(
            (type(source) === schema.class) ? true :
                (type(source) === schema.objectProperty) ? true :
                        undefined
        );
    }
    canDrop(source: ElementModel, target: ElementModel, ct: CancellationToken): Promise<boolean> {
        return Promise.resolve(
            (type(source) === schema.class
                && type(target) === schema.class) ? true :
                (type(source) === schema.objectProperty
                    && type(target) === schema.class) ? true :
                    (type(source) === schema.objectProperty
                        && type(target) === schema.objectProperty) ? true :
                        undefined
        );
    }

    possibleLinkTypes(source: ElementModel, target: ElementModel, ct: CancellationToken): Promise<LinkTypeIri[]> {
        return Promise.resolve(
            (type(source) === schema.class
                && type(target) === schema.class) ? [schema.subClassOf] :
                (type(source) === schema.objectProperty
                    && type(target) === schema.class) ? [schema.domain, schema.range] :
                    (type(source) === schema.objectProperty
                        && type(target) === schema.objectProperty) ? [schema.subPropertyOf] :
                    undefined
        );
    }

    typesOfElementsDraggedFrom(source: ElementModel, ct: CancellationToken): Promise<ElementTypeIri[]> {
        return Promise.resolve(
            (type(source) === schema.class) ? [schema.class] :
                (type(source) === schema.objectProperty) ? [schema.class, schema.objectProperty] :
                        undefined
        );
    }

    propertiesForType(type: ElementTypeIri, ct: CancellationToken): Promise<PropertyTypeIri | LinkTypeIri>[] {
        return undefined;
    }

}
