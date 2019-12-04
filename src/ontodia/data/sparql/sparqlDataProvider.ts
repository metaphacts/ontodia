import { objectValues, getOrCreateArrayInMap } from '../../viewUtils/collections';
import { DataProvider, LinkElementsParams, FilterParams } from '../provider';
import {
    Dictionary, ClassModel, LinkType, ElementModel, LinkModel, LinkCount, PropertyModel,
    ElementIri, ElementTypeIri, LinkTypeIri, PropertyTypeIri, LocalizedString
} from '../model';
import {
    prependAdditionalBindings,
    enrichElementsWithImages,
    flattenClassTree,
    getClassTree,
    getClassInfo,
    getPropertyInfo,
    getLinkTypes,
    getElementsInfo,
    getElementTypes,
    getLinksInfo,
    getLinksTypeIds,
    getFilteredData,
    getLinksTypesOf,
    getLinkStatistics,
    triplesToElementBinding,
    isDirectLink,
    isDirectProperty,
} from './responseHandler';
import {
    ClassBinding, ElementBinding, LinkBinding, PropertyBinding, BlankBinding, FilterBinding,
    LinkCountBinding, LinkTypeBinding, ElementImageBinding, ElementTypeBinding, SparqlResponse, Triple,
} from './sparqlModels';
import { SparqlDataProviderSettings, OWLStatsSettings, LinkConfiguration, PropertyConfiguration } from './sparqlDataProviderSettings';
import * as BlankNodes from './blankNodes';
import { parseTurtleText } from './turtle';

export enum SparqlQueryMethod { GET = 1, POST }

export type QueryFunction = (params: {
    url: string;
    body?: string;
    headers: { [header: string]: string };
    method: string;
}) => Promise<Response>;

/**
 * Runtime settings of SPARQL data provider
 */
export interface SparqlDataProviderOptions {

    /**
     * If it's true then blank nodes will be present on the paper
     * By default blank nodes wont be shown
     */
    acceptBlankNodes?: boolean;

    /**
     *  sparql endpoint URL to use
     */
    endpointUrl: string;

    // there are two options for fetching images: specify imagePropertyUris
    // to use as image properties or specify a function to fetch image URLs

    /**
     * properties to use as image URLs
     */
    imagePropertyUris?: string[];

    /**
     * Allows to extract/fetch image URLs externally instead of using `imagePropertyUris` option.
     */
    prepareImages?: (elementInfo: Dictionary<ElementModel>) => Promise<Dictionary<string>>;

    /**
     * Allows to extract/fetch labels separately from SPARQL query as an alternative or
     * in addition to `label` output binding.
     */
    prepareLabels?: (resources: Set<string>) => Promise<Map<string, LocalizedString[]>>;

    /**
     * wether to use GET (more compatible (Virtuozo), more error-prone due to large request URLs)
     * or POST(less compatible, better on large data sets)
     */
    queryMethod?: SparqlQueryMethod;

    /*
     * function to send sparql requests
     */
    queryFunction?: QueryFunction;
}

export class SparqlDataProvider implements DataProvider {
    readonly options: SparqlDataProviderOptions;
    readonly settings: SparqlDataProviderSettings;

    private linkByPredicate = new Map<string, LinkConfiguration[]>();
    private linkById = new Map<LinkTypeIri, LinkConfiguration>();
    private openWorldLinks: boolean;

    private propertyByPredicate = new Map<string, PropertyConfiguration[]>();
    private openWorldProperties: boolean;

    constructor(
        options: SparqlDataProviderOptions,
        settings: SparqlDataProviderSettings = OWLStatsSettings,
    ) {
        const {queryFunction = queryInternal} = options;
        this.options = {...options, queryFunction};
        this.settings = settings;

        for (const link of settings.linkConfigurations) {
            this.linkById.set(link.id as LinkTypeIri, link);
            const predicate = isDirectLink(link) ? link.path : link.id;
            getOrCreateArrayInMap(this.linkByPredicate, predicate).push(link);
        }
        this.openWorldLinks = settings.linkConfigurations.length === 0 ||
            Boolean(settings.openWorldLinks);

        for (const property of settings.propertyConfigurations) {
            const predicate = isDirectProperty(property) ? property.path : property.id;
            getOrCreateArrayInMap(this.propertyByPredicate, predicate).push(property);
        }
        this.openWorldProperties = settings.propertyConfigurations.length === 0 ||
            Boolean(settings.openWorldProperties);
    }

