import { Triple, Node, RDFGraph } from 'rdf-ext';
import { RDFCacheableStore, MatchStatement, prefixFactory, isLiteral, isNamedNode } from './rdfCacheableStore';
import { DataProvider, LinkElementsParams, FilterParams } from '../provider';
import { RDFLoader } from './rdfLoader';
import {
    LocalizedString, Dictionary, ClassModel, LinkType, ElementModel, LinkModel, LinkCount, PropertyModel, Property,
    ElementIri, ClassIri, LinkTypeIri, PropertyTypeIri,
} from '../model';
import { RDFCompositeParser } from './rdfCompositeParser';

const PREFIX_FACTORIES = {
    RDF: prefixFactory('http://www.w3.org/1999/02/22-rdf-syntax-ns#'),
    RDFS: prefixFactory('http://www.w3.org/2000/01/rdf-schema#'),
    FOAF: prefixFactory('http://xmlns.com/foaf/0.1/'),
    XSD: prefixFactory('http://www.w3.org/2001/XMLSchema#'),
    OWL: prefixFactory('http://www.w3.org/2002/07/owl#'),
};

export interface RDFFile {
    content: string;
    fileName?: string;
    type?: string;
    uri?: string;
}

export interface RDFDataProviderOptions {
    data: RDFFile[];
    parsers: { [id: string]: any };
    acceptBlankNodes?: boolean;
    dataFetching?: boolean;
    proxy?: string;
}

export class RDFDataProvider implements DataProvider {
    public  dataFetching: boolean;
    private initStatement: Promise<any> | undefined;
    private rdfStorage: RDFCacheableStore;
    private rdfLoader: RDFLoader;

    readonly options: RDFDataProviderOptions;

    constructor(options: RDFDataProviderOptions) {
        const parser = new RDFCompositeParser(options.parsers);

        this.rdfStorage = new RDFCacheableStore({
            parser,
            acceptBlankNodes: options.acceptBlankNodes,
        });
        this.rdfLoader = new RDFLoader({
            parser: parser,
            proxy: options.proxy,
        });
        this.dataFetching = options.dataFetching;

        const parsePromises = (options.data || []).map(datum => {
            return parser.parse(datum.content, datum.type, datum.fileName)
                .then(rdfGraph => {
                    this.rdfStorage.add(rdfGraph);
                    return true;
                });
        });

        this.initStatement = Promise.all(parsePromises).catch((error: Error) => {
            error.message = 'Initialization failed! Cause: ' + error.message;
            throw error;
        });
        this.options = options;
    }

    addGraph(graph: RDFGraph) {
        this.rdfStorage.add(graph);
    }

    private waitInitCompleted(): Promise<void> {
        if (this.initStatement) {
            return this.initStatement.then(() => {
                delete this.initStatement;
            });
        } else {
            return Promise.resolve();
        }
    }

