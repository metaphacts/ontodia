export function getData (): string {
  return `
# baseURI: http://edg.topbraid.solutions/1.0/schema/datamodels
# imports: http://edg.topbraid.solutions/1.0/schema/core
# imports: http://edg.topbraid.solutions/1.0/schema/datatypes
# imports: http://edg.topbraid.solutions/1.0/schema/glossary
# imports: http://edg.topbraid.solutions/1.0/schema/governance
# imports: http://spinrdf.org/spin
# imports: http://topbraid.org/metadata
# imports: http://topbraid.org/tosh

@prefix afn: <http://jena.hpl.hp.com/ARQ/function#> .
@prefix arg: <http://spinrdf.org/arg#> .
@prefix dash: <http://datashapes.org/dash#> .
@prefix datatype: <http://qudt.org/vocab/datatype/> .
@prefix dc: <http://purl.org/dc/elements/1.1/> .
@prefix dcam: <http://purl.org/dc/dcam/> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dtype: <http://www.linkedmodel.org/schema/dtype#> .
@prefix edg: <http://edg.topbraid.solutions/model/> .
@prefix edg-glossary: <http://edg.topbraid.solutions/glossary/> .
@prefix edg-sqoop: <http://edg.topbraid.solutions/model/sqoop/> .
@prefix fn: <http://www.w3.org/2005/xpath-functions#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix metadata: <http://topbraid.org/metadata#> .
@prefix org: <http://www.w3.org/ns/org#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix provo: <http://www.w3.org/ns/prov#> .
@prefix quantity: <http://qudt.org/vocab/quantity/> .
@prefix qudt: <http://qudt.org/schema/qudt/> .
@prefix qudt-refdata: <http://qudt.org/vocab/refdata/> .
@prefix qudt-type: <http://qudt.org/vocab/type/> .
@prefix raci: <http://topbraid.org/raci#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix rdm: <http://rdm.topbraidlive.org/rdm/> .
@prefix rdmfact: <http://topbraid.org/rdmfact#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix sioc: <http://rdfs.org/sioc/ns#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix sp: <http://spinrdf.org/sp#> .
@prefix spif: <http://spinrdf.org/spif#> .
@prefix spin: <http://spinrdf.org/spin#> .
@prefix spl: <http://spinrdf.org/spl#> .
@prefix swa: <http://topbraid.org/swa#> .
@prefix tosh: <http://topbraid.org/tosh#> .
@prefix ui: <http://uispin.org/ui#> .
@prefix unit: <http://qudt.org/vocab/unit/> .
@prefix vaem: <http://www.linkedmodel.org/schema/vaem#> .
@prefix voag: <http://voag.linkedmodel.org/schema/voag#> .
@prefix vs: <http://www.w3.org/2003/06/sw-vocab-status/ns#> .
@prefix wot: <http://xmlns.com/wot/0.1/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<http://edg.topbraid.solutions/1.0/schema/datamodels>
  rdf:type owl:Ontology ;
  vaem:hasGraphMetadata <http://edg.topbraid.solutions/schema/datamodels/GMD_datamodels> ;
  rdfs:label "EDG Schema - Data Models" ;
  owl:imports <http://edg.topbraid.solutions/1.0/schema/core> ;
  owl:imports <http://edg.topbraid.solutions/1.0/schema/datatypes> ;
  owl:imports <http://edg.topbraid.solutions/1.0/schema/glossary> ;
  owl:imports <http://edg.topbraid.solutions/1.0/schema/governance> ;
  owl:imports <http://spinrdf.org/spin> ;
  owl:imports <http://topbraid.org/metadata> ;
  owl:imports <http://topbraid.org/tosh> ;
  owl:versionInfo "Created with TopBraid Composer" ;
.
edg:Asset
  rdfs:subClassOf owl:Thing ;
.
edg:AvroSchemaFile
  rdf:type edg:ConstructClass ;
  dcterms:description """<p><strong>Avro</strong> is a data serialization system that relies on schemas. When Avro data is read, the schema used when writing it is always present. This permits each datum to be written with no per-value overheads, making serialization both fast and small. This also facilitates use with dynamic, scripting languages, since data, together with its schema, is fully self-describing.</p>
<p>When Avro data is stored in a file, its schema is stored with it, so that files may be processed later by any program. If the program reading the data expects a different schema this can be easily resolved, since both schemas are present.</p>
<p>When Avro is used in RPC, the client and server exchange schemas in the connection handshake. (This can be optimized so that, for most calls, no schemas are actually transmitted.) Since both client and server both have the other's full schema, correspondence between same named fields, missing fields, extra fields, etc. can all be easily resolved.</p>
<p>Avro schemas are defined with JSON . This facilitates implementation in languages that already have JSON libraries.</p>
<p>An <strong>Avro Schema</strong> is represented as follows:</p>
<ol>
<li>A JSON string, naming a defined type. A JSON object, of the form:</li>
<pre>{\"type\": \"typeName\" ...attributes...}</pre>
<p>where, <em>typeName</em> is either a primitive or derived type name, as defined below. Attributes are permitted as metadata, but must not affect the format of serialized data.</p>
<li>A JSON array, representing a union of embedded types.</li>
</ol>"""^^rdf:HTML ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Avro Schema File" ;
  rdfs:subClassOf edg:FileAsset ;
  rdfs:subClassOf edg:Schema ;
  provo:wasInfluencedBy "http://avro.apache.org/docs/current/#schemas"^^xsd:anyURI ;
  provo:wasInfluencedBy "https://docs.oracle.com/cd/NOSQL/html/GettingStartedGuide/avroschemas.html"^^xsd:anyURI ;
.
edg:ClassificationScheme
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Classification Scheme" ;
  rdfs:subClassOf edg:Provenance ;
  rdfs:subClassOf edg:Schema ;
.
edg:DataAsset
  dash:abstract "true"^^xsd:boolean ;
  vaem:isElaboratedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:subClassOf edg:Asset ;
  rdfs:subClassOf edg:ComplianceAspect ;
  rdfs:subClassOf edg:Identifiable ;
  rdfs:subClassOf edg:Narratable ;
  rdfs:subClassOf edg:Traceable ;
.
edg:DataElement
  sh:property edg:DataElement-confidentiality ;
  sh:property edg:DataElement-criticality ;
  sh:property edg:DataElement-dataQualityStatus ;
  sh:property edg:DataElement-isPersonallyIdentifiableInformation ;
  sh:property edg:DataElement-mapsToLogicalAttribute ;
  sh:property edg:DataElement-mapsToProperty ;
  sh:property edg:DataElement-obfuscatedBy ;
  sh:property edg:DataElement-permissibleValues ;
  sh:property edg:DataElement-personalDataCategory ;
  sh:property edg:DataElement-supercededBy ;
.
edg:DataElement-confidentiality
  rdf:type sh:PropertyShape ;
  sh:path edg:confidentiality ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data element-confidentiality" ;
  sh:class edg:ConfidentialityLevel ;
  sh:maxCount 1 ;
.
edg:DataElement-criticality
  rdf:type sh:PropertyShape ;
  sh:path edg:criticality ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data element-criticality" ;
  sh:class edg:FiveLevelRatingScale ;
.
edg:DataElement-dataElementOf
  rdf:type sh:PropertyShape ;
  sh:path edg:dataElementOf ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data element-data element of" ;
  sh:class edg:DataAsset ;
.
edg:DataElement-dataQualityStatus
  rdf:type sh:PropertyShape ;
  sh:path edg:dataQualityStatus ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data element-data quality status" ;
  sh:class edg:FiveLevelRatingScale ;
.
edg:DataElement-datatype
  rdf:type sh:PropertyShape ;
  sh:path edg:datatype ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data element-datatype" ;
  sh:class edg:Datatype ;
  sh:maxCount 1 ;
.
edg:DataElement-isPersonallyIdentifiableInformation
  rdf:type sh:PropertyShape ;
  sh:path edg:isPersonallyIdentifiableInformation ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data element - is personally identifiable information" ;
  sh:datatype xsd:boolean ;
  sh:maxCount 1 ;
.
edg:DataElement-mapsToLogicalAttribute
  rdf:type sh:PropertyShape ;
  sh:path edg:mapsToLogicalAttribute ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "maps to logical attribute" ;
  sh:class edg:LogicalAttribute ;
.
edg:DataElement-mapsToProperty
  rdf:type sh:PropertyShape ;
  sh:path edg:mapsToProperty ;
  tosh:editWidget edg:FilteredURIResourceEditor ;
  tosh:searchWidget swa:ExistingValuesSelectFacet ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "maps to property" ;
  sh:class rdf:Property ;
.
edg:DataElement-maybeSameAs
  rdf:type sh:PropertyShape ;
  sh:path edg:maybeSameAs ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data element-maybe same as" ;
  sh:class edg:DataElement ;
.
edg:DataElement-obfuscatedBy
  rdf:type sh:PropertyShape ;
  sh:path edg:obfuscatedBy ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data Element-obfuscatedBy" ;
  sh:class edg:ProtectionMethod ;
.
edg:DataElement-permissibleValues
  rdf:type sh:PropertyShape ;
  sh:path edg:permissibleValues ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data element-permissible values" ;
  sh:class edg:ValueConstruct ;
  sh:maxCount 1 ;
.
edg:DataElement-personalDataCategory
  rdf:type sh:PropertyShape ;
  sh:path edg:personalDataCategory ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data Element-personal Data Category" ;
  sh:class edg:PersonalDataCategory ;
.
edg:DataElement-supercededBy
  rdf:type sh:PropertyShape ;
  sh:path edg:supercededBy ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data Element-superceded by" ;
  sh:class edg:DataElement ;
  sh:maxCount 1 ;
.
edg:DataElementCriticality-forOrganization
  rdf:type sh:PropertyShape ;
  sh:path edg:forOrganization ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data element criticality-for organization" ;
  sh:class edg:Organization ;
.
edg:DataSet
  edg:description "A <em>Data Set</em> is a group of data elements. A Dataset has a sequence in which data elements are included, whether they are mandatory, what verification rules should be employed and the characteristics of the collection (e.g. its scope)."^^rdf:HTML ;
  rdfs:subClassOf edg:Resourceable ;
  sh:property edg:DataSet-changeFrequency ;
  sh:property edg:DataSet-dataSetOfType ;
  sh:property edg:DataSet-formatType ;
  sh:property edg:DataSet-reportingPeriodEndDate ;
  sh:property edg:DataSet-reportingPeriodStartDate ;
  sh:property edg:DataSet-scope ;
.
edg:DataSet-changeFrequency
  rdf:type sh:PropertyShape ;
  sh:path metadata:changeFrequency ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data set-change frequency" ;
.
edg:DataSet-dataSetOfType
  rdf:type sh:PropertyShape ;
  sh:path edg:dataSetOfType ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data set-data set of type" ;
  sh:class edg:DataSetSpecification ;
.
edg:DataSet-formatType
  rdf:type sh:PropertyShape ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Dataset format type" ;
.
edg:DataSet-reportingPeriodEndDate
  rdf:type sh:PropertyShape ;
  sh:path edg:reportingPeriodEndDate ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data set-reporting period end date" ;
  sh:datatype xsd:date ;
.
edg:DataSet-reportingPeriodStartDate
  rdf:type sh:PropertyShape ;
  sh:path edg:reportingPeriodStartDate ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data set-reporting period start date" ;
  sh:datatype xsd:date ;
.
edg:DataSet-scope
  rdf:type sh:PropertyShape ;
  sh:path edg:scope ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data set-scope" ;
  sh:datatype rdf:HTML ;
.
edg:DataSetElement
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Dataset Element" ;
  rdfs:subClassOf edg:DataElement ;
  sh:property edg:DataSetElement-dataSetElementOf ;
  sh:property edg:DataSetElement-datatype ;
.
edg:DataSetElement-dataSetElementOf
  rdf:type sh:PropertyShape ;
  sh:path edg:datasetElementOf ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data set element-data set element of" ;
  sh:class edg:DataSet ;
.
edg:DataSetElement-datatype
  rdf:type sh:PropertyShape ;
  sh:path edg:datatype ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Data set element-datatype" ;
  sh:class edg:Datatype ;
  sh:maxCount 1 ;
.
edg:DataSetSpecification
  rdf:type edg:AssetClass ;
  edg:description "A <em>Data Set Specification (DSS)</em> specifies the structure for a group of data elements and the conditions under which this group is collected. A DSS can define the sequence in which data elements are included, whether they are mandatory, what verification rules should be employed and the characteristics of the collection (e.g. its scope)."^^rdf:HTML ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Dataset Specification" ;
  rdfs:subClassOf edg:Schema ;
  sh:property edg:DataSet-changeFrequency ;
  sh:property edg:DataSet-formatType ;
  sh:property edg:DataSet-reportingPeriodEndDate ;
  sh:property edg:DataSet-reportingPeriodStartDate ;
  sh:property edg:DataSet-scope ;
.
edg:Database
  rdf:type edg:AssetClass ;
  dash:abstract "true"^^xsd:boolean ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database" ;
  rdfs:subClassOf edg:DataContainer ;
  sh:property edg:Database-dataContainerType ;
  sh:property edg:Database-dependsOnDataFrom ;
  sh:property edg:Database-environmentType ;
  sh:property edg:Database-locationLink ;
  sh:property edg:Database-numberOfTables ;
  sh:property edg:Database-tableStatistics ;
.
edg:Database-dependsOnDataFrom
  rdf:type sh:PropertyShape ;
  sh:path edg:dependsOnDataFrom ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database-depends on data from" ;
  sh:class edg:Resourceable ;
  sh:or (
      [
        sh:class edg:Database ;
      ]
      [
        sh:class edg:SoftwareAsset ;
      ]
    ) ;
.
edg:Database-environmentType
  rdf:type sh:PropertyShape ;
  sh:path edg:environmentType ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database-environment type" ;
  sh:class edg:EnvironmentType ;
  sh:maxCount 1 ;
.
edg:Database-locationLink
  rdf:type sh:PropertyShape ;
  sh:path edg:locationLink ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database-location link" ;
  sh:datatype xsd:anyURI ;
  sh:maxCount 1 ;
.
edg:Database-numberOfInstances
  rdf:type sh:PropertyShape ;
  sh:path edg:numberOfInstances ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database - number of instances" ;
  sh:datatype xsd:integer ;
  sh:maxCount 1 ;
.
edg:Database-numberOfTables
  rdf:type sh:PropertyShape ;
  sh:path edg:numberOfTables ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database - number of tables " ;
  sh:datatype xsd:integer ;
  sh:maxCount 1 ;
.
edg:Database-tableStatistics
  rdf:type sh:PropertyShape ;
  sh:path edg:statistics ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database-table statistics" ;
  sh:class edg:TableStatistics ;
  sh:maxCount 1 ;
.
edg:DatabaseColumn
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database Column" ;
  rdfs:subClassOf edg:DataElement ;
  rdfs:subClassOf edg:PhysicalDataAsset ;
  sh:property edg:DatabaseColumn-derivedFrom ;
  sh:property edg:DatabaseColumn-isColumnOf ;
  sh:property edg:DatabaseColumn-isForeignKey ;
  sh:property edg:DatabaseColumn-isNullable ;
  sh:property edg:DatabaseColumn-isPrimaryKey ;
  sh:property edg:DatabaseColumn-nullOptions ;
  sh:property edg:DatabaseColumn-physicalDatatype ;
.
edg:DatabaseColumn-derivedFrom
  rdf:type sh:PropertyShape ;
  sh:path edg:derivedFrom ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database column-derived from" ;
  sh:class edg:LogicalAttribute ;
.
edg:DatabaseColumn-isColumnOf
  rdf:type sh:PropertyShape ;
  sh:path edg:columnOf ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database column-is column of" ;
  sh:class edg:Table ;
  sh:maxCount 1 ;
.
edg:DatabaseColumn-isForeignKey
  rdf:type sh:PropertyShape ;
  sh:path edg:isForeignKey ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database column-is foreign key" ;
  sh:datatype xsd:boolean ;
  sh:maxCount 1 ;
.
edg:DatabaseColumn-isNullable
  rdf:type sh:PropertyShape ;
  sh:path edg:isNullable ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database column-is nullable" ;
  sh:datatype xsd:boolean ;
  sh:maxCount 1 ;
.
edg:DatabaseColumn-isPrimaryKey
  rdf:type sh:PropertyShape ;
  sh:path edg:isPrimaryKey ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database column-is primary key" ;
  sh:datatype xsd:boolean ;
  sh:maxCount 1 ;
.
edg:DatabaseColumn-nullOptions
  rdf:type sh:PropertyShape ;
  sh:path edg:nullOptions ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database column-null options" ;
  sh:datatype xsd:string ;
  sh:maxCount 1 ;
.
edg:DatabaseColumn-physicalDatatype
  rdf:type sh:PropertyShape ;
  sh:path edg:physicalDatatype ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database column-physical datatype" ;
  sh:class edg:Datatype ;
  sh:maxCount 1 ;
.
edg:DatabaseColumnAspect-dependsOnDataFrom
  rdf:type sh:PropertyShape ;
  sh:path edg:dependsOnDataFrom ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database column aspect-depends on data from" ;
  sh:class edg:DataAsset ;
.
edg:DatabaseColumnAspect-derivedFromLogicalAttribute
  rdf:type sh:PropertyShape ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database column aspect-derived from logical attribute" ;
  sh:class edg:LogicalAttribute ;
.
edg:DatabaseColumnAspect-mapsToTerm
  rdf:type sh:PropertyShape ;
  sh:path edg:mapsToTerm ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database column aspect-maps to term" ;
  sh:class edg:GlossaryTerm ;
.
edg:DatabaseColumnAspect-permissibleValues
  rdf:type sh:PropertyShape ;
  sh:path edg:permissibleValues ;
  tosh:editWidget swa:InstancesSelectEditor ;
  tosh:viewWidget <http://edg.topbraid.solutions/view/ValueConstructViewer> ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database column aspect-permissible values" ;
  sh:class edg:ValueConstruct ;
.
edg:DatabaseColumnAspect_mapsToReferenceData
  rdf:type sh:PropertyShape ;
  sh:path edg:mapsToReferenceData ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database column aspect maps to reference data" ;
  sh:class edg:ReferenceDataAsset ;
.
edg:DatabaseTable
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database Table" ;
  rdfs:subClassOf edg:PhysicalDataAsset ;
  rdfs:subClassOf edg:Processable ;
  rdfs:subClassOf edg:Table ;
.
edg:DatabaseView
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Database View" ;
  rdfs:subClassOf edg:PhysicalDataAsset ;
  rdfs:subClassOf edg:Processable ;
  rdfs:subClassOf edg:Table ;
  rdfs:subClassOf edg:View ;
.
edg:ExternalDataSet
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "External Dataset" ;
  rdfs:subClassOf edg:DataSet ;
.
edg:File-formatType
  rdf:type sh:PropertyShape ;
  sh:path edg:format ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "File-format type" ;
.
edg:File-name
  rdf:type sh:PropertyShape ;
  sh:path edg:name ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "File source link" ;
  sh:datatype xsd:string ;
.
edg:File-sourceLink
  rdf:type sh:PropertyShape ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "File source link" ;
  sh:datatype xsd:anyURI ;
.
edg:FileAsset
  rdf:type edg:AssetClass ;
  dash:abstract "false"^^xsd:boolean ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "File Asset" ;
  rdfs:subClassOf edg:AccessControllable ;
  rdfs:subClassOf edg:Asset ;
  rdfs:subClassOf edg:ComplianceAspect ;
  rdfs:subClassOf edg:Identifiable ;
  rdfs:subClassOf edg:Narratable ;
  rdfs:subClassOf edg:Processable ;
  rdfs:subClassOf edg:Traceable ;
  sh:property edg:File-formatType ;
  sh:property edg:File-name ;
  sh:property edg:File-sourceLink ;
.
edg:FileSystem
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "File System" ;
  rdfs:subClassOf edg:DataContainer ;
.
edg:GenerateAvroSchema
  spin:constraint [
      rdf:type spl:Argument ;
      spl:predicate edg:logicalModelName ;
      spl:valueType xsd:string ;
    ] ;
  spin:constraint [
      rdf:type spl:Argument ;
      spl:predicate edg:table ;
      spl:valueType rdfs:Resource ;
    ] ;
.
edg:GenerateAvroSchemaForAllTables
  spin:constraint [
      rdf:type spl:Argument ;
      spl:predicate edg:logicalModelName ;
      spl:valueType xsd:string ;
    ] ;
.
edg:GenerateAvroSchemaTest
  spin:constraint [
      rdf:type spl:Argument ;
      spl:predicate edg:logicalModelName ;
      spl:valueType xsd:string ;
    ] ;
  spin:constraint [
      rdf:type spl:Argument ;
      spl:predicate edg:table ;
      spl:valueType xsd:string ;
    ] ;
.
edg:JSONforAVROschemaField
  spin:constraint [
      rdf:type spl:Argument ;
      spl:predicate edg:logicalModelName ;
      spl:valueType xsd:string ;
    ] ;
.
edg:LogicalAttribute
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Logical Attribute" ;
  rdfs:subClassOf edg:DataElement ;
  rdfs:subClassOf edg:LogicalDataAsset ;
  sh:property edg:LogicalAttribute-attributeOf ;
  sh:property edg:LogicalAttribute-isForeignKey ;
  sh:property edg:LogicalAttribute-isLogicalOnly ;
  sh:property edg:LogicalAttribute-isNullable ;
  sh:property edg:LogicalAttribute-isPrimaryKey ;
  sh:property edg:LogicalAttribute-isRequired ;
  sh:property edg:LogicalAttribute-logicalDatatype ;
.
edg:LogicalAttribute-attributeOf
  rdf:type sh:PropertyShape ;
  sh:path edg:attributeOf ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Logical attribute-attribute of" ;
  sh:class edg:LogicalEntity ;
  sh:maxCount 1 ;
.
edg:LogicalAttribute-isForeignKey
  rdf:type sh:PropertyShape ;
  sh:path edg:isForeignKey ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Logical attribute-is foreign key" ;
  sh:datatype xsd:boolean ;
  sh:maxCount 1 ;
.
edg:LogicalAttribute-isLogicalOnly
  rdf:type sh:PropertyShape ;
  sh:path edg:isLogicalOnly ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Logical attribute-is logical only" ;
  sh:datatype xsd:boolean ;
  sh:maxCount 1 ;
.
edg:LogicalAttribute-isNullable
  rdf:type sh:PropertyShape ;
  sh:path edg:isNullable ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Logical attribute-is nullable" ;
  sh:datatype xsd:boolean ;
  sh:maxCount 1 ;
.
edg:LogicalAttribute-isPrimaryKey
  rdf:type sh:PropertyShape ;
  sh:path edg:isPrimaryKey ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Logical attribute-is primary key" ;
  sh:datatype xsd:boolean ;
  sh:maxCount 1 ;
.
edg:LogicalAttribute-isRequired
  rdf:type sh:PropertyShape ;
  sh:path edg:isRequired ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Logical attribute-is required" ;
  sh:datatype xsd:boolean ;
  sh:maxCount 1 ;
.
edg:LogicalAttribute-logicalDatatype
  rdf:type sh:PropertyShape ;
  sh:path edg:logicalDatatype ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Logical attribute-logical datatype" ;
  sh:class qudt:ScalarDatatype ;
  sh:maxCount 1 ;
.
edg:LogicalDataAsset
  rdf:type edg:AssetClass ;
  dash:abstract "true"^^xsd:boolean ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Logical Data Asset" ;
  rdfs:subClassOf edg:DataAsset ;
.
edg:LogicalDataModel
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Logical Data Model" ;
  rdfs:subClassOf edg:LogicalDataAsset ;
  rdfs:subClassOf edg:Model ;
  sh:property edg:LogicalDataModel-logicalEntity ;
.
edg:LogicalDataModel-logicalEntity
  rdf:type sh:PropertyShape ;
  sh:path edg:logicalEntity ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Logical data model-logical entity" ;
  sh:class edg:LogicalEntity ;
.
edg:LogicalEntity
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Logical Entity" ;
  rdfs:subClassOf edg:LogicalDataAsset ;
  sh:property edg:LogicalEntity-logicalDataModel ;
.
edg:LogicalEntity-logicalDataModel
  rdf:type sh:PropertyShape ;
  sh:path edg:logicalModel ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Logical entity-logical data model" ;
  sh:class edg:LogicalDataModel ;
.
edg:Model
  sh:property edg:Model-wasDerivedFrom ;
.
edg:Model-wasDerivedFrom
  rdf:type sh:PropertyShape ;
  sh:path provo:wasDerivedFrom ;
  rdfs:label "Model-was derived from" ;
  sh:class edg:Model ;
.
edg:NULL
  rdf:type edg:NullValue ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "null" ;
.
edg:NoSQLdatabase
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "NoSQL Database" ;
  rdfs:subClassOf edg:Database ;
  sh:property edg:NoSQLdatabase-numberOfProperties ;
.
edg:NoSQLdatabase-numberOfProperties
  rdf:type sh:PropertyShape ;
  sh:path edg:numberOfProperties ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "No SQLdatabase-number of properties" ;
  sh:datatype xsd:integer ;
.
edg:NullValue
  rdf:type owl:Class ;
  dcterms:description "The value <em>Null</em>."^^rdf:HTML ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "null" ;
  rdfs:subClassOf edg:ValueConstruct ;
.
edg:PhysicalDataAsset
  rdf:type edg:AssetClass ;
  dash:abstract "true"^^xsd:boolean ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Physical Data Asset" ;
  rdfs:subClassOf edg:DataAsset ;
.
edg:PhysicalDataModel
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Physical Data Model" ;
  rdfs:subClassOf edg:Model ;
  rdfs:subClassOf edg:PhysicalDataAsset ;
  sh:property edg:PhysicalDataModel-realizedAs ;
  sh:property edg:PhysicalDataModel-tableOf-inverse ;
  sh:property edg:PhysicalDataModel-viewOf-inverse ;
.
edg:PhysicalDataModel-realizedAs
  rdf:type sh:PropertyShape ;
  sh:path edg:realizedAs ;
  dash:composite "true"^^xsd:boolean ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Physical data model-realized as" ;
  sh:class edg:DataContainer ;
.
edg:PhysicalDataModel-tableOf-inverse
  rdf:type sh:PropertyShape ;
  sh:path [
      sh:inversePath edg:tableOf ;
    ] ;
  dash:composite "true"^^xsd:boolean ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "PhysicalDataModel -t ableOf - inverse" ;
.
edg:PhysicalDataModel-viewOf-inverse
  rdf:type sh:PropertyShape ;
  sh:path [
      sh:inversePath edg:viewOf ;
    ] ;
  dash:composite "true"^^xsd:boolean ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "PhysicalDataMode l-viewOf - inverse" ;
.
edg:PhysicallDataModel-logicalEntity_TBD
  rdf:type sh:PropertyShape ;
  sh:path edg:logicalEntity ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Physicall data model-logical entity TBD" ;
  sh:class edg:LogicalEntity ;
.
edg:ProtectionMethod
  rdf:type owl:Class ;
  rdf:type sh:NodeShape ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "protection method" ;
  rdfs:subClassOf dtype:EnumeratedValue ;
  rdfs:subClassOf owl:Thing ;
.
edg:Provenance-dependsOnDataFrom
  rdf:type sh:PropertyShape ;
  sh:path edg:dependsOnDataFrom ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Provenance-depends on data from" ;
  sh:class edg:DataAsset ;
.
edg:RelationalDatabase
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Relational Database" ;
  rdfs:subClassOf edg:Database ;
  sh:property edg:RelationalDatabase-numberOfColumns ;
  sh:property edg:RelationalDatabase-physicalModel ;
.
edg:RelationalDatabase-numberOfColumns
  rdf:type sh:PropertyShape ;
  sh:path edg:numberOfColumns ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Relational database-number of columns" ;
  sh:datatype xsd:integer ;
  sh:maxCount 1 ;
.
edg:RelationalDatabase-physicalModel
  rdf:type sh:PropertyShape ;
  sh:path edg:physicalModel ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Relational database-physical data model" ;
  sh:class edg:PhysicalDataModel ;
  sh:maxCount 1 ;
.
edg:Report
  sh:property edg:Report-reportType ;
.
edg:Report-reportType
  rdf:type sh:PropertyShape ;
  sh:path edg:reportType ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  sh:class edg:ReportType ;
.
edg:ResearchPaper
  sh:property edg:ResearchPaper-reportType ;
.
edg:ResearchPaper-reportType
  rdf:type sh:PropertyShape ;
  sh:path edg:reportType ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Research paper-report type" ;
  sh:class edg:ReportType ;
.
edg:Schema
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Schema" ;
  rdfs:subClassOf edg:DataAsset ;
.
edg:Table
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Table" ;
  rdfs:subClassOf edg:Construct ;
  sh:property edg:Table-columnOf-inverse ;
  sh:property edg:Table-databaseColumn ;
  sh:property edg:Table-mapsToClass ;
  sh:property edg:Table-mapsToLogicalEntity ;
  sh:property edg:Table-tableOf ;
.
edg:Table-columnOf-inverse
  rdf:type sh:PropertyShape ;
  sh:path [
      sh:inversePath edg:columnOf ;
    ] ;
  dash:composite "true"^^xsd:boolean ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Table - columnOf- inverse" ;
.
edg:Table-databaseColumn
  rdf:type sh:PropertyShape ;
  sh:path edg:databaseColumn ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Table- database column" ;
  sh:class edg:DatabaseColumn ;
.
edg:Table-mapsToClass
  rdf:type sh:PropertyShape ;
  sh:path edg:mapsToClass ;
  tosh:editWidget edg:FilteredURIResourceEditor ;
  tosh:searchWidget swa:ExistingValuesSelectFacet ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "maps to class" ;
  sh:class rdfs:Class ;
  sh:maxCount 1 ;
.
edg:Table-mapsToLogicalEntity
  rdf:type sh:PropertyShape ;
  sh:path edg:mapsToLogicalEntity ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Table-maps to logical entity" ;
  sh:class edg:LogicalEntity ;
  sh:maxCount 1 ;
.
edg:Table-tableOf
  rdf:type sh:PropertyShape ;
  sh:path edg:tableOf ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Table-table of" ;
  sh:maxCount 1 ;
  sh:or (
      edg:PhysicalDataModel
      edg:Database
    ) ;
.
edg:TableStatistics
  rdf:type owl:Class ;
  rdf:type sh:NodeShape ;
  dcterms:description "<em>Table Statistics</em> holds information for such things as how many records exist for each table of a database for an environment type (DEV, QA, UAT, PROD)."^^rdf:HTML ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Table Statistics" ;
  rdfs:subClassOf edg:Statistics ;
  sh:property edg:TableStatistics-numberOfRecords ;
  sh:property edg:TableStatistics-table ;
.
edg:TableStatistics-numberOfRecords
  rdf:type sh:PropertyShape ;
  sh:path edg:numberOfRecords ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Table Statistics - number of records" ;
  sh:datatype xsd:integer ;
  sh:maxCount 1 ;
  sh:minCount 1 ;
.
edg:TableStatistics-table
  rdf:type sh:PropertyShape ;
  sh:path edg:table ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Table Statistics - table" ;
  sh:class edg:Table ;
  sh:maxCount 1 ;
  sh:minCount 1 ;
.
edg:Traceable
  sh:property edg:Traceable-dataRequirement ;
.
edg:Traceable-dataRequirement
  rdf:type sh:PropertyShape ;
  sh:path edg:dataRequirement ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "Traceable - data requirement" ;
  sh:class edg:DataRequirement ;
.
edg:View
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "View" ;
  rdfs:subClassOf edg:Construct ;
  sh:property edg:Table-mapsToClass ;
  sh:property edg:Table-mapsToLogicalEntity ;
  sh:property edg:View-viewOf ;
.
edg:View-viewOf
  rdf:type sh:PropertyShape ;
  sh:path edg:viewOf ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "View-view of" ;
  sh:class edg:PhysicalDataModel ;
  sh:maxCount 1 ;
.
edg:XMLschemaFile
  rdf:type edg:AssetClass ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "XML Schema File" ;
  rdfs:subClassOf edg:FileAsset ;
  rdfs:subClassOf edg:Schema ;
.
edg:accessControlNotes
  rdfs:comment "A rich text property for documenting notes on access control" ;
  rdfs:range rdf:HTML ;
.
edg:attributeOf
  rdf:type owl:ObjectProperty ;
  rdfs:domain edg:LogicalAttribute ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "attribute of" ;
  rdfs:range edg:LogicalEntity ;
.
edg:columnOf
  rdf:type owl:ObjectProperty ;
  edg:inverseLabel "Columns" ;
  rdfs:comment "Associates a database column to its table." ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "column of" ;
.
edg:confidentiality
  rdf:type owl:ObjectProperty ;
  rdfs:comment "Using an enumeration, specifies the confidentiality of the data instances described by this metadata." ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "confidentiality" ;
.
edg:dataContainerType
  rdf:type owl:ObjectProperty ;
  rdfs:comment "Using an enumeration, specifies the type of the data container" ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "data container type" ;
.
edg:dataElement
  rdf:type owl:ObjectProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "data element" ;
  owl:inverseOf edg:dataElementOf ;
.
edg:dataElementLevelKind
  rdf:type owl:ObjectProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "data element level kind" ;
.
edg:dataElementOf
  rdf:type owl:ObjectProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "data element of" ;
  owl:inverseOf edg:dataElement ;
.
edg:dataQualityIndicator
  rdf:type owl:ObjectProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
.
edg:dataQualityStatus
  rdf:type owl:ObjectProperty ;
  rdfs:comment "Specifies the data quality of the data instances associated with the asset." ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "data quality status" ;
.
edg:dataRequirement
  rdfs:domain edg:LogicalAttribute ;
.
edg:dataSetOfType
  rdf:type owl:ObjectProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "dataset of type" ;
.
edg:databaseColumn
  rdf:type owl:ObjectProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "database column" ;
.
edg:dataset
  rdf:type owl:ObjectProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "dataset" ;
  rdfs:range edg:DataSet ;
.
edg:datasetElementOf
  rdf:type owl:ObjectProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "dataset element of" ;
.
edg:datatype
  rdfs:comment "Specifies the datatype of the data instances described by this metadata." ;
.
edg:entityType
  rdf:type owl:ObjectProperty ;
  rdfs:comment "Specifies the type of a logical entity" ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "entity type" ;
.
edg:fileSize
  rdf:type owl:DatatypeProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "file size" ;
  rdfs:range xsd:string ;
.
edg:frequencyNotes
  rdf:type owl:DatatypeProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "frequency notes" ;
  rdfs:range rdf:HTML ;
.
edg:getColumnsForTable
  spin:constraint [
      rdf:type spl:Argument ;
      spl:predicate edg:table ;
      spl:valueType rdfs:Resource ;
    ] ;
.
edg:getTablesForPhysicalDataModel
  spin:constraint [
      rdf:type spl:Argument ;
      spl:predicate edg:physicalModel ;
      spl:valueType rdfs:Resource ;
    ] ;
.
edg:isForeignKey
  rdf:type owl:DatatypeProperty ;
  edg:acronym "FK" ;
  rdfs:comment "A boolean property to specify if the column is a foreign key." ;
  rdfs:domain edg:DatabaseColumn ;
  rdfs:domain edg:LogicalAttribute ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "is foreign key" ;
  rdfs:range xsd:boolean ;
.
edg:isLogicalOnly
  rdf:type owl:DatatypeProperty ;
  rdfs:domain edg:LogicalAttribute ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "is logical only" ;
  rdfs:range xsd:boolean ;
.
edg:isNullable
  rdf:type owl:DatatypeProperty ;
  rdfs:comment "A boolean property to specify if the column can have a null value." ;
  rdfs:domain edg:DatabaseColumn ;
  rdfs:domain edg:LogicalAttribute ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "is nullable" ;
  rdfs:range xsd:boolean ;
.
edg:isPrimaryKey
  rdf:type owl:DatatypeProperty ;
  edg:acronym "PK" ;
  rdfs:comment "A boolean property to specify that the column is a primry key." ;
  rdfs:domain edg:DatabaseColumn ;
  rdfs:domain edg:LogicalAttribute ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "is primary key" ;
  rdfs:range xsd:boolean ;
.
edg:isRequired
  rdf:type owl:DatatypeProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "id" ;
  rdfs:range xsd:boolean ;
.
edg:logicalDatatype
  rdf:type owl:ObjectProperty ;
  rdfs:comment "Specifies the logical datatype of the data instances described for a logical attribute" ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "logical datatype" ;
  rdfs:subPropertyOf edg:datatype ;
.
edg:logicalEntity
  rdf:type owl:ObjectProperty ;
  rdfs:domain edg:LogicalDataModel ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "logical entity" ;
  rdfs:range edg:LogicalEntity ;
.
edg:logicalModel
  rdf:type owl:ObjectProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "logical model" ;
.
edg:logicalModelName
  rdf:type owl:ObjectProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "logical model name" ;
.
edg:mapsToClass
  rdf:type owl:ObjectProperty ;
  rdfs:comment "Associates a table with a class in an ontology. The filtering of classes is over the ontologies that are included by the instance of the model that is being edited." ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "maps to class" ;
  rdfs:subPropertyOf edg:mapsTo ;
.
edg:mapsToLogicalAttribute
  rdf:type owl:ObjectProperty ;
  rdfs:comment "Associates an asset, such as a data elementt, with a logical attribute in a database logical model." ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "maps to logical attribute" ;
  rdfs:subPropertyOf edg:mapsTo ;
.
edg:mapsToLogicalEntity
  rdf:type owl:ObjectProperty ;
  rdfs:comment "Associates aa table with a logical entity" ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "maps to logical entity" ;
  rdfs:subPropertyOf edg:mapsTo ;
.
edg:mapsToProperty
  rdf:type owl:ObjectProperty ;
  rdfs:comment "Associates an asset, such as a data elementt, with a datatype or object property in an ontology. The filtering of values is over the ontologies that are included by the instance of the model that is being edited." ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "maps to property" ;
  rdfs:subPropertyOf edg:mapsTo ;
.
edg:mapsToReferenceData
  rdf:type owl:ObjectProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "maps to reference data" ;
  rdfs:subPropertyOf edg:mapsTo ;
.
edg:maybeSameAs
  rdf:type owl:ObjectProperty ;
  rdf:type owl:SymmetricProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "maybe same as" ;
.
edg:nullOptions
  rdf:type owl:DatatypeProperty ;
  rdfs:comment "A string that holds any options for a nullable column." ;
  rdfs:domain edg:DatabaseColumn ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "null options" ;
  rdfs:range xsd:string ;
.
edg:numberOfColumns
  rdf:type owl:DatatypeProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "number of columns" ;
  skos:prefLabel "number of columns" ;
.
edg:numberOfInstances
  rdf:type owl:DatatypeProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "number of instances" ;
  skos:prefLabel "number of instances" ;
.
edg:numberOfProperties
  rdf:type owl:DatatypeProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "number of properties" ;
  skos:prefLabel "number of properties" ;
.
edg:numberOfRecords
  rdf:type owl:DatatypeProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "number of records" ;
  skos:prefLabel "number of records" ;
.
edg:numberOfTables
  rdf:type owl:DatatypeProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "number of tables" ;
  skos:prefLabel "number of tables" ;
.
edg:obfuscatedBy
  rdf:type rdf:Property ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "obfuscated by"@en ;
.
edg:personalDataCategory
  rdf:type owl:ObjectProperty ;
  rdfs:comment "Using an enumeration, specifies the categoryof the data instances described by this metadata." ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "personalDataCategory" ;
.
edg:physicalModel
  rdf:type owl:ObjectProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "physical model" ;
.
edg:propertyOf
  rdf:type owl:ObjectProperty ;
  rdfs:domain edg:BigDataProperty ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "property of" ;
  rdfs:range edg:BigDataTable ;
  skos:prefLabel "property of" ;
.
edg:reportType
  rdf:type owl:ObjectProperty ;
  rdfs:domain edg:Report ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "report type" ;
  rdfs:range edg:ReportType ;
.
edg:reportingEndDate
  rdf:type owl:DatatypeProperty ;
  rdfs:comment "The date this type of data asset is stopped being produced" ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "reporting end date" ;
  rdfs:range xsd:date ;
.
edg:reportingStartDate
  rdf:type owl:DatatypeProperty ;
  rdfs:comment "the date this type of data asset was first produced" ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "reporting start date" ;
  rdfs:range xsd:date ;
.
edg:storesDataIn
  rdfs:range edg:Database ;
.
edg:table
  rdf:type owl:ObjectProperty ;
  rdfs:label "table" ;
.
edg:tableOf
  rdf:type owl:ObjectProperty ;
  edg:inverseLabel "Tables" ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "table of" ;
.
edg:viewOf
  rdf:type owl:ObjectProperty ;
  edg:inverseLabel "Views" ;
  rdfs:isDefinedBy <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  rdfs:label "view of" ;
.
<http://edg.topbraid.solutions/schema/datamodels/GMD_datamodels>
  rdf:type vaem:GraphMetaData ;
  dcterms:modified "2016-12-18"^^xsd:date ;
  dcterms:rights "<p>This ontology is issued under a restricted copyright license that prohibits reproduction, distribution, copying and any other form of sharing. The license agreement can be found at <a href='http://www.topquadrant.com/docs/legal/EULA.pdf'>http://www.topquadrant.com/docs/legal/EULA.pdf.</p>"^^rdf:HTML ;
  vaem:hasGraphRole vaem:SchemaGraph ;
  vaem:hasLicenseType <voag:TopQuadrant_ONTOLOGY-LICENSE> ;
  vaem:hasOwner vaem:TopQuadrant ;
  vaem:hasSteward vaem:TopQuadrant ;
  vaem:isMetadataFor <http://edg.topbraid.solutions/1.0/schema/datamodels> ;
  vaem:name "EDG" ;
  vaem:namespace "http://edg.topbraid.solutions/model/" ;
  vaem:namespacePrefix "edg" ;
  vaem:owner "TopQuadrant, Inc." ;
  vaem:releaseDate "2016-12-18"^^xsd:date ;
  vaem:revision "1.0" ;
  vaem:usesNonImportedResource dcterms:abstract ;
  vaem:usesNonImportedResource dcterms:author ;
  vaem:usesNonImportedResource dcterms:created ;
  vaem:usesNonImportedResource dcterms:modified ;
  vaem:usesNonImportedResource dcterms:rights ;
  vaem:usesNonImportedResource dcterms:title ;
  vaem:usesNonImportedResource <http://voag.linkedmodel.org/voag#TopQuadrant_ONTOLOGY-LICENSE> ;
  vaem:withAttributionTo "Any references to this ontology should give attribution to TopQuadrant, Inc." ;
.
provo:wasInfluencedBy
  rdf:type rdf:Property ;
  rdfs:label "was influenced by" ;
  rdfs:range xsd:anyURI ;
.
[
  edg:logicalModelName [] ;
].
[
  edg:logicalModelName [] ;
].
[
  edg:logicalModelName [] ;
].
[
  edg:logicalModelName [] ;
].
[
  edg:logicalModelName [] ;
].
[
  edg:logicalModelName [] ;
].
[
  edg:logicalModelName [] ;
].
[
  edg:logicalModelName [] ;
].
[
  edg:logicalModelName [] ;
].
[
  edg:logicalModelName [] ;
].
[
  edg:logicalModelName [] ;
].
[
  edg:logicalModelName [] ;
].
[
  edg:logicalModelName [] ;
].
[
  edg:table [] ;
].
[
  edg:table [] ;
].

`;
}
export default getData;