    async classTree(): Promise<ClassModel[]> {
        const {defaultPrefix, schemaLabelProperty, classTreeQuery} = this.settings;
        if (!classTreeQuery) {
            return [];
        }

        const query = defaultPrefix + resolveTemplate(classTreeQuery, {
            schemaLabelProperty,
        });
        const result = await this.executeSparqlQuery<ClassBinding>(query);
        const classTree = getClassTree(result);

        if (this.options.prepareLabels) {
            await attachLabels(flattenClassTree(classTree), this.options.prepareLabels);
        }

        return classTree;
    }

    async propertyInfo(params: { propertyIds: PropertyTypeIri[] }): Promise<Dictionary<PropertyModel>> {
        const {defaultPrefix, schemaLabelProperty, propertyInfoQuery} = this.settings;

        let properties: Dictionary<PropertyModel>;
        if (propertyInfoQuery) {
            const ids = params.propertyIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
            const query = defaultPrefix + resolveTemplate(propertyInfoQuery, {
                ids,
                schemaLabelProperty,
            });
            const result = await this.executeSparqlQuery<PropertyBinding>(query);
            properties = getPropertyInfo(result);
        } else {
            properties = {};
            for (const id of params.propertyIds) {
                properties[id] = {id, label: {values: []}};
            }
        }

        if (this.options.prepareLabels) {
            await attachLabels(objectValues(properties), this.options.prepareLabels);
        }

        return properties;
    }

    async classInfo(params: { classIds: ElementTypeIri[] }): Promise<ClassModel[]> {
        const {defaultPrefix, schemaLabelProperty, classInfoQuery} = this.settings;

        let classes: ClassModel[];
        if (classInfoQuery) {
            const ids = params.classIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
            const query = defaultPrefix + resolveTemplate(classInfoQuery, {
                ids,
                schemaLabelProperty,
            });
            const result = await this.executeSparqlQuery<ClassBinding>(query);
            classes = getClassInfo(result);
        } else {
            classes = params.classIds.map((id): ClassModel => (
                {id, label: {values: []}, children: []}
            ));
        }

        if (this.options.prepareLabels) {
            await attachLabels(classes, this.options.prepareLabels);
        }

        return classes;
    }

    async linkTypesInfo(params: { linkTypeIds: LinkTypeIri[] }): Promise<LinkType[]> {
        const {defaultPrefix, schemaLabelProperty, linkTypesInfoQuery} = this.settings;

        let linkTypes: LinkType[];
        if (linkTypesInfoQuery) {
            const ids = params.linkTypeIds.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
            const query = defaultPrefix + resolveTemplate(linkTypesInfoQuery, {
                ids,
                schemaLabelProperty,
            });
            const result = await this.executeSparqlQuery<LinkTypeBinding>(query);
            linkTypes = getLinkTypes(result);
        } else {
            linkTypes = params.linkTypeIds.map((id): LinkType => (
                {id, label: {values: []}}
            ));
        }

        if (this.options.prepareLabels) {
            await attachLabels(linkTypes, this.options.prepareLabels);
        }

        return linkTypes;
    }

    async linkTypes(): Promise<LinkType[]> {
        const {defaultPrefix, schemaLabelProperty, linkTypesQuery, linkTypesPattern} = this.settings;
        if (!linkTypesQuery) {
            return [];
        }

        const query = defaultPrefix + resolveTemplate(linkTypesQuery, {
            linkTypesPattern,
            schemaLabelProperty,
        });
        const result = await this.executeSparqlQuery<LinkTypeBinding>(query);
        const linkTypes = getLinkTypes(result);

        if (this.options.prepareLabels) {
            await attachLabels(linkTypes, this.options.prepareLabels);
        }

        return linkTypes;
    }

