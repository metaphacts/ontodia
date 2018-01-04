import { waitFor } from 'rdf-ext';
import { Node, namedNode, literal, Stream } from 'rdf-data-model';
import { RDFCacheableStore, MatchStatement, prefixFactory, isLiteral, isNamedNode } from './rdfCacheableStore';
import stringToStream = require('string-to-stream');
import { DataProvider, FilterParams } from '../provider';
import { RDFLoader } from './rdfLoader';
import {
    LocalizedString, Dictionary, ClassModel, LinkType, ElementModel,
    LinkModel, LinkCount, PropertyModel, Property,
} from '../model';
import { RdfCompositeParser } from './rdfCompositeParser';

const RDF_TYPE = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const RDF_PROPERTY = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#Property');
const RDFS_SUB_CLASS_OF = namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf');
const RDFS_CLASS = namedNode('http://www.w3.org/2000/01/rdf-schema#Class');
const RDFS_LABEL = namedNode('http://www.w3.org/2000/01/rdf-schema#Label');
const OWL_CLASS = namedNode('http://www.w3.org/2002/07/owl#Class');
const OWL_OBJECT_PROPERTY = namedNode('http://www.w3.org/2002/07/owl#ObjectProperty');

export class RDFDataProvider implements DataProvider {
    public dataFetching: boolean;
    private initStatement: Promise<boolean> | boolean;
    private rdfStorage: RDFCacheableStore;
    private rdfLoader: RDFLoader;

    constructor(params: {
        data: {
            content: string,
            type?: string,
            uri?: string,
        }[],
        dataFetching?: boolean,
        proxy?: string,
        parsers: { [id: string]: any },
    }) {
        const parser = new RdfCompositeParser(params.parsers);

        this.rdfStorage = new RDFCacheableStore();
        this.rdfLoader = new RDFLoader({
            parser: parser,
            proxy: params.proxy,
        });
        this.dataFetching = params.dataFetching;

        let parsePromises;

        parsePromises = (params.data || []).map(datum => {
            const parseStream = parser.import(stringToStream(datum.content), datum.type);
            return this.rdfStorage.import(parseStream)
                .then(() => this.rdfStorage.length > 0)
                .catch(error => {
                    console.error(error);
                    return undefined;
                });
        });

        this.initStatement = Promise.all(parsePromises).then(parseResults => {
            return parseResults && (parseResults.filter(pr => pr).length > 0 || params.data.length === 0);
        });
    }

    isInitialized(): Promise<boolean> {
        if (this.initStatement instanceof Object) {
            return (<Promise<boolean>>this.initStatement).then(state => {
                this.initStatement = state;
                return this.initStatement;
            });
        } else {
            return Promise.resolve(this.initStatement);
        }
    }

