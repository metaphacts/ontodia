# Change Log
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) 
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Latest]
### Added
- Warning if browser is IE.
### Fixed
- Collapsing/expanding widgets on resizable panels.

## [0.3.0] - 2016-10-03
### Added
- Construct diagram from RDF graph using GraphBuilder.
- Ability to customize style of links on diagram.
- Ability to specify custom element image using user-provided function.
- Extension points for undo/redo support and element selection/halo.
- Default halo to operate on selected element.
- Wikidata data provider to browse wikidata SparQL endpoints.
- Ability to filter link types in Connections panel by name.

### Changed
- Custom SVG layout of elements replaced with HTML-based one with React and
Handlebars as template engines with ability to register custom templates.
- Faster exporting diagram as SVG/PNG.
- Replaced bundled typings for backbone and react with @types/*
- Make Connections panel intially hidden.
- Replaced icons from Glyphicons with FontAwesome.
- Replaced force layout implementation from Springy to WebCola.

### Fixed
- SparqlEndpoint error when imageClassUris left unspecifed.
- Compile errors when importing library to webpack-based TypeScript projects.
- Hide "Share" button from workspace when corresponding callback
is not specified.
- Diagram canvas scrolling in Safari.

### Removed
- "All connections" group from Connections panel to support lazy loading of
link types.

## [0.2.1] - 2016-09-14
### Added
- Ability to customize colors of elements on diagram by providing option to
Workspace props.
- Displaying custom images on elements by specifying image URL when element
info loaded from DataProvider.

## 0.2.0 - 2016-09-12
### Added
- Ontodia published on GitHub as OSS project.

[Latest]: https://github.com/ontodia-org/ontodia/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/ontodia-org/ontodia/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/ontodia-org/ontodia/compare/v0.2.0...v0.2.1
