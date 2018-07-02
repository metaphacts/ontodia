import {
    ElementModel, ElementTypeIri, LinkTypeIri, PropertyTypeIri, MetadataApi, DiagramModel, CancellationToken,
    LinkModel,
} from '../../index';

const owlPrefix = 'http://www.w3.org/2002/07/owl#';
const rdfsPrefix = 'http://www.w3.org/2000/01/rdf-schema#';

const schema = {
    class: owlPrefix + 'Class' as ElementTypeIri,
    objectProperty: owlPrefix + 'ObjectProperty' as ElementTypeIri,
    domain: owlPrefix + 'domain' as LinkTypeIri,
    range: owlPrefix + 'range' as LinkTypeIri,
    subClassOf: rdfsPrefix + 'subClassOf' as LinkTypeIri,
    subPropertyOf: rdfsPrefix + 'subPropertyOf' as LinkTypeIri,
};

function hasType(model: ElementModel, type: ElementTypeIri) {
    return Boolean(model.types.find(t => t === type));
}

// function delay(ms: number): Promise<void> {
//     return new Promise(resolve => setTimeout(resolve, ms));
// }

export class ExampleMetadataApi implements MetadataApi {
    canDropOnCanvas(source: ElementModel, ct: CancellationToken): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            this.typesOfElementsDraggedFrom(source, ct).then(elementTypes => resolve(elementTypes.length > 0));
        });
    }

    async canDropOnElement(source: ElementModel, target: ElementModel, ct: CancellationToken): Promise<boolean> {
        // await delay(1000);
        return new Promise<boolean>(resolve =>
            this.possibleLinkTypes(source, target, ct).then(linkTypes => resolve(linkTypes.length > 0))
        );
    }

    possibleLinkTypes(source: ElementModel, target: ElementModel, ct: CancellationToken): Promise<LinkTypeIri[]> {
        return Promise.resolve(
            hasType(source, schema.class) && hasType(target, schema.class) ? [schema.subClassOf] :
            hasType(source, schema.objectProperty) && hasType(target, schema.class) ? [schema.domain, schema.range] :
            hasType(source, schema.objectProperty) && hasType(target, schema.objectProperty) ? [schema.subPropertyOf] :
            []
        );
    }

    typesOfElementsDraggedFrom(source: ElementModel, ct: CancellationToken): Promise<ElementTypeIri[]> {
        return Promise.resolve(
            hasType(source, schema.class) ? [schema.class] :
            hasType(source, schema.objectProperty) ? [schema.class, schema.objectProperty] :
            []
        );
    }

    propertiesForType(type: ElementTypeIri, ct: CancellationToken): Promise<PropertyTypeIri[]> {
        return Promise.resolve([]);
    }

    canDeleteElement(element: ElementModel, ct: CancellationToken): Promise<boolean> {
        return Promise.resolve(true);
    }

    canCreateElement(elementType: ElementTypeIri, ct: CancellationToken): Promise<boolean> {
        return Promise.resolve(true);
    }

    canEditElement(element: ElementModel, ct: CancellationToken): Promise<boolean> {
        return Promise.resolve(true);
    }

    canLinkElement(element: ElementModel, ct: CancellationToken): Promise<boolean> {
        return Promise.resolve(true);
    }

    canDeleteLink(
        link: LinkModel, source: ElementModel, target: ElementModel, ct: CancellationToken
    ): Promise<boolean> {
        return Promise.resolve(true);
    }

    canEditLink(
        link: LinkModel, source: ElementModel, target: ElementModel, ct: CancellationToken
    ): Promise<boolean> {
        return Promise.resolve(true);
    }
}