    classTree(): Promise<ClassModel[]> {
        return this.isInitialized().then(state => {
            if (!state) { return []; }

            const rdfClasses =
                this.rdfStorage.match(null, RDF_TYPE, RDFS_CLASS).toArray();
            const owlClasses =
                this.rdfStorage.match(null, RDF_TYPE, OWL_CLASS).toArray();
            const fromRDFTypes =
                this.rdfStorage.match(null, RDF_TYPE, null).toArray();
            const subClasses =
                this.rdfStorage.match(null, RDFS_SUB_CLASS_OF, null).toArray();

            const classes = rdfClasses.map(cl => cl.subject.value)
                .concat(owlClasses.map(cl => cl.subject.value))
                .concat(fromRDFTypes.map(cl => cl.object.value));

            const parentMap: Dictionary<string[]> = {};
            for (const triple of subClasses) {
                const subClass = triple.subject.value;
                const clazz = triple.object.value;
                if (!parentMap[subClass]) {
                    parentMap[subClass] = [];
                }
                if (parentMap[subClass].indexOf(clazz) === -1) {
                    parentMap[subClass].push(clazz);
                }
            }

            const dictionary: Dictionary<ClassModel> = {};
            const firstLevel: Dictionary<ClassModel> = {};

            const labelQueries: Promise<boolean>[] = [];

            for (const cl of classes) {
                const parents = parentMap[cl] || [];
                const classAlreadyExists = dictionary[cl];

                let classElement: ClassModel;
                if (!classAlreadyExists) {
                    classElement = {
                        id: cl,
                        label: {
                            values: this.getLabels(cl),
                        },
                        count: this.rdfStorage.getTypeCount(cl),
                        children: [],
                    };
                    dictionary[cl] = classElement;
                    firstLevel[cl] = classElement;
                } else {
                    classElement = dictionary[cl];
                }

                for (const p of parents) {
                    if (!dictionary[p]) {
                        const parentClassElement: ClassModel = {
                            id: p,
                            label: undefined,
                            count: this.rdfStorage.getTypeCount(p) + 1 + classElement.count,
                            children: [classElement],
                        };
                        dictionary[p] = parentClassElement;
                        firstLevel[p] = parentClassElement;
                    } else if (!dictionary[cl].label) {
                        classElement = dictionary[cl];
                        classElement.label = { values: this.getLabels(cl) };
                    } else if (!classAlreadyExists) {
                        dictionary[p].children.push(classElement);
                        dictionary[p].count += (1 + classElement.count);
                    }
                    delete firstLevel[classElement.id];
                }
            }
            const result = Object.keys(firstLevel).map(k => {
                if (!firstLevel[k].label) {
                    firstLevel[k].label = { values: this.createLabelFromId(firstLevel[k].id) };
                }
                return firstLevel[k];
            });

            return result;
        });
    }

    propertyInfo(params: { propertyIds: string[] }): Promise<Dictionary<PropertyModel>> {
        const propertyInfoResult: Dictionary<PropertyModel> = {};

        const queries = params.propertyIds.map(
            propId => {
                return this.fetchIfNecessary(propId).then(() => {
                    return {
                        id: propId,
                        label: { values: this.getLabels(propId) },
                    };
                }).catch(error => {
                    console.warn(error);
                    return null;
                });
            },
        );

        return Promise.all(queries).then((fetchedModels) => {
            for (const model of fetchedModels) {
                if (model) {
                    propertyInfoResult[model.id] = model;
                }
            }
            return propertyInfoResult;
        });
    }

    classInfo(params: { classIds: string[] }): Promise<ClassModel[]> {
        const queries = params.classIds.map(
            classId => this.fetchIfNecessary(classId).then(() => {
                return {
                    id: classId,
                    label: { values: this.getLabels(classId) },
                    count: this.rdfStorage.getTypeCount(classId),
                    children: [],
                };
            }).catch(error => {
                console.warn(error);
                return null;
            }),
        );

        return Promise.all(queries).then(fetchedModels => {
            return fetchedModels.filter(cm => cm);
        });
    }

    linkTypesInfo(params: { linkTypeIds: string[] }): Promise<LinkType[]> {
        const queries = params.linkTypeIds.map(
            typeId => this.fetchIfNecessary(typeId).then(() => {
                return {
                    id: typeId,
                    label: { values: this.getLabels(typeId) },
                    count: this.rdfStorage.getTypeCount(typeId),
                };
            }).catch(error => {
                console.warn(error);
                return null;
            }),
        );

        return Promise.all(queries).then((fetchedModels) => {
            return fetchedModels.filter(lt => lt);
        });
    }

    linkTypes(): Promise<LinkType[]> {
        const linkTypes: LinkType[] = [];
        const rdfLinks = this.rdfStorage.match(
            undefined,
            RDF_TYPE,
            RDF_PROPERTY,
        ).toArray();
        const owlLinks = this.rdfStorage.match(
            undefined,
            RDF_TYPE,
            OWL_OBJECT_PROPERTY,
        ).toArray();

        return Promise.resolve(rdfLinks.concat(owlLinks).map(link => ({
            id: link.subject.value,
            label: { values: this.getLabels(link.subject.value) },
            count: this.rdfStorage.getTypeCount(link.subject.value),
        })));
    }

