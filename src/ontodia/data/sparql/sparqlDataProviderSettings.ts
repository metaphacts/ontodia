/**
 * this is dataset-schema specific settings
 */
export interface SparqlDataProviderSettings {
    /**
     * default prefix to be used in every query
     */
    defaultPrefix: string;

    /**
     *  property to use as label in schema (classes, properties)
     */
    schemaLabelProperty: string;

    /**
     * property to use as instance label
     * todo: make it an array
     */
    dataLabelProperty: string;

    /**
     * full-text search settings
     */
    fullTextSearch: FullTextSearchSettings;

    /**
     * query to retreive class tree. Should return class, label, parent, instcount (optional)
     */
    classTreeQuery: string;

    /**
     * link types pattern - what to consider a link on initial fetch
     */
    linkTypesPattern: string;

    /**
     * query for fetching all information on element: labels, classes, properties
     */
    elementInfoQuery: string;

    /**
     * Query on all links between said instances. Should return source type target
     */
    linksInfoQuery: string;

    /**
     * this should return image URL for ?inst as instance and ?linkType for image property IRI
     * todo: move to runtime settings instead? proxying is runtime thing
     */
    imageQueryPattern: string;

    /**
     * link types of returns possible link types from specified instance with statistics
     */
    linkTypesOfQuery: string;

    /**
     * link types of stats returns statistics of a link type for specified resource.
     * To support blank nodes, query should use ?inObject and ?outObject variables for counting incoming and
     * outgoing links, and provide ${navigateElementFilterOut} and ${navigateElementFilterIn} variables,
     * see OWLRDFSSettings for example
     */
    linkTypesStatisticsQuery: string;

    /**
     * when fetching all links from element, we could specify additional filter
     */
    filterRefElementLinkPattern: string;

    /**
     * filter by type pattern. One could use transitive type resolution here.
     */
    filterTypePattern: string;

    /**
     * how to fetch elements info when fetching data.
     */
    filterElementInfoPattern: string;

    /**
     * imposes additional filtering on elements within filter
     */
    filterAdditionalRestriction: string;

    /**
     * Abstract links configuration - one could abstract a property path as a link on the diagram
     * If you choose to set linkConfiguration, please ensure you'll have corresponding handling of linkConfiguration in
     * linkTypeOf query, refElement* queries, linkInfos query.
     */
    linkConfigurations: LinkConfiguration[];
}

/**
 * Full text search settings,
 * developer could use anything from search extensions of triplestore to regular expressions match
 * See wikidata and dbpedia examples for reusing full text search capabilities of Blazegraph and Virtuozo
 */
export interface FullTextSearchSettings {
    /**
     * prefix to use in FTS queries
     */
    prefix: string;

    /**
     * query pattern should return ?inst and ?score for given ${text}.
     */
    queryPattern: string;

    /**
     * try to extract label from IRI for usage in search purposes.
     * If you have no labels in the dataset and want to search, you
     * can use ?extractedLabel as something to search for.
     */
    extractLabel?: boolean;
}

export interface LinkConfiguration {
    id: string;
    inverseId: string;
    path: string;
    properties?: string;
}

export const RDFSettings: SparqlDataProviderSettings = {
    linkConfigurations: [],

    linksInfoQuery: `SELECT ?source ?type ?target
            WHERE {
                ?source ?type ?target.
                VALUES (?source) {\${ids}}
                VALUES (?target) {\${ids}}                
            }`,

    defaultPrefix: '',

    schemaLabelProperty: 'rdfs:label',
    dataLabelProperty: 'rdfs:label',

    fullTextSearch: {
        prefix: '',
        queryPattern: ``,
    },

    classTreeQuery: ``,

    linkTypesPattern: ``,

    elementInfoQuery: ``,
    imageQueryPattern: ``,

    linkTypesOfQuery: ``,
    linkTypesStatisticsQuery: ``,
    filterRefElementLinkPattern: '',
    filterTypePattern: ``,
    filterAdditionalRestriction: ``,
    filterElementInfoPattern: ``,
};