    async classTree(): Promise<ClassModel[]> {
        await this.waitInitCompleted();
        const rdfClassesQuery = this.rdfStorage.match(
            null,
            PREFIX_FACTORIES.RDF('type'),
            PREFIX_FACTORIES.RDFS('Class'),
            null,
        );
        const owlClassesQuery = this.rdfStorage.match(
            null,
            PREFIX_FACTORIES.RDF('type'),
            PREFIX_FACTORIES.OWL('Class'),
        );
        const fromRDFTypesQuery = this.rdfStorage.match(
            null,
            PREFIX_FACTORIES.RDF('type'),
            null,
        );

        const subClassesQuery = this.rdfStorage.match(
            null,
            PREFIX_FACTORIES.RDFS('subClassOf'),
            null,
        );

        const [
            rdfClassesGraph,
            owlClassesGraph,
            rdfTypesGraph,
            subClassesGraph,
        ] = await Promise.all([
            rdfClassesQuery,
            owlClassesQuery,
            fromRDFTypesQuery,
            subClassesQuery,
        ]);
        const rdfClasses = rdfClassesGraph.toArray().map(cl => cl.subject);
        const owlClasses = owlClassesGraph.toArray().map(cl => cl.subject);
        const rdfTypes = rdfTypesGraph.toArray().map(cl => cl.object);
        const subClasses = subClassesGraph.toArray();

        const classes = rdfClasses.concat(owlClasses).concat(rdfTypes);
        const classIris = classes
            .filter(clazz => clazz.interfaceName !== 'BlankNode')
            .map(clazz => clazz.nominalValue as ClassIri);

        const parents: Dictionary<ClassIri[]> = {};
        for (const triple of subClasses) {
            const subClassIRI = triple.subject.nominalValue as ClassIri;
            const classIRI = triple.object.nominalValue as ClassIri;
            if (isNamedNode(triple.subject) && !parents[subClassIRI]) {
                parents[subClassIRI] = [];
            }
            if (isNamedNode(triple.object) && parents[subClassIRI].indexOf(classIRI) === -1) {
                parents[subClassIRI].push(classIRI);
            }
        }

        const dictionary: Dictionary<ClassModel> = {};
        const firstLevel: Dictionary<ClassModel> = {};
        const labelQueries: Promise<any>[] = [];

        for (const classIri of classIris) {
            let classElement: ClassModel;
            if (!dictionary[classIri]) {
                classElement = this.createEmptyClass(classIri);
                dictionary[classIri] = classElement;
                firstLevel[classIri] = classElement;
                labelQueries.push(this.getLabels(classIri).then(labels => {
                    classElement.label = { values: labels };
                }));
            } else {
                classElement = dictionary[classIri];
            }

            if (parents[classIri]) {
                for (const parentIri of parents[classIri]) {
                    if (!dictionary[parentIri]) {
                        const parentElement = this.createEmptyClass(parentIri);
                        dictionary[parentIri] = parentElement;
                        firstLevel[parentIri] = parentElement;
                        labelQueries.push(this.getLabels(parentIri).then(labels => {
                            parentElement.label = { values: labels };
                        }));
                    }
                    if (dictionary[parentIri].children.indexOf(classElement) === -1) {
                        dictionary[parentIri].children.push(classElement);
                        dictionary[parentIri].count += classElement.count;
                    }
                    delete firstLevel[classElement.id];
                }
            }
        }

        await Promise.all(labelQueries);

        const result = Object.keys(firstLevel).map(k => firstLevel[k]);
        return result;
    }

    async propertyInfo(params: { propertyIds: PropertyTypeIri[] }): Promise<Dictionary<PropertyModel>> {
        await this.waitInitCompleted();
        const propertyInfoResult: Dictionary<PropertyModel> = {};

        const queries = params.propertyIds.map(
            async propId => {
                try {
                    const isExists = await this.checkElement(propId);
                    await this.fetchIfNecessary(propId, isExists);
                    const labels = await this.getLabels(propId);
                    return {
                        id: propId,
                        label: { values: labels },
                    };
                } catch (error) {
                    console.warn(error);
                    return null;
                }
            },
        );

        const fetchedModels = await Promise.all(queries);
        for (const model of fetchedModels) {
            if (model) {
                propertyInfoResult[model.id] = model;
            }
        }
        return propertyInfoResult;
    }

    async classInfo(params: { classIds: ClassIri[] }): Promise<ClassModel[]> {
        await this.waitInitCompleted();
        const queries = params.classIds.map(
            async classId => {
                try {
                    const isExists = await this.checkElement(classId);
                    await this.fetchIfNecessary(classId, isExists);
                    const labels = await this.getLabels(classId);
                    return {
                        id: classId,
                        label: { values: labels },
                        count: this.rdfStorage.getTypeCount(classId),
                        children: [],
                    };
                } catch (error) {
                    console.warn(error);
                    return null;
                }
        });

        const fetchedModels = await Promise.all(queries);
        return fetchedModels.filter(cm => cm);
    }

    async linkTypesInfo(params: { linkTypeIds: LinkTypeIri[] }): Promise<LinkType[]> {
        await this.waitInitCompleted();
        const queries: Promise<LinkType>[]  = params.linkTypeIds.map(
            async typeId => {
                try {
                    const isExists = await this.rdfStorage.checkElement(typeId);
                    await this.fetchIfNecessary(typeId, isExists);
                    const labels = await this.getLabels(typeId);
                    return {
                        id: typeId,
                        label: { values: labels },
                        count: this.rdfStorage.getTypeCount(typeId),
                    };
                } catch (error) {
                    console.warn(error);
                    return null;
                }
        });

        const fetchedModels = await Promise.all(queries);
        return fetchedModels.filter(lt => lt);
    }