    elementInfo(params: { elementIds: string[] }): Promise<Dictionary<ElementModel>> {
        const elementInfoResult: Dictionary<ElementModel> = {};

        const queries = params.elementIds.map(
            elementId => this.fetchIfNecessary(elementId).then(() => {
                return this.getElementInfo(elementId);
            }).catch(error => {
                console.warn(error);
                return null;
            }),
        );

        return Promise.all(queries).then((fetchedModels) => {
            for (const model of fetchedModels) {
                if (model) {
                    elementInfoResult[model.id] = model;
                }
            }
            return elementInfoResult;
        });
    }

    linksInfo(params: {
        elementIds: string[];
        linkTypeIds: string[];
    }): Promise<LinkModel[]> {

        const statements: MatchStatement[] = [];
        for (const source of params.elementIds) {
            for (const target of params.elementIds) {
                statements.push({
                    subject: namedNode(source),
                    object: namedNode(target),
                });
            }
        }

        return Promise.resolve(
            this.rdfStorage.matchAll(statements).toArray().map(lt => ({
                sourceId: lt.subject.value,
                linkTypeId: lt.predicate.value,
                targetId: lt.object.value,
            })),
        );
    }

    linkTypesOf(params: { elementId: string; }): Promise<LinkCount[]> {
        const links: LinkCount[] = [];
        const element = namedNode(params.elementId);
        const linkMap: Dictionary<LinkCount> = {};

        const incomingElements = this.rdfStorage.match(null, null, element)
            .toArray().filter(t => isNamedNode(t.subject))
            .map(triple => triple.predicate);

        for (const el of incomingElements) {
            if (!linkMap[el.value]) {
                linkMap[el.value] = {
                    id: el.value,
                    inCount: 1,
                    outCount: 0,
                };
                links.push(linkMap[el.value]);
            } else {
                linkMap[el.value].inCount++;
            }
        }

        const outgoingElements = this.rdfStorage.match(element, null, null)
            .toArray().filter(t => isNamedNode(t.object))
            .map(triple => triple.predicate);

        for (const el of outgoingElements) {
            if (!linkMap[el.value]) {
                linkMap[el.value] = {
                    id: el.value,
                    inCount: 0,
                    outCount: 1,
                };
                links.push(linkMap[el.value]);
            } else {
                linkMap[el.value].outCount++;
            }
        }

        return Promise.resolve(links);
    };

    linkElements(params: {
        elementId: string;
        linkId: string;
        limit: number;
        offset: number;
        direction?: 'in' | 'out';
    }): Promise<Dictionary<ElementModel>> {
        return this.filter({
            refElementId: params.elementId,
            refElementLinkId: params.linkId,
            linkDirection: params.direction,
            limit: params.limit,
            offset: params.offset,
            languageCode: '',
        });
    }