    async elementInfo(params: { elementIds: ElementIri[] }): Promise<Dictionary<ElementModel>> {
        const nonBlankResources = params.elementIds.filter(id => !BlankNodes.isEncodedBlank(id));
        const blankNodeResponse = this.options.acceptBlankNodes
            ? BlankNodes.elementInfo(params.elementIds) : undefined;

        let triples: Triple[];
        if (nonBlankResources.length > 0) {
            const ids = nonBlankResources.map(escapeIri).map(id => ` (${id})`).join(' ');
            const {defaultPrefix, dataLabelProperty, elementInfoQuery} = this.settings;
            const query = defaultPrefix + resolveTemplate(elementInfoQuery, {
                ids,
                dataLabelProperty,
                propertyConfigurations: this.formatPropertyInfo(),
            });
            triples = await this.executeSparqlConstruct(query);
        } else {
            triples = [];
        }

        const types = this.queryManyElementTypes(
            this.settings.propertyConfigurations.length > 0 ? params.elementIds : []
        );

        const bindings = triplesToElementBinding(triples);
        const bindingsWithBlanks = prependAdditionalBindings(bindings, blankNodeResponse);
        const elementModels = getElementsInfo(
            bindingsWithBlanks,
            await types,
            this.propertyByPredicate,
            this.openWorldProperties
        );

        if (this.options.prepareLabels) {
            await attachLabels(objectValues(elementModels), this.options.prepareLabels);
        }

        if (this.options.prepareImages) {
            await prepareElementImages(this.options.prepareImages, elementModels);
        } else if (this.options.imagePropertyUris && this.options.imagePropertyUris.length) {
            await this.attachImages(elementModels, this.options.imagePropertyUris);
        }

        return elementModels;
    }

    private async attachImages(elementsInfo: Dictionary<ElementModel>, types: string[]): Promise<void> {
        const ids = Object.keys(elementsInfo).filter(id => !BlankNodes.isEncodedBlank(id))
            .map(escapeIri).map(id => ` ( ${id} )`).join(' ');
        const typesString = types.map(escapeIri).map(id => ` ( ${id} )`).join(' ');

        const query = this.settings.defaultPrefix + `
            SELECT ?inst ?linkType ?image
            WHERE {{
                VALUES (?inst) {${ids}}
                VALUES (?linkType) {${typesString}}
                ${this.settings.imageQueryPattern}
            }}
        `;
        try {
            const bindings = await this.executeSparqlQuery<ElementImageBinding>(query);
            enrichElementsWithImages(bindings, elementsInfo);
        } catch (err) {
            // tslint:disable-next-line:no-console
            console.error(err);
        }
    }

    async linksInfo(params: {
        elementIds: ElementIri[];
        linkTypeIds: LinkTypeIri[];
    }): Promise<LinkModel[]> {
        const nonBlankResources = params.elementIds.filter(id => !BlankNodes.isEncodedBlank(id));
        const blankNodeResponse = this.options.acceptBlankNodes
            ? BlankNodes.linksInfo(params.elementIds) : undefined;

        const linkConfigurations = this.formatLinkLinks();

        let bindings: Promise<SparqlResponse<LinkBinding>>;
        let types: Promise<Map<ElementIri, Set<ElementTypeIri>>>;
        if (nonBlankResources.length > 0) {
            const ids = nonBlankResources.map(escapeIri).map(id => ` ( ${id} )`).join(' ');
            const linksInfoQuery =  this.settings.defaultPrefix + resolveTemplate(this.settings.linksInfoQuery, {
                ids,
                linkConfigurations,
            });
            bindings = this.executeSparqlQuery<LinkBinding>(linksInfoQuery);
            types = this.queryManyElementTypes(params.elementIds);
        } else {
            bindings = Promise.resolve({
                head: {vars: []},
                results: {bindings: []},
            });
            types = this.queryManyElementTypes([]);
        }

        const bindingsWithBlanks = prependAdditionalBindings(await bindings, blankNodeResponse);
        const linksInfo = getLinksInfo(
            bindingsWithBlanks,
            await types,
            this.linkByPredicate,
            this.openWorldLinks
        );
        return linksInfo;
    }

