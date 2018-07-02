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

const METADATA_DELAY: number = 0; /* ms */
function delay(): Promise<void> {
    if (METADATA_DELAY === 0) {
        return Promise.resolve();
    }
    return new Promise(resolve => setTimeout(resolve, METADATA_DELAY));
}

export class ExampleMetadataApi implements MetadataApi {
    async canDropOnCanvas(source: ElementModel, ct: CancellationToken): Promise<boolean> {
        await delay();
        return true;
        // return new Promise<boolean>(resolve => {
        //     this.typesOfElementsDraggedFrom(source, ct).then(elementTypes => resolve(elementTypes.length > 0));
        // });
    }

    async canDropOnElement(source: ElementModel, target: ElementModel, ct: CancellationToken): Promise<boolean> {
        await delay();
        return true;
        // const linkTypes = await this.possibleLinkTypes(source, target, ct);
        // return linkTypes.length > 0;
    }

    async possibleLinkTypes(source: ElementModel, target: ElementModel, ct: CancellationToken): Promise<LinkTypeIri[]> {
        await delay();
        return [schema.domain, schema.range, schema.subClassOf, schema.subPropertyOf];
        // return (
        //     hasType(source, schema.class) && hasType(target, schema.class) ? [schema.subClassOf] :
        //     hasType(source, schema.objectProperty) && hasType(target, schema.class) ? [schema.domain, schema.range] :
        //     hasType(source, schema.objectProperty) && hasType(target, schema.objectProperty) ? [schema.subPropertyOf] :
        //     []
        // );
    }

    async typesOfElementsDraggedFrom(source: ElementModel, ct: CancellationToken): Promise<ElementTypeIri[]> {
        await delay();
        return [schema.class, schema.objectProperty];
        // return (
        //     hasType(source, schema.class) ? [schema.class] :
        //     hasType(source, schema.objectProperty) ? [schema.class, schema.objectProperty] :
        //     []
        // );
    }

    async propertiesForType(type: ElementTypeIri, ct: CancellationToken): Promise<PropertyTypeIri[]> {
        await delay();
        return [];
    }

    async canDeleteElement(element: ElementModel, ct: CancellationToken): Promise<boolean> {
        await delay();
        return true;
    }

    async canCreateElement(elementType: ElementTypeIri, ct: CancellationToken): Promise<boolean> {
        await delay();
        return true;
    }

    async canEditElement(element: ElementModel, ct: CancellationToken): Promise<boolean> {
        await delay();
        return true;
    }

    async canLinkElement(element: ElementModel, ct: CancellationToken): Promise<boolean> {
        await delay();
        return true;
    }

    async canDeleteLink(
        link: LinkModel, source: ElementModel, target: ElementModel, ct: CancellationToken
    ): Promise<boolean> {
        await delay();
        return true;
    }

    async canEditLink(
        link: LinkModel, source: ElementModel, target: ElementModel, ct: CancellationToken
    ): Promise<boolean> {
        await delay();
        return true;
    }
}