    async linkTypes(): Promise<LinkType[]> {
        await this.waitInitCompleted();
        const linkTypes: LinkType[] = [];
        const rdfLinksQueries = this.rdfStorage.match(
            undefined,
            PREFIX_FACTORIES.RDF('type'),
            PREFIX_FACTORIES.RDF('Property'),
        );
        const owlLinksQueries = this.rdfStorage.match(
            undefined,
            PREFIX_FACTORIES.RDF('type'),
            PREFIX_FACTORIES.OWL('ObjectProperty'),
        );
        const [rdfLinks, owlLinks] = await Promise.all([rdfLinksQueries, owlLinksQueries]);
        const links = rdfLinks.toArray().concat(owlLinks.toArray());
        return Promise.all(
            links.map(async t => {
                const labels = await this.getLabels(t.subject.nominalValue);
                return {
                    id: t.subject.nominalValue as LinkTypeIri,
                    label: {values: labels},
                    count: this.rdfStorage.getTypeCount(t.subject.nominalValue),
                };
            }),
        );
    }

    async elementInfo(params: { elementIds: ElementIri[] }): Promise<Dictionary<ElementModel>> {
        await this.waitInitCompleted();
        const elementInfoResult: Dictionary<ElementModel> = {};

        const queries = params.elementIds.map(async elementId => {
            try {
                const isExists = await this.rdfStorage.checkElement(elementId);
                await this.fetchIfNecessary(elementId, isExists);
                return this.getElementInfo(elementId);
            } catch (error) {
                console.warn(error);
                return null;
            }
        });

        const fetchedModels = await Promise.all(queries);
        for (const model of fetchedModels) {
            if (model) {
                elementInfoResult[model.id] = model;
            }
        }
        return elementInfoResult;
    }

    async linksInfo(params: {
        elementIds: ElementIri[];
        linkTypeIds: LinkTypeIri[];
    }): Promise<LinkModel[]> {
        await this.waitInitCompleted();
        const statementPromises: Promise<MatchStatement>[] = [];
        for (const source of params.elementIds) {
            for (const target of params.elementIds) {
                statementPromises.push(Promise.all([
                    this.rdfStorage.checkElement(source)
                        .then(exists => this.fetchIfNecessary(source, exists)),
                    this.rdfStorage.checkElement(target)
                        .then(exists => this.fetchIfNecessary(target, exists)),
                ]).then(() => (
                    {subject: source, object: target}
                )).catch(error => {
                    console.warn(error);
                    return null;
                }));
            }
        }

        const statements = await Promise.all(statementPromises);
        const graph = await this.rdfStorage.matchAll(statements.filter(statement => statement));
        let triples;
        if (this.options.acceptBlankNodes) {
            triples = graph.toArray();
        } else {
            triples = graph.toArray().filter(tripple =>
                isNamedNode(tripple.subject) && isNamedNode(tripple.object));
        }

        const fetchedModels = triples.map((t): LinkModel => ({
            linkTypeId: t.predicate.nominalValue as LinkTypeIri,
            sourceId: t.subject.nominalValue as ElementIri,
            targetId: t.object.nominalValue as ElementIri,
        }));
        return fetchedModels;
    }