    async linkTypesOf(params: { elementId: ElementIri }): Promise<LinkCount[]> {
        if (this.options.acceptBlankNodes && BlankNodes.isEncodedBlank(params.elementId)) {
            return Promise.resolve(getLinksTypesOf(BlankNodes.linkTypesOf(params)));
        }
        const {defaultPrefix, linkTypesOfQuery, linkTypesStatisticsQuery, filterTypePattern} = this.settings;

        const elementIri = escapeIri(params.elementId);
        const forAll = this.formatLinkUnion(
            params.elementId, undefined, undefined, '?outObject', '?inObject', false
        );
        if (forAll.usePredicatePart) {
            forAll.unionParts.push(`{ ${elementIri} ?link ?outObject }`);
            forAll.unionParts.push(`{ ?inObject ?link ${elementIri} }`);
        }

        const query = defaultPrefix + resolveTemplate(linkTypesOfQuery, {
            elementIri,
            linkConfigurations: forAll.unionParts.join('\nUNION\n'),
        });

        const linkTypeBindings = await this.executeSparqlQuery<LinkTypeBinding>(query);
        const linkTypeIds = getLinksTypeIds(linkTypeBindings, this.linkByPredicate, this.openWorldLinks);

        const navigateElementFilterOut = this.options.acceptBlankNodes
            ? `FILTER (IsIri(?outObject) || IsBlank(?outObject))`
            : `FILTER IsIri(?outObject)`;
        const navigateElementFilterIn = this.options.acceptBlankNodes
            ? `FILTER (IsIri(?inObject) || IsBlank(?inObject))`
            : `FILTER IsIri(?inObject)`;

        const foundLinkStats: LinkCount[] = [];
        await Promise.all(linkTypeIds.map(async linkId => {
            const linkConfig = this.linkById.get(linkId);
            let linkConfigurationOut: string;
            let linkConfigurationIn: string;

            if (!linkConfig || isDirectLink(linkConfig)) {
                const predicate = escapeIri(linkConfig && isDirectLink(linkConfig) ? linkConfig.path : linkId);
                linkConfigurationOut = `${elementIri} ${predicate} ?outObject`;
                linkConfigurationIn = `?inObject ${predicate} ${elementIri}`;
            } else {
                linkConfigurationOut = this.formatLinkPath(linkConfig.path, elementIri, '?outObject');
                linkConfigurationIn = this.formatLinkPath(linkConfig.path, '?inObject', elementIri);
            }

            if (linkConfig && linkConfig.domain?.length > 0) {
                const commaSeparatedDomains = linkConfig.domain.map(escapeIri).join(', ');
                const restrictionOut = filterTypePattern.replace(/[?$]inst\b/g, elementIri);
                const restrictionIn = filterTypePattern.replace(/[?$]inst\b/g, '?inObject');
                linkConfigurationOut += ` { ${restrictionOut} FILTER(?class IN (${commaSeparatedDomains})) }`;
                linkConfigurationIn += ` { ${restrictionIn} FILTER(?class IN (${commaSeparatedDomains})) }`;
            }

            const statsQuery = defaultPrefix + resolveTemplate(linkTypesStatisticsQuery, {
                linkId: escapeIri(linkId),
                elementIri,
                linkConfigurationOut,
                linkConfigurationIn,
                navigateElementFilterOut,
                navigateElementFilterIn,
            });

            const bindings = await this.executeSparqlQuery<LinkCountBinding>(statsQuery);
            const linkStats = getLinkStatistics(bindings);
            if (linkStats) {
                foundLinkStats.push(linkStats);
            }
        }));
        return foundLinkStats;
    }

