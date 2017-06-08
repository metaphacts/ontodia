import { Triple, Node, RDFGraph } from 'rdf-ext';
import { RDFCacheableStore, PrefixFactory, isLiteral, isNamedNode } from './RDFCacheableStore';
import { DataProvider, FilterParams } from '../provider';
import { RDFLoader } from './rdfLoader';
import {
    LocalizedString, Dictionary, ClassModel, LinkType, ElementModel,
    LinkModel, LinkCount, PropertyModel, Property,
} from '../model';
import { RDFCompositeParser, AbstractParser } from './RDFCompositeParser';

const PREFIX_FACTORIES = {
    RDF: PrefixFactory('http://www.w3.org/1999/02/22-rdf-syntax-ns#'),
    RDFS: PrefixFactory('http://www.w3.org/2000/01/rdf-schema#'),
    FOAF: PrefixFactory('http://xmlns.com/foaf/0.1/'),
    XSD: PrefixFactory('http://www.w3.org/2001/XMLSchema#'),
    OWL: PrefixFactory('http://www.w3.org/2002/07/owl#'),
};

export class RDFDataProvider implements DataProvider {
    public  dataFetching: boolean;
    private initStatement: Promise<boolean> | boolean;
    private rdfStorage: RDFCacheableStore;
    private rdfLoader: RDFLoader;

    constructor(params: {
        data: {
            content: string,
            type?: string,
            uri?: string,
        } [],
        dataFetching?: boolean,
        parsers: Dictionary<AbstractParser>,
    }) {
        const parser = new RDFCompositeParser(params.parsers);

        this.rdfStorage = new RDFCacheableStore(parser);
        this.rdfLoader = new RDFLoader(parser);
        this.dataFetching = params.dataFetching;

        let parsePromises;

        parsePromises = (params.data || []).map(datum => {
            return parser.parse(datum.content, datum.type)
                .then(rdfGraph => {
                    this.rdfStorage.add(rdfGraph);
                    return true;
                }).catch (error => console.error(error));
        });

        this.initStatement = Promise.all(parsePromises).then(parseResults => {
            return parseResults.filter(pr => pr).length > 0 || params.data.length === 0;
        });
    }

    isInitialized(): Promise<boolean> {
        if (this.initStatement instanceof Object) {
            return (<Promise<boolean>> this.initStatement).then(state => {
                this.initStatement = state;
                return this.initStatement;
            });
        } else {
            return Promise.resolve(this.initStatement);
        }
    }

