# Change Log
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) 
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Latest]

## [0.3.7] - 2017-01-12
### Added
- Select/deselect all elements checkbox in navigation pop-up 
### Fixed
- Zoom to fit zoomed to close on small diagrams, making elements unnessesary big

## [0.3.6] - 2017-01-11
### Fixed
- Broken attachment of links to nodes when loading a diagram.

## [0.3.5] - 2016-12-29
### Added
- Ability display labels for element properties by implementing
`DataProvider.propertyInfo()`.

### Fixed
- Exported missing LayoutData types.
- Error when `WikidataProvider.filter()` query execution encounters literals
or non-entity IRIs.
- Diagram area scroll jump on element click when workspace area size changed.
- Filter trash nodes (hyperlinks to resources expressed as IRIs)
in `WikidataProvider`.
- Made diagram area scroll smoother in Webkit browsers.
- Preserve full URI when drag'n'drop links with absolute URI with hashpart
onto the diagram area.
- Printing person template with expanded properties.

### Changed
- Replaced `d3` dependency with `d3-color`.

## [0.3.3] - 2016-12-15
### Added
- "Search for connected elements" button to Halo.

### Changed
- Disabled "click on element to search".
- Hide "Connections" dialog when click on empty paper space.

### Fixed
- Display error in Connection menu on failed request.
- Inconsistent thumbnail width in default element thumbnail.
- Made paper adjust its size when element is expanded or collapsed.
- `WikidataProvider`:
  * made search ordering consistent;
  * prevent label and property duplication;
  * replaced full images with thumbnails when using `imageClassUris`;
  * query elementInfo using single SPARQL query for all elements;
  * corrected `linkTypesOf` query to return actual connected elements count.

## [0.3.2] - 2016-12-14
### Added
- Fetching for link between elements on a diagram at the end of import.

### Changed
- Significant performance improvments when importing diagram.
- Increased preferred link length in force layout.

### Fixed
- Unable to export as PNG/SVG diagram that contains element with SVG thumbnail.
- Unable to export as PNG/SVG in Firefox >= 50.
- Connections dialog height overflow in Firefox.

### Breaking changes
- Link arrowheads implementation replaced by native
SVG markers, changed link style customization interface.
- Rewritten scrollable diagram component `PaperArea`
in React way, moved `zoomToFit()` and other related members.
This change fixes many issues with scrolling and resizing diagram area.
- Fixed typo in `GraphBuilder.getGraphFromConstruct()` method name.

## [0.3.1] - 2016-11-22
### Added
- Warning if browser is IE.

### Fixed
- Collapsing/expanding widgets on resizable panels.
- Text wrapping in `big-icon-template`.
- Ignore literals when creating diagram from SparQL construct query.

## [0.3.0] - 2016-10-03
### Added
- Construct diagram from RDF graph using `GraphBuilder`.
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
- `SparqlEndpoint` error when `imageClassUris` left unspecifed.
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
`Workspace` props.
- Displaying custom images on elements by specifying image URL when element
info loaded from `DataProvider`.

## 0.2.0 - 2016-09-12
### Added
- Ontodia published on GitHub as OSS project.

[Latest]: https://github.com/ontodia-org/ontodia/compare/v0.3.6...HEAD
[0.3.6]: https://github.com/ontodia-org/ontodia/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/ontodia-org/ontodia/compare/v0.3.3...v0.3.5
[0.3.3]: https://github.com/ontodia-org/ontodia/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/ontodia-org/ontodia/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/ontodia-org/ontodia/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ontodia-org/ontodia/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/ontodia-org/ontodia/compare/v0.2.0...v0.2.1