    linkElements(params: LinkElementsParams): Promise<Dictionary<ElementModel>> {
        // for sparql we have rich filtering features and we just reuse filter.
        return this.filter({
            refElementId: params.elementId,
            refElementLinkId: params.linkId,
            linkDirection: params.direction,
            limit: params.limit,
            offset: params.offset,
            languageCode: ''
        });
    }

    async filter(baseParams: FilterParams): Promise<Dictionary<ElementModel>> {
        const params: FilterParams = {...baseParams};
        if (params.limit === undefined) {
            params.limit = 100;
        }

        // query types to match link configuration domains
        const types = this.querySingleElementTypes(
            params.refElementId && this.settings.linkConfigurations.length > 0
                ? params.refElementId : undefined
        );

        const blankFiltration = this.options.acceptBlankNodes ? BlankNodes.filter(params) : undefined;
        if (blankFiltration && blankFiltration.results.bindings.length > 0) {
            return getFilteredData(blankFiltration, await types, this.linkByPredicate, this.openWorldLinks);
        }

        const filterQuery = this.createFilterQuery(params);
        const bindings = await this.executeSparqlQuery<ElementBinding & FilterBinding>(filterQuery);

        let bindingsWithBlanks: SparqlResponse<ElementBinding & FilterBinding>;
        if (this.options.acceptBlankNodes) {
            bindingsWithBlanks = await BlankNodes.updateFilterResults(
                bindings,
                blankQuery => this.executeSparqlQuery<BlankBinding>(blankQuery),
                this.settings
            );
        } else {
            bindingsWithBlanks = bindings as SparqlResponse<ElementBinding & FilterBinding>;
        }

        const elementModels = getFilteredData(
            bindingsWithBlanks, await types, this.linkByPredicate, this.openWorldLinks
        );

        if (this.options.prepareLabels) {
            await attachLabels(objectValues(elementModels), this.options.prepareLabels);
        }

        return elementModels;
    }

    private createFilterQuery(params: FilterParams): string {
        if (!params.refElementId && params.refElementLinkId) {
            throw new Error('Cannot execute refElementLink filter without refElement');
        }

        let outerProjection = '?inst ?class ?label ?blankType';
        let innerProjection = '?inst';

        let refQueryPart = '';
        let refQueryTypes = '';
        if (params.refElementId) {
            outerProjection += ' ?link ?direction';
            innerProjection += ' ?link ?direction';
            refQueryPart = this.createRefQueryPart({
                elementId: params.refElementId,
                linkId: params.refElementLinkId,
                direction: params.linkDirection,
            });

            if (this.settings.linkConfigurations.length > 0) {
                outerProjection += ' ?classAll';
                refQueryTypes = this.settings.filterTypePattern.replace(/[?$]class\b/g, '?classAll');
            }
        }

        let elementTypePart = '';
        if (params.elementTypeId) {
            const elementTypeIri = escapeIri(params.elementTypeId);
            elementTypePart = this.settings.filterTypePattern.replace(/[?$]class\b/g, elementTypeIri);
        }

        const {defaultPrefix, fullTextSearch, dataLabelProperty} = this.settings;

        let textSearchPart = '';
        if (params.text) {
            innerProjection += ' ?score';
            if (this.settings.fullTextSearch.extractLabel) {
                textSearchPart += sparqlExtractLabel('?inst', '?extractedLabel');
            }
            textSearchPart = resolveTemplate(fullTextSearch.queryPattern, {text: params.text, dataLabelProperty});
        }

        const blankNodes = this.options.acceptBlankNodes;
        if (blankNodes) {
            outerProjection += ` ${BlankNodes.BLANK_NODE_QUERY_PARAMETERS}`;
        }

        return `${defaultPrefix}
            ${fullTextSearch.prefix}

        SELECT ${outerProjection}
        WHERE {
            {
                SELECT DISTINCT ${innerProjection} WHERE {
                    ${elementTypePart}
                    ${refQueryPart}
                    ${textSearchPart}
                    ${this.settings.filterAdditionalRestriction}
                }
                ${textSearchPart ? 'ORDER BY DESC(?score)' : ''}
                LIMIT ${params.limit} OFFSET ${params.offset}
            }
            ${refQueryTypes}
            ${resolveTemplate(this.settings.filterElementInfoPattern, {dataLabelProperty})}
            ${blankNodes ? BlankNodes.BLANK_NODE_QUERY : ''}
        } ${textSearchPart ? 'ORDER BY DESC(?score)' : ''}
        `;
    }