const WikidataSettingsOverride: Partial<SparqlDataProviderSettings> = {
    defaultPrefix:
        `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
 PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
 PREFIX wdt: <http://www.wikidata.org/prop/direct/>
 PREFIX wd: <http://www.wikidata.org/entity/>
 PREFIX owl:  <http://www.w3.org/2002/07/owl#>

`,

    schemaLabelProperty: 'rdfs:label',
    dataLabelProperty: 'rdfs:label',

    fullTextSearch: {
        prefix: 'PREFIX bds: <http://www.bigdata.com/rdf/search#>' + '\n',
        queryPattern: ` 
              ?inst rdfs:label ?searchLabel. 
              SERVICE bds:search {
                     ?searchLabel bds:search "\${text}*" ;
                                  bds:minRelevance '0.5' ;
                                  bds:matchAllTerms 'true' .
              }
              BIND(IF(STRLEN(?strInst) > 33,
                            0-<http://www.w3.org/2001/XMLSchema#integer>(SUBSTR(?strInst, 33)),
                            -10000) as ?score)
            `,
    },

    classTreeQuery: `
            SELECT distinct ?class ?label ?parent WHERE {
              ?class rdfs:label ?label.                            
              { ?class wdt:P279 wd:Q35120. }
                UNION 
              { ?parent wdt:P279 wd:Q35120.
                ?class wdt:P279 ?parent. }
                UNION 
              { ?parent wdt:P279/wdt:P279 wd:Q35120.
                ?class wdt:P279 ?parent. }
            }
        `,

    // todo: think more, maybe add a limit here?
    linkTypesPattern: `?link wdt:P279* wd:Q18616576.
    BIND(0 as ?instcount)
`,

    elementInfoQuery: `
        CONSTRUCT {
            ?inst rdf:type ?class .
            ?inst rdfs:label ?label .
            ?inst ?propType ?propValue.
        } WHERE {
            VALUES (?inst) {\${ids}}
            OPTIONAL {
                ?inst wdt:P31 ?class .
            }
            OPTIONAL {?inst rdfs:label ?label}
            OPTIONAL {
                ?inst ?propType ?propValue .
                FILTER (isLiteral(?propValue))
            }
        }
    `,
    imageQueryPattern: ` { ?inst ?linkType ?fullImage } union { ?inst wdt:P163/wdt:P18 ?fullImage }
                BIND(CONCAT("https://commons.wikimedia.org/w/thumb.php?f=",
                    STRAFTER(STR(?fullImage), "Special:FilePath/"), "&w=200") AS ?image)`,
    linkTypesOfQuery: `
        SELECT DISTINCT ?link
        WHERE {
            {
                \${elementIri} ?link ?outObject
            } UNION {
                ?inObject ?link \${elementIri}
            }
            ?claim <http://wikiba.se/ontology#directClaim> ?link . 
        }
    `,
    linkTypesStatisticsQuery: `
        SELECT (\${linkId} as ?link) (COUNT(?outObject) AS ?outCount) (COUNT(?inObject) AS ?inCount)
        WHERE {
            {
                {
                    SELECT DISTINCT ?outObject WHERE {
                        \${elementIri} \${linkId} ?outObject.
                        FILTER(ISIRI(?outObject))
                        ?outObject ?someprop ?someobj.
                    }
                    LIMIT 101
                }
            } UNION {
                {
                    SELECT DISTINCT ?inObject WHERE {
                        ?inObject \${linkId} \${elementIri}.
                        FILTER(ISIRI(?inObject))
                        ?inObject ?someprop ?someobj.
                    }
                    LIMIT 101
                }
            }
        }
    `,
    filterRefElementLinkPattern: '?claim <http://wikiba.se/ontology#directClaim> ?link .',
    filterTypePattern: `?inst wdt:P31 ?instType. ?instType wdt:P279* \${elementTypeIri} . ${'\n'}`,
    filterAdditionalRestriction: `FILTER ISIRI(?inst)
                        BIND(STR(?inst) as ?strInst)
                        FILTER exists {?inst ?someprop ?someobj}
`,
    filterElementInfoPattern: `OPTIONAL {?inst wdt:P31 ?foundClass}
                BIND (coalesce(?foundClass, owl:Thing) as ?class)
                OPTIONAL {?inst rdfs:label ?label}
`,

};

export const WikidataSettings: SparqlDataProviderSettings = {...RDFSettings, ...WikidataSettingsOverride};