    async linkTypesOf(params: { elementId: ElementIri }): Promise<LinkCount[]> {
        await this.waitInitCompleted();
        const links: LinkCount[] = [];
        const element = params.elementId;
        const linkMap: Dictionary<LinkCount> = {};

        const incomingElementsTriples =
            await this.rdfStorage.match(null, null, element);

        const incomingElements = incomingElementsTriples.toArray()
            .filter(t => isNamedNode(t.subject))
            .map(triple => triple.predicate);
        for (const el of incomingElements) {
            const linkTypeId = el.nominalValue as LinkTypeIri;
            if (!linkMap[linkTypeId]) {
                linkMap[linkTypeId] = {
                    id: linkTypeId,
                    inCount: 1,
                    outCount: 0,
                };
                links.push(linkMap[linkTypeId]);
            } else {
                linkMap[linkTypeId].inCount++;
            }
        }

        const outgoingElementsTriples =
            await this.rdfStorage.match(element, null, null);

        const outElements = outgoingElementsTriples.toArray()
            .filter(t => isNamedNode(t.object))
            .map(triple => triple.predicate);
        for (const el of outElements) {
            const linkTypeId = el.nominalValue as LinkTypeIri;
            if (!linkMap[linkTypeId]) {
                linkMap[linkTypeId] = {
                    id: linkTypeId,
                    inCount: 0,
                    outCount: 1,
                };
                links.push(linkMap[linkTypeId]);
            } else {
                linkMap[linkTypeId].outCount++;
            }
        }
        return links;
    };

    async linkElements(params: LinkElementsParams): Promise<Dictionary<ElementModel>> {
        await this.waitInitCompleted();
        return await this.filter({
            refElementId: params.elementId,
            refElementLinkId: params.linkId,
            linkDirection: params.direction,
            limit: params.limit,
            offset: params.offset,
            languageCode: '',
        });
    }

    async filter(params: FilterParams): Promise<Dictionary<ElementModel>> {
        await this.waitInitCompleted();

        if (params.limit === undefined) {
            params.limit = 100;
        }
        const limit = (node: Node, index: number) => {
            return (blankNodes || isNamedNode(node))
                && offsetIndex <= index
                && index < limitIndex;
        };

        const offsetIndex = params.offset;
        const limitIndex = params.offset + params.limit;
        const blankNodes = this.options.acceptBlankNodes;

        let elementsPromise: Promise<ElementModel[]>;
        if (params.elementTypeId) {
            elementsPromise = this.filterByTypeId(params.elementTypeId, limit);
        } else if (params.refElementId && params.refElementLinkId) {
            elementsPromise = this.filterByRefAndLink(
                params.refElementId,
                params.refElementLinkId,
                params.linkDirection,
                limit,
            );
        } else if (params.refElementId) {
            elementsPromise = this.filterByRef(params.refElementId, limit);
        } else if (params.text) {
            elementsPromise = this.getAllElements(params.text, limit);
        } else {
            return {};
        }

        const elements = await elementsPromise;
        return this.filterByKey(params.text, elements);
    };

    private async filterByTypeId(
        elementTypeId: ClassIri, filter: (node: Node, index: number) => boolean,
    ): Promise<ElementModel[]> {
        const elementTriples = await this.rdfStorage.match(
            undefined,
            PREFIX_FACTORIES.RDF('type'),
            elementTypeId,
        );

        return Promise.all(elementTriples.toArray()
            .filter((t, index) => filter(t.subject, index))
            .map(el => this.getElementInfo(el.subject.nominalValue as ElementIri, true)),
        );
    }

    private async filterByRefAndLink(
        refEl: ElementIri,
        refLink: LinkTypeIri,
        linkDirection: 'in' | 'out',
        filter: (node: Node, index: number) => boolean,
    ): Promise<ElementModel[]> {
        if (linkDirection === 'in') {
            const elementTriples = await this.rdfStorage.match(null, refLink, refEl);
            return Promise.all(
                elementTriples.toArray().filter((t, index) => filter(t.subject, index))
                    .map(el => this.getElementInfo(el.subject.nominalValue as ElementIri, true)),
            );
        } else {
            const elementTriples = await this.rdfStorage.match(refEl, refLink, null);
            return Promise.all(
                elementTriples.toArray().filter((t, index) => filter(t.object, index))
                    .map(el => this.getElementInfo(el.object.nominalValue as ElementIri, true)),
            );
        }
    }