    executeSparqlQuery<Binding>(query: string) {
        const method = this.options.queryMethod ? this.options.queryMethod : SparqlQueryMethod.GET;
        return executeSparqlQuery<Binding>(this.options.endpointUrl, query, method, this.options.queryFunction);
    }

    executeSparqlConstruct(query: string): Promise<Triple[]> {
        const method = this.options.queryMethod ? this.options.queryMethod : SparqlQueryMethod.GET;
        return executeSparqlConstruct(this.options.endpointUrl, query, method, this.options.queryFunction);
    }

    protected createRefQueryPart(params: { elementId: ElementIri; linkId?: LinkTypeIri; direction?: 'in' | 'out' }) {
        const {elementId, linkId, direction} = params;

        const {unionParts, usePredicatePart} = this.formatLinkUnion(
            elementId, linkId, direction, '?inst', '?inst', true
        );

        if (usePredicatePart) {
            const refElementIRI = escapeIri(params.elementId);
            let refLinkType: string | undefined;
            if (linkId) {
                const link = this.linkById.get(linkId);
                refLinkType = link && isDirectLink(link) ? escapeIri(link.path) : escapeIri(linkId);
            }

            const linkPattern = refLinkType || '?link';
            const bindType = refLinkType ? `BIND(${refLinkType} as ?link)` : '';
            // FILTER ISIRI is used to prevent blank nodes appearing in results
            const blankFilter = this.options.acceptBlankNodes
                ? 'FILTER(isIri(?inst) || isBlank(?inst))'
                : 'FILTER(isIri(?inst))';

            if (!direction || direction === 'out') {
                unionParts.push(`{ ${refElementIRI} ${linkPattern} ?inst BIND("out" as ?direction) ${bindType} ${blankFilter} }`);
            }
            if (!direction || direction === 'in') {
                unionParts.push(`{ ?inst ${linkPattern} ${refElementIRI} BIND("in" as ?direction) ${bindType} ${blankFilter} }`);
            }
        }

        let resultPattern = unionParts.length === 0 ? 'FILTER(false)' : unionParts.join(`\nUNION\n`);

        const useAllLinksPattern = !linkId && this.settings.filterRefElementLinkPattern.length > 0;
        if (useAllLinksPattern) {
            resultPattern += `\n${this.settings.filterRefElementLinkPattern}`;
        }

        return resultPattern;
    }

    private formatLinkUnion(
        refElementIri: ElementIri,
        linkIri: LinkTypeIri | undefined,
        direction: 'in' | 'out' | undefined,
        outElementVar: string,
        inElementVar: string,
        bindDirection: boolean
    ) {
        const {linkConfigurations} = this.settings;
        const fixedIri = escapeIri(refElementIri);

        const unionParts: string[] = [];
        let hasDirectLink = false;

        for (const link of linkConfigurations) {
            if (linkIri && link.id !== linkIri) { continue; }
            if (isDirectLink(link)) {
                hasDirectLink = true;
            } else {
                const linkType = escapeIri(link.id);
                if (!direction || direction === 'out') {
                    const path = this.formatLinkPath(link.path, fixedIri, outElementVar);
                    const boundedDirection = bindDirection ? `BIND("out" as ?direction) ` : '';
                    unionParts.push(
                        `{ ${path} BIND(${linkType} as ?link) ${boundedDirection}}`
                    );
                }
                if (!direction || direction === 'in') {
                    const path = this.formatLinkPath(link.path, inElementVar, fixedIri);
                    const boundedDirection = bindDirection ? `BIND("in" as ?direction) ` : '';
                    unionParts.push(
                        `{ ${path} BIND(${linkType} as ?link) ${boundedDirection}}`
                    );
                }
            }
        }

        const usePredicatePart = this.openWorldLinks || hasDirectLink;
        return {unionParts, usePredicatePart};
    }