    filter(params: FilterParams): Promise<Dictionary<ElementModel>> {
        if (params.limit === 0) { params.limit = 100; }

        const offsetIndex = params.offset;
        const limitIndex = params.offset + params.limit;

        let elements: ElementModel[];
        if (params.elementTypeId) {
            elements = this.rdfStorage.match(
                undefined,
                RDF_TYPE,
                namedNode(params.elementTypeId),
            ).toArray()
                .filter((t, index) => paginate(t.subject, index))
                .map(el => this.getElementInfo(el.subject.value, true));
        } else if (params.refElementId && params.refElementLinkId) {
            const refEl = params.refElementId;
            const refLink = params.refElementLinkId;
            if (params.linkDirection === 'in') {
                elements = this.rdfStorage.match(null, namedNode(refLink), namedNode(refEl))
                    .toArray()
                    .filter((t, index) => paginate(t.subject, index))
                    .map(el => this.getElementInfo(el.subject.value, true));
            } else {
                elements = this.rdfStorage.match(namedNode(refEl), namedNode(refLink), null)
                    .toArray()
                    .filter((t, index) => paginate(t.object, index))
                    .map(el => this.getElementInfo(el.object.value, true));
            }
        } else if (params.refElementId) {
            const refEl = params.refElementId;

            const refElement = this.getElementInfo(refEl, true);
            const inRelations = this.rdfStorage.match(null, null, namedNode(refEl))
                .toArray().filter((t, index) => paginate(t.subject, index))
                .map(el => this.getElementInfo(el.subject.value, true));
            const outRelations = this.rdfStorage.match(namedNode(refEl), null, null)
                .toArray()
                .filter((t, index) => paginate(t.object, index))
                .map(el => this.getElementInfo(el.object.value, true));
            elements = [refElement].concat(inRelations).concat(outRelations);

        } else if (params.text) {
            elements = [];
            this.rdfStorage.toArray().forEach((quad, index) => {
                if (paginate(quad.object, index)) {
                    elements.push(this.getElementInfo(quad.object.value, true));
                } else if (paginate(quad.subject, index)) {
                    elements.push(this.getElementInfo(quad.subject.value, true));
                }
            });
        } else {
            return Promise.resolve({});
        }

        function paginate(node: Node, index: number) {
            return isNamedNode(node) &&
                offsetIndex <= index &&
                index < limitIndex;
        }

        const result: Dictionary<ElementModel> = {};
        const key = (params.text ? params.text.toLowerCase() : null);

        // Filtering by the key
        for (const el of elements) {
            if (key) {
                let acceptableKey = false;
                for (const label of el.label.values) {
                    acceptableKey = acceptableKey || label.text.toLowerCase().indexOf(key) !== -1;
                    if (acceptableKey) {
                        break;
                    }
                }
                if (acceptableKey) {
                    result[el.id] = el;
                }
            } else {
                result[el.id] = el;
            }
        }

        return Promise.resolve(result);
    };

    private fetchIfNecessary(id: string) {
        if (
            (!id.startsWith('http') && !id.startsWith('file')) ||
            this.rdfStorage.isIncludes(id) || !this.dataFetching
        ) {
            return Promise.resolve();
        } else {
            return this.rdfLoader.downloadElement(id).then(dataset => {
                this.rdfStorage.addAll(dataset.toArray());
                return;
            }).catch(error => {
                console.warn(error);
                return;
            });
        }
    }

    private getElementInfo(id: string, shortInfo?: boolean): ElementModel {
        return {
            id: id,
            types: this.getTypes(id),
            label: { values: this.getLabels(id) },
            properties: shortInfo ? {} : this.getProps(id),
        };
    };

    private createLabelFromId(id: string): LocalizedString[] {
        let label;
        if (id) {
            const urlParts = id.split('/');
            const sharpParts = urlParts[urlParts.length - 1].split('#');
            label = sharpParts[sharpParts.length - 1];
        } else {
            label = '';
        }
        return [{
            text: label,
            lang: '',
        }];
    }

    private getLabels(id: string): LocalizedString[] {
        const labelTriples = this.rdfStorage.getLabels(id);
        const tripleArray = labelTriples.toArray();

        return tripleArray.length > 0 ? labelTriples.toArray().map(l => ({
            text: l.object.value,
            lang: isLiteral(l.object) ? l.object.language || '' : '',
        })) : this.createLabelFromId(id);

    }

    private getProps(el: string): Dictionary<Property> {
        const props: Dictionary<Property> = {};
        const propQuads = this.rdfStorage.match(namedNode(el), null, null).toArray();

        for (const quad of propQuads) {
            if (isLiteral(quad.object) && !quad.predicate.equals(RDFS_LABEL)) {
                props[quad.predicate.value] = {
                    type: 'string',
                    values: [{
                        text: quad.object.value,
                        lang: quad.object.language || '',
                    }],
                };
            }
        }
        return props;
    }

    private getTypes(el: string): string[] {
        return this.rdfStorage.match(
            namedNode(el),
            RDF_TYPE,
            undefined,
        ).toArray().map(t => t.object.value);
    }
}