export const OWLRDFSSettingsOverride: Partial<SparqlDataProviderSettings> = {
    defaultPrefix:
        `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
 PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
 PREFIX owl:  <http://www.w3.org/2002/07/owl#> 
`,
    schemaLabelProperty: 'rdfs:label',
    dataLabelProperty: 'rdfs:label',
    fullTextSearch: {
        prefix: '',
        queryPattern:
        ` OPTIONAL {?inst \${dataLabelProperty} ?search1}
        FILTER regex(COALESCE(str(?search1), str(?extractedLabel)), "\${text}", "i")
        BIND(0 as ?score)
`,
        extractLabel: true,
    },
    classTreeQuery: `
            SELECT ?class ?label ?parent
            WHERE {
                {
                    ?class a rdfs:Class
                } UNION {
                    ?class a owl:Class
                }
                FILTER ISIRI(?class)
                OPTIONAL {?class rdfs:label ?label}
                OPTIONAL {?class rdfs:subClassOf ?parent. FILTER ISIRI(?parent)}
            }
        `,

    // todo: think more, maybe add a limit here?
    linkTypesPattern: `{	?link a rdf:Property
                    } UNION {
                    ?link a owl:ObjectProperty
                }
                BIND('' as ?instcount)
    `,
    elementInfoQuery: `
        CONSTRUCT {
            ?inst rdf:type ?class .
            ?inst rdfs:label ?label .
            ?inst ?propType ?propValue.
        } WHERE {
            VALUES (?inst) {\${ids}}
            OPTIONAL {?inst rdf:type ?class . }
            OPTIONAL {?inst \${dataLabelProperty} ?label}
            OPTIONAL {?inst ?propType ?propValue.
            FILTER (isLiteral(?propValue)) }
        }
    `,
    imageQueryPattern: `{ ?inst ?linkType ?image } UNION { [] ?linkType ?inst. BIND(?inst as ?image) }`,
    linkTypesOfQuery: `
        SELECT DISTINCT ?link
        WHERE {
            { \${elementIri} ?link ?outObject }
            UNION 
            { ?inObject ?link \${elementIri} }
        }
    `,
    linkTypesStatisticsQuery: `
        SELECT ?link ?outCount ?inCount
        WHERE {
            { 
                SELECT (\${linkId} as ?link) (count(?outObject) as ?outCount) WHERE {
                    \${elementIri} \${linkId} ?outObject.
                    \${navigateElementFilterOut}
                } LIMIT 101
            } {
                SELECT (\${linkId} as ?link) (count(?inObject) as ?inCount) WHERE {
                    ?inObject \${linkId} \${elementIri}.
                    \${navigateElementFilterIn}
                } LIMIT 101
            } 
        }
    `,
    filterRefElementLinkPattern: '',
    filterTypePattern: `?inst rdf:type \${elementTypeIri} . ${'\n'}`,
    filterElementInfoPattern: `OPTIONAL {?inst rdf:type ?foundClass}
                BIND (coalesce(?foundClass, owl:Thing) as ?class)
                OPTIONAL {?inst \${dataLabelProperty} ?label}`,
    filterAdditionalRestriction: '',
};

export const OWLRDFSSettings: SparqlDataProviderSettings = {...RDFSettings, ...OWLRDFSSettingsOverride};

const OWLStatsOverride: Partial<SparqlDataProviderSettings> = {
    classTreeQuery: `
        SELECT ?class ?instcount ?label ?parent
        WHERE {
            {SELECT ?class (count(?inst) as ?instcount)
                WHERE {
                    ?inst rdf:type ?class.
                    FILTER ISIRI(?class)
                } GROUP BY ?class } UNION
            {
                ?class rdf:type rdfs:Class
            } UNION {
                ?class rdf:type owl:Class
            }
            OPTIONAL {?class rdfs:label ?label}
            OPTIONAL {?class rdfs:subClassOf ?parent. FILTER ISIRI(?parent)}
        }
    `,
};
export const OWLStatsSettings: SparqlDataProviderSettings = {...OWLRDFSSettings, ...OWLStatsOverride};

const DBPediaOverride: Partial<SparqlDataProviderSettings> = {
    fullTextSearch: {
        prefix: 'PREFIX dbo: <http://dbpedia.org/ontology/>\n',
        queryPattern: ` 
              ?inst rdfs:label ?searchLabel.
              ?searchLabel bif:contains "\${text}".
              ?inst dbo:wikiPageID ?origScore .
              BIND(0-?origScore as ?score)
        `,
    },

    classTreeQuery: `
        SELECT distinct ?class ?label ?parent WHERE {
            ?class rdfs:label ?label.                            
            OPTIONAL {?class rdfs:subClassOf ?parent}
            ?root rdfs:subClassOf owl:Thing.
            ?class rdfs:subClassOf? | rdfs:subClassOf/rdfs:subClassOf ?root
        }
    `,

    elementInfoQuery: `
        CONSTRUCT {
            ?inst rdf:type ?class .
            ?inst rdfs:label ?label .
            ?inst ?propType ?propValue.
        } WHERE {
            VALUES (?inst) {\${ids}}
            ?inst rdf:type ?class . 
            ?inst rdfs:label ?label .
            FILTER (!contains(str(?class), 'http://dbpedia.org/class/yago'))
            OPTIONAL {?inst ?propType ?propValue.
            FILTER (isLiteral(?propValue)) }
        }
    `,

    filterElementInfoPattern: `
        OPTIONAL {?inst rdf:type ?foundClass. FILTER (!contains(str(?foundClass), 'http://dbpedia.org/class/yago'))}
        BIND (coalesce(?foundClass, owl:Thing) as ?class)
        OPTIONAL {?inst \${dataLabelProperty} ?label}`,

    imageQueryPattern: ` { ?inst ?linkType ?fullImage } UNION { [] ?linkType ?inst. BIND(?inst as ?fullImage) }
            BIND(CONCAT("https://commons.wikimedia.org/w/thumb.php?f=",
            STRAFTER(STR(?fullImage), "Special:FilePath/"), "&w=200") AS ?image)
    `,
};
export const DBPediaSettings: SparqlDataProviderSettings = {...OWLRDFSSettings, ...DBPediaOverride};