    formatLinkLinks(): string {
        const unionParts: string[] = [];
        let hasDirectLink = false;
        for (const link of this.settings.linkConfigurations) {
            if (isDirectLink(link)) {
                hasDirectLink = true;
            } else {
                const linkType = escapeIri(link.id);
                unionParts.push(
                    `{ ${this.formatLinkPath(link.path, '?source', '?target')} BIND(${linkType} as ?type) }`
                );
            }
        }

        const usePredicatePart = this.openWorldLinks || hasDirectLink;
        if (usePredicatePart) {
            unionParts.push(`{ ?source ?type ?target }`);
        }

        return unionParts.join('\nUNION\n');
    }

    formatLinkPath(path: string, source: string, target: string): string {
        return path.replace(/[?$]source\b/g, source).replace(/[?$]target\b/g, target);
    }

    formatPropertyInfo(): string {
        const unionParts: string[] = [];
        let hasDirectProperty = false;
        for (const property of this.settings.propertyConfigurations) {
            if (isDirectProperty(property)) {
                hasDirectProperty = true;
            } else {
                const propType = escapeIri(property.id);
                const formatted = this.formatPropertyPath(property.path, '?inst', '?propValue');
                unionParts.push(
                    `{ ${formatted} BIND(${propType} as ?propType) }`
                );
            }
        }

        const usePredicatePart = this.openWorldProperties || hasDirectProperty;
        if (usePredicatePart) {
            unionParts.push(`{ ?inst ?propType ?propValue }`);
        }

        return unionParts.join('\nUNION\n');
    }

    formatPropertyPath(path: string, subject: string, value: string): string {
        return path.replace(/[?$]inst\b/g, subject).replace(/[?$]value\b/g, value);
    }

    private async querySingleElementTypes(element: ElementIri | undefined): Promise<Set<ElementTypeIri> | undefined> {
        const types = await this.queryManyElementTypes(element ? [element] : []);
        return types.get(element);
    }

    private async queryManyElementTypes(
        elements: ReadonlyArray<ElementIri>
    ): Promise<Map<ElementIri, Set<ElementTypeIri>>> {
        if (elements.length === 0) {
            return new Map();
        }
        const {filterTypePattern} = this.settings;
        const ids = elements
            .filter(iri => !BlankNodes.isEncodedBlank(iri))
            .map(iri => `(${escapeIri(iri)})`).join(' ');

        const queryTemplate = `SELECT ?inst ?class { VALUES(?inst) { \${ids} } \${filterTypePattern} }`;
        const query = resolveTemplate(queryTemplate, {ids, filterTypePattern});
        let response = await this.executeSparqlQuery<ElementTypeBinding>(query);

        if (this.options.acceptBlankNodes && elements.find(BlankNodes.isEncodedBlank)) {
            const blankResponse = BlankNodes.getElementTypes(elements);
            response = prependAdditionalBindings(response, blankResponse);
        }

        return getElementTypes(response);
    }
}

interface LabeledItem {
    id: string;
    label: { values: LocalizedString[] };
}

async function attachLabels(
    items: ReadonlyArray<LabeledItem>,
    fetchLabels: SparqlDataProviderOptions['prepareLabels']
): Promise<void> {
    const resources = new Set<string>();
    for (const item of items) {
        if (BlankNodes.isEncodedBlank(item.id)) { continue; }
        resources.add(item.id);
    }
    const labels = await fetchLabels(resources);
    for (const item of items) {
        if (labels.has(item.id)) {
            item.label = {values: labels.get(item.id)};
        }
    }
}