    private async filterByRef(
        refEl: ElementIri,
        filter: (node: Node, index: number) => boolean,
    ): Promise<ElementModel[]> {
        const incomingTriples = await this.rdfStorage.match(null, null, refEl);
        const inRelations = await Promise.all(
            incomingTriples.toArray().filter((t, index) => filter(t.subject, index))
                .map(el => this.getElementInfo(el.subject.nominalValue as ElementIri, true)),
        );
        const outgoingTriples = await this.rdfStorage.match(refEl, null, null);
        const outRelations = await Promise.all(
            outgoingTriples.toArray().filter((t, index) => filter(t.object, index))
                .map(el => this.getElementInfo(el.object.nominalValue as ElementIri, true)),
        );

        return inRelations.concat(outRelations);
    }

    private async getAllElements(
        text: string,
        filter: (node: Node, index: number) => boolean,
    ): Promise<ElementModel[]> {
        const elementTriples = await this.rdfStorage.match(null, null, null);
        const promices: Promise<ElementModel>[] = [];
        for (const tripple of elementTriples.toArray()) {
            if (filter(tripple.object, promices.length)) {
                promices.push(this.getElementInfo(tripple.object.nominalValue as ElementIri, true));
            }
            if (filter(tripple.subject, promices.length)) {
                promices.push(this.getElementInfo(tripple.subject.nominalValue as ElementIri, true));
            }
        }
        return Promise.all(promices);
    }

    private filterByKey(text: string, elements: ElementModel[]): Dictionary<ElementModel> {
        const result: Dictionary<ElementModel> = {};
        const key = (text ? text.toLowerCase() : null);
        if (key) {
            for (const el of elements) {
                let acceptableKey = false;
                for (const label of el.label.values) {
                    acceptableKey = acceptableKey || label.text.toLowerCase().indexOf(key) !== -1;
                    if (acceptableKey) { break; }
                }
                if (acceptableKey) { result[el.id] = el; }
            }
        } else {
            for (const el of elements) {
                result[el.id] = el;
            }
        }
        return result;
    }

    private checkElement(id: string): Promise<boolean> {
        return this.dataFetching ?
            this.rdfStorage.checkElement(id) :
            Promise.resolve(true);
    }

    private fetchIfNecessary(id: string, exists: boolean) {
        if (exists || !this.dataFetching) {
            return Promise.resolve();
        } else {
            return this.rdfLoader.downloadElement(id).then(rdfGraph => {
                this.rdfStorage.add(rdfGraph);
                return;
            }).catch(error => {
                console.warn(error);
                return;
            });
        }
    }

    private getElementInfo(id: ElementIri, shortInfo?: boolean): Promise<ElementModel> {
        return Promise.all([
            this.getTypes(id),
            (!shortInfo ? this.getProps(id) : Promise.resolve({})),
            this.getLabels(id),
        ]).then(([types, props, labels]) => {
            return {
                id: id,
                types: types,
                label: { values: labels },
                properties: props,
            };
        });
    };

    private getLabels(id: string): Promise<LocalizedString[]> {
        return this.rdfStorage.getLabels(id).then(labelTriples => {
            return labelTriples.toArray().map(l => ({
                text: l.object.nominalValue,
                lang: isLiteral(l.object) ? l.object.language || '' : '',
            }));
        });
    }

    private getProps(el: string): Promise<Dictionary<Property>> {
        return this.rdfStorage.match(el, null, null).then(propsGraph => {
            const props: Dictionary<Property> = {};
            const propTriples = propsGraph.toArray();

            for (const statemet of propTriples) {
                if (
                    isLiteral(statemet.object) &&
                    statemet.predicate.nominalValue !== PREFIX_FACTORIES.RDFS('label')
                ) {
                    props[statemet.predicate.nominalValue] = {
                        type: 'string',
                        values: [{
                            text: statemet.object.nominalValue,
                            lang: statemet.object.language || '',
                        }],
                    };
                }
            }
            return props;
        });
    }

    private getTypes(el: ElementIri): Promise<ClassIri[]> {
        return this.rdfStorage.match(el, PREFIX_FACTORIES.RDF('type'), null)
            .then(typeTriples => {
                return typeTriples.toArray().map(t => t.object.nominalValue as ClassIri);
            });
    }

    private createEmptyClass(classIri: ClassIri): ClassModel {
        return {
            id: classIri,
            label: {
                values: [],
            },
            count: this.rdfStorage.getTypeCount(classIri),
            children: [],
        };
    }
}