    classTree(): Promise<ClassModel[]> {
        return this.isInitialized().then(state => {
            const rdfClassesQuery =
                this.rdfStorage.match(
                    null,
                    PREFIX_FACTORIES.RDF('type'),
                    PREFIX_FACTORIES.RDFS('Class'),
                    null,
                );
            const owlClassesQuery =
                this.rdfStorage.match(
                    null,
                    PREFIX_FACTORIES.RDF('type'),
                    PREFIX_FACTORIES.OWL('Class'),
                );
            const fromRDFTypesQuery =
                this.rdfStorage.match(
                    null,
                    PREFIX_FACTORIES.RDF('type'),
                    null,
                );

            const subClassesQuery =
                this.rdfStorage.match(
                    null,
                    PREFIX_FACTORIES.RDFS('subClassOf'),
                    null,
                );

            return Promise.all([
                rdfClassesQuery,
                owlClassesQuery,
                fromRDFTypesQuery,
                subClassesQuery,
            ]).then(classesMatrix => {
                const arrays: Triple[][] = classesMatrix.map(cm => cm.toArray());
                const classes = arrays[0].map(cl => cl.subject.nominalValue)
                    .concat(arrays[1].map(cl => cl.subject.nominalValue))
                    .concat(arrays[2].map(cl => cl.object.nominalValue));

                const parentsList = arrays[3];
                const parentMap: Dictionary<string[]> = {};
                for (const triple of parentsList) {
                    const subClass = triple.subject.nominalValue;
                    const clazz = triple.object.nominalValue;
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

                    let classElement: ClassModel;
                    let classAlreadyExists = dictionary[cl];
                    if (!classAlreadyExists) {
                        classElement = {
                            id: cl,
                            label: {
                                values: [],
                            },
                            count: this.rdfStorage.getTypeCount(cl),
                            children: [],
                        };
                        labelQueries.push(this.getLabels(cl).then(labels => {
                            classElement.label = { values: labels };
                            return true;
                        }));
                        dictionary[cl] = classElement;
                        firstLevel[cl] = classElement;
                    } else if (!dictionary[cl].label) {
                        classElement = dictionary[cl];
                        labelQueries.push(this.getLabels(cl).then(labels => {
                            classElement.label = { values: labels };
                            return true;
                        }));
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
                        } else if (!classAlreadyExists) {
                            dictionary[p].children.push(classElement);
                            dictionary[p].count += (1 + classElement.count);
                        }
                        delete firstLevel[classElement.id];
                    }
                }
                const result = Object.keys(firstLevel)
                    .map(k => {
                        if (!firstLevel[k].label) {
                            firstLevel[k].label = { values: this.createLabelFromId(firstLevel[k].id) };
                        }
                        return firstLevel[k];
                    },
                );

                return Promise.all(labelQueries).then(responsec => {
                    return result;
                });
            });
        });
    }

    propertyInfo(params: { propertyIds: string[] }): Promise<Dictionary<PropertyModel>> {
        const propertyInfoResult: Dictionary<PropertyModel> = {};

        const queries = params.propertyIds.map(
            propId => {
                return this.checkElement(propId).then(exists => {
                    return this.fetchIfNecessary(propId, exists).then(() => {
                        return this.getLabels(propId).then(labels => ({
                            id: propId,
                            label: { values: labels },
                        }));
                    });
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
            classId => this.checkElement(classId).then(exists => {
                return this.fetchIfNecessary(classId, exists).then(() => {
                    return this.getLabels(classId).then(labels => ({
                            id: classId,
                            label: { values: labels },
                            count: this.rdfStorage.getTypeCount(classId),
                            children: [],
                        }),
                    );
                });
            }).catch(error => {
                console.warn(error);
                return null;
            }),
        );

        return Promise.all(queries).then(fetchedModels => {
            return fetchedModels.filter(cm => cm);
        });
    }

    linkTypesInfo(params: {linkTypeIds: string[]}): Promise<LinkType[]> {
        const queries = params.linkTypeIds.map(
            typeId => this.rdfStorage.checkElement(typeId).then(exists => {
                return this.fetchIfNecessary(typeId, exists).then(() => {
                    return this.getLabels(typeId).then(labels => ({
                            id: typeId,
                            label: { values: labels },
                            count: this.rdfStorage.getTypeCount(typeId),
                        }),
                    );
                });
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
            PREFIX_FACTORIES.RDF('type'),
            PREFIX_FACTORIES.RDF('Property'),
        );
        const owlLinks = this.rdfStorage.match(
            undefined,
            PREFIX_FACTORIES.RDF('type'),
            PREFIX_FACTORIES.OWL('ObjectProperty'),
        );
        return Promise.all([rdfLinks, owlLinks]).then(props => {
            const links = props[0].toArray().concat(props[0].toArray());
            return Promise.all(
                links.map(l =>
                    this.getLabels(l.subject.nominalValue).then(labels => {
                        return {
                            id: l.subject.nominalValue,
                            label: { values: labels },
                            count: this.rdfStorage.getTypeCount(l.subject.nominalValue),
                        };
                    }),
                ),
            );
        });
    }

    elementInfo(params: { elementIds: string[] }): Promise<Dictionary<ElementModel>> {
        const elementInfoResult: Dictionary<ElementModel> = {};

        const queries = params.elementIds.map(
            elementId => this.rdfStorage.checkElement(elementId).then(exists => {
                return this.fetchIfNecessary(elementId, exists).then(() => {
                    return this.getElementInfo(elementId);
                });
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

        const queries: Promise<LinkModel[]>[] = [];
        for (const source of params.elementIds) {
            for (const target of params.elementIds) {
                queries.push(Promise.all([
                    this.rdfStorage.checkElement(source)
                        .then(exists => this.fetchIfNecessary(source, exists)),
                    this.rdfStorage.checkElement(target)
                        .then(exists => this.fetchIfNecessary(target, exists)),
                ]).then(() => {
                    return this.rdfStorage.match(source, undefined, target).then(linkTriple => {
                        return linkTriple.toArray().map(lt => ({
                            linkTypeId: lt.predicate.nominalValue,
                            sourceId: source,
                            targetId: target,
                        }));
                    });
                }).catch(error => {
                    console.warn(error);
                    return null;
                }));
            }
        }

        return Promise.all(queries).then((fetchedModelsMatrix) => {
            const linkInfoResult: LinkModel[] = [];
            for (const fetchedModels of fetchedModelsMatrix) {
                for (const model of fetchedModels) {
                    if (model) {
                        linkInfoResult.push(model);
                    }
                }
            }
            return linkInfoResult;
        });
    }

    linkTypesOf(params: { elementId: string; }): Promise<LinkCount[]> {
        const links: LinkCount[] = [];
        const element = params.elementId;
        const linkMap: Dictionary<LinkCount> = {};

        const inElementsQuery =
            this.rdfStorage.match(null, null, element).then(inElementsTriples => {

                const inElements = inElementsTriples.toArray()
                    .filter(t => isNamedNode(t.subject))
                    .map(triple => triple.predicate);

                for (const el of inElements) {
                    if (!linkMap[el.nominalValue]) {
                        linkMap[el.nominalValue] = {
                            id: el.nominalValue,
                            inCount: 1,
                            outCount: 0,
                        };
                        links.push(linkMap[el.nominalValue]);
                    } else {
                        linkMap[el.nominalValue].inCount++;
                    }
                }
            });

        const outElementsQuery =
            this.rdfStorage.match(element, null, null).then(outElementsTriples => {
                const outElements = outElementsTriples.toArray()
                    .filter(t => isNamedNode(t.object))
                    .map(triple => triple.predicate);

                for (const el of outElements) {
                    if (!linkMap[el.nominalValue]) {
                        linkMap[el.nominalValue] = {
                            id: el.nominalValue,
                            inCount: 0,
                            outCount: 1,
                        };
                        links.push(linkMap[el.nominalValue]);
                    } else {
                        linkMap[el.nominalValue].outCount++;
                    }
                }
            });

        return Promise.all([inElementsQuery, outElementsQuery]).then(() => {
            return links;
        });
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
            languageCode: ''});
    }

    filter(params: FilterParams): Promise<Dictionary<ElementModel>> {
        if (params.limit === 0) { params.limit = 100; }

        const offsetIndex = params.offset;
        const limitIndex = params.offset + params.limit;

        let elementsPromise;
        if (params.elementTypeId) {
            elementsPromise =
                this.rdfStorage.match(
                    undefined,
                    PREFIX_FACTORIES.RDF('type'),
                    params.elementTypeId,
                ).then(elementTriples => {
                    return Promise.all(
                        elementTriples.toArray()
                            .filter((t, index) => filter(t.subject, index))
                            .map(
                                el => this.getElementInfo(el.subject.nominalValue, true),
                            ),
                    );
                });
        } else if (params.refElementId && params.refElementLinkId) {
            const refEl = params.refElementId;
            const refLink = params.refElementLinkId;
            if (params.linkDirection === 'in') {
                elementsPromise =
                    this.rdfStorage.match(null, refLink, refEl).then(elementTriples => {
                        return Promise.all(
                            elementTriples.toArray()
                                .filter((t, index) => filter(t.subject, index))
                                .map(el => this.getElementInfo(el.subject.nominalValue, true)),
                        );
                    });
            } else {
                elementsPromise =
                    this.rdfStorage.match(refEl, refLink, null).then(elementTriples => {
                        return Promise.all(
                            elementTriples.toArray()
                                .filter((t, index) => filter(t.object, index))
                                .map(el => this.getElementInfo(el.object.nominalValue, true)),
                        );
                    });
            }
        } else if (params.refElementId) {
            const refEl = params.refElementId;

            elementsPromise = Promise.all([
                this.getElementInfo(refEl, true),
                this.rdfStorage.match(null, null, refEl).then(elementTriples => {
                    return Promise.all(
                        elementTriples.toArray()
                            .filter((t, index) => filter(t.subject, index))
                            .map(el => this.getElementInfo(el.subject.nominalValue, true)),
                    );
                }),
                this.rdfStorage.match(refEl, null, null).then(elementTriples => {
                    return Promise.all(
                        elementTriples.toArray()
                            .filter((t, index) => filter(t.object, index))
                            .map(el => this.getElementInfo(el.object.nominalValue, true)),
                    );
                }),
            ]).then(([refElement, inRelations, outRelations]) => {
                return [refElement].concat(inRelations).concat(outRelations);
            });

        } else if (params.text) {
            elementsPromise =
                this.rdfStorage.match(null, null, null).then(elementTriples => {
                    const triples = elementTriples.toArray();
                    const objectPromises = triples.filter((t, index) => filter(t.object, index))
                            .map(el => this.getElementInfo(el.object.nominalValue, true));
                    const subjectPromises = triples.filter((t, index) => filter(t.subject, index))
                            .map(el => this.getElementInfo(el.subject.nominalValue, true));
                    return Promise.all(objectPromises.concat(subjectPromises));
                });
        } else {
            return Promise.resolve({});
        }

        function filter(node: Node, index: number) {
            return isNamedNode(node) &&
                offsetIndex <= index &&
                index < limitIndex;
        }

        return elementsPromise.then(elements => {
            const result: Dictionary<ElementModel> = {};
            const key = (params.text ? params.text.toLowerCase() : null);

            for (const el of elements) {
                if (key) {
                    let acceptableKey = false;
                    for (const label of el.label.values) {
                        acceptableKey = acceptableKey || label.text.toLowerCase().indexOf(key) !== -1;
                    }
                    if (acceptableKey) {
                        result[el.id] = el;
                    }
                } else {
                    result[el.id] = el;
                }
            }
            return result;
        });
    };

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

    private getElementInfo(id: string, shortInfo?: boolean): Promise<ElementModel> {
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

    private getLabels(id: string): Promise<LocalizedString[]> {
        return this.rdfStorage.getLabels(id).then(labelTriples => {
            const tripleArray = labelTriples.toArray();
            return tripleArray.length > 0 ? labelTriples.toArray().map(l => ({
                text: l.object.nominalValue,
                lang: isLiteral(l.object) ? l.object.language || '' : '',
            })) : this.createLabelFromId(id);
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

    private getTypes(el: string): Promise<string[]> {
        return this.rdfStorage.match(
            el,
            PREFIX_FACTORIES.RDF('type'),
            undefined,
        ).then(typeTriples => {
            return typeTriples.toArray().map(t => t.object.nominalValue);
        });
    }
}

export default RDFDataProvider;