function prepareElementImages(
    fetchImages: SparqlDataProviderOptions['prepareImages'],
    elementsInfo: Dictionary<ElementModel>
): Promise<void> {
    return fetchImages(elementsInfo).then(images => {
        for (const iri in images) {
            if (Object.prototype.hasOwnProperty.call(images, iri) && elementsInfo[iri]) {
                elementsInfo[iri].image = images[iri];
            }
        }
    });
}

function resolveTemplate(template: string, values: Dictionary<string>) {
    let result = template;
    for (const replaceKey in values) {
        if (!values.hasOwnProperty(replaceKey)) { continue; }
        const replaceValue = values[replaceKey];
        if (replaceValue) {
            result = result.replace(new RegExp('\\${' + replaceKey + '}', 'g'), replaceValue);
        }
    }
    return result;
}

export function executeSparqlQuery<Binding>(
    endpoint: string,
    query: string,
    method: SparqlQueryMethod,
    queryFunction: QueryFunction,
): Promise<SparqlResponse<Binding>> {
    let internalQuery: Promise<Response>;
    if (method === SparqlQueryMethod.GET) {
        internalQuery = queryFunction({
            url: appendQueryParams(endpoint, {query}),
            headers: {
                'Accept': 'application/sparql-results+json',
            },
            method: 'GET',
        });
    } else {
        internalQuery = queryFunction({
            url: endpoint,
            body: query,
            headers: {
                'Accept': 'application/sparql-results+json',
                'Content-Type': 'application/sparql-query; charset=UTF-8',
            },
            method: 'POST',
        });
    }
    return internalQuery.then((response): Promise<SparqlResponse<Binding>> => {
        if (response.ok) {
            return response.json();
        } else {
            const error = new Error(response.statusText);
            (error as any).response = response;
            throw error;
        }
    });
}

export function executeSparqlConstruct(
    endpoint: string,
    query: string,
    method: SparqlQueryMethod,
    queryFunction: QueryFunction,
): Promise<Triple[]> {
    let internalQuery: Promise<Response>;
    if (method === SparqlQueryMethod.GET) {
        internalQuery = queryFunction({
            url: appendQueryParams(endpoint, {query}),
            headers: {
                'Accept': 'text/turtle',
            },
            method: 'GET',
        });
    } else {
        internalQuery = queryFunction({
            url: endpoint,
            body: query,
            headers: {
                'Accept': 'text/turtle',
                'Content-Type': 'application/sparql-query; charset=UTF-8',
            },
            method: 'POST',
        });
    }
    return internalQuery.then(response => {
        if (response.ok) {
            return response.text();
        } else {
            const error = new Error(response.statusText);
            (error as any).response = response;
            throw error;
        }
    }).then(parseTurtleText);
}

function appendQueryParams(endpoint: string, queryParams: { [key: string]: string } = {}) {
    const initialSeparator = endpoint.indexOf('?') < 0 ? '?' : '&';
    const additionalParams = initialSeparator + Object.keys(queryParams)
        .map(key => `${key}=${encodeURIComponent(queryParams[key])}`)
        .join('&');
    return endpoint + additionalParams;
}

function queryInternal(params: {
    url: string;
    body?: string;
    headers: any;
    method: string;
}) {
    return fetch(params.url, {
        method: params.method,
        body: params.body,
        credentials: 'same-origin',
        mode: 'cors',
        cache: 'default',
        headers: params.headers,
    });
}

function sparqlExtractLabel(subject: string, label: string): string {
    return  `
        BIND ( str( ${subject} ) as ?uriStr)
        BIND ( strafter(?uriStr, "#") as ?label3)
        BIND ( strafter(strafter(?uriStr, "//"), "/") as ?label6)
        BIND ( strafter(?label6, "/") as ?label5)
        BIND ( strafter(?label5, "/") as ?label4)
        BIND (if (?label3 != "", ?label3,
            if (?label4 != "", ?label4,
            if (?label5 != "", ?label5, ?label6))) as ${label})
    `;
}

function escapeIri(iri: string) {
    if (typeof iri !== 'string') {
        throw new Error(`Cannot escape IRI of type "${typeof iri}"`);
    }
    return `<${iri}>`;
}
