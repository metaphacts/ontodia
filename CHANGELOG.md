# Change Log
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) 
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Latest]
## [0.8.0]
### Added
- Nesting (grouping) elements on diagram using `groupBy` option and `<EmbeddedLayer />`
element in custom templates.
- Buttons to toggle visiblility of left and right panels.
- `renderTo` function to create Workspace using compiled in bundled mode library.
- Separate library bundle for IE11 compatibility (when compile with SUPPORT_IE flag).
- Command history support with `CommandHistory` (commands should be explicitly
batched into commands).

### Changed
- **[Breaking]** Replaced JointJS rendering engine with our own React-based
implementation.
- **[Breaking]** Replaced Backbone property and event system with native class
properties and composition-based event emitter implementation.
- **[Breaking]** Generate placeholder data only when rendering, e.g. `Element.data.label`
will be empty until element info will load.
- **[Breaking]** Split up `isViewOnly` option into `hideToolbar`, `hidePanels`
and `hideHalo`.
- Removed default "checkboard" background in the diagram area.
- Limit maximum number of connected elements in Connection menu to 100.

### Fixed
- Drag and drop from class tree in Safari.
- Missing "All" entry in Connections menu when there are two connections with
the same ID in the list.
- Rewrite `https://` IRIs to `http://` when adding an element to diagram.

## [0.7.0]
### Changed
- **[Breaking]** Optimize `SparqlDataProvider`: change `elementInfoQuery` from SELECT to
CONSTRUCT query, extract `linkTypesOf` statistics into separate `linkTypesOfStatsQuery`.
- **[Breaking]** Throw exception instead of returning null or undefined when fetching
error happens in `RdfDataProvider`.
- Simplify overriding default toolbar with a custom one by providing default
callbacks in props.

### Fixed
- `stroke-dasharray` style override for link labels.
- Error when RDF data storage returns `undefined` statements.

## [0.6.1] - 2017-10-17
### Added
- Property suggestion handler for scoring properties.
- Ability to use custom toolbar for a workspace.
- Ability to use turtle (`.ttl`) file as diagram source.

### Fixed
- Collapsing margins of scrollable diagram area in Chrome >= 61.

## [0.6.0] - 2017-09-19
### Added
- RDF data provider with multiple parsers.
- LOD data fetching for RDF data provider.
- Composite data provider to combine results from multiple data providers.
- Ability to specify RDF pattern to use as a link on a diagram with `SpaqlDataProvider`.

## [0.5.3] - 2017-08-23
### Fixed
- Unpredictable display language selection behaviour.

### Changed
- Blank nodes are no longer displayed in class tree in default configuration.

## [0.5.2] - 2017-08-17
### Fixed
- Safari bug preventing displaying class tree workaround.

## [0.5.1] - 2017-08-04
### Fixed
- No element thumbnails issue when trying to export to PNG even with
CORS-enabled images.

## [0.5.0] - 2017-08-04
### Added
- Blank nodes and RDF lists support to `SparqlDataProvider`.
- Zoom customization props and event.

### Changed
- Try to load images using crossorigin='anonymous' if possible to be able to
export diagram with pictures to PNG.

### Fixed
- Hide save button if `onSaveDiagram` callback isn't provided in props.
- Fix paper initialization error in Firefox.
- Wrong exported file extension when click on "Export PNG" after "Export SVG"
or vice versa.

### Removed
- **[Breaking]** `labelProperty` option and `refElement*` settings from
`SparqlDataProvider`. Use `dataLabelProperty` setting and override
`createRefQueryPart()` instead.
- **[Breaking]** `handlebars` dependency with ability to display Handlebars-based
element templates; now every element template is React-based.

## [0.4.1] - 2017-07-18
### Added
- Support for IE11 (without exporting to SVG/PNG).
- Workspace API for external toolbar.
- Support for DBPedia Sparql endpoints.
- Link direction in Connections menu and Instances panel.
- Support for properties on links.
- `centerTo()` and language props to Workspace.

### Changed
- **[Breaking]** `DiagramModel.requestElementData()` don't requests for links.
- **[Breaking]** Connected links data cleared from model on element remove.
- **[Breaking]** Replaced `WikidataDataProvider` with extensive options for `SparqlDataProvider`
- **[Breaking]** Introduced `linkElements()` and link direction in `DataProvider`.
- **[Breaking]** Simplified `GraphBuilder` interface.
- Replaced `foreignObject`-based element rendering with overlayed
HTML elements.
- Filter non-left mouse button clicks on paper.
- Automatically set link type visible when adding elements through
Connections menu.
- Tutorial don't automatically show up on a first visit by default.
- Pan canvas without requiring to hold any modifier keys.
- Prevent overlapping of multiple links between a pair of nodes and when
source and target is the same node.
- Make right panel with link types closed by default.

### Fixed
- Inconsistent elements and links rendering between editor and exported SVG.
- Paper always including initial canvas area when adjusting size to content.
- Rendering `Halo` in a wrong place when paper origin changes.
- Non-scrollable Connections panel in Firefox and IE11.
- Lost scroll position in Instances panel on 'Show more' button press
(introduced in [0.3.8]).
- Missing localized labels with different languages for classes.
- Drag and drop classes from tree in Opera.
- Forward outer React context to element templates.
- Support SPARQL endpoint URLs with query params.

## [0.3.8] - 2017-01-24
### Added
- Saving to/loading from LocalStorage examples.

### Changed
- **[Breaking]** Replaced DiagramModel.importLayout()'s `preloadedLinks`
parameter with `validateLinks`: when specified, marks all links from layout as
`layoutOnly` and requests diagram links at the end of importing process.
- Diagram content now centered at paper after performing force layout.
- Updated to recent react typings and fixed relevant errors

### Fixed
- Sorting elements properties by label.
- Placement of newly added from Connections popup elements.
- Lost links geometry when importing a layout.

### Removed
- **[Breaking]** Non-expiring "cache" `DiagramModel.elements`, replaced by
`cells`/`elements`/`links`/`getElement` accessors.
- **[Breaking]** `presentOnDiagram` property from Element: now element is
present if it's in a graph, otherwise it's considered to be absent.

## [0.3.7] - 2017-01-12
### Added
- Select/deselect all elements checkbox in Connections popup.

### Fixed
- Too close zoom to fit on diagrams with small number of elements,
making elements unnessesary big.

## [0.3.6] - 2017-01-11
### Fixed
- Broken attachment of links to nodes when loading a diagram.

## [0.3.5] - 2016-12-29
### Added
- Ability display labels for element properties by implementing
`DataProvider.propertyInfo()`.

### Changed
- Replaced `d3` dependency with `d3-color`.

### Fixed
- Exported missing `LayoutData` types.
- Error when `WikidataProvider.filter()` query execution encounters literals
or non-entity IRIs.
- Diagram area scroll jump on element click when workspace area size changed.
- Filter trash nodes (hyperlinks to resources expressed as IRIs)
in `WikidataProvider`.
- Made diagram area scroll smoother in Webkit browsers.
- Preserve full URI when drag'n'drop links with absolute URI with hashpart
onto the diagram area.
- Printing person template with expanded properties.

## [0.3.3] - 2016-12-15
### Added
- "Search for connected elements" button to Halo.

### Changed
- Disabled "click on element to search".
- Hide Connections popup when click on empty paper space.

### Fixed
- Display error in Connections popup on failed request.
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
- **[Breaking]** Link arrowheads implementation replaced by native
SVG markers, changed link style customization interface.
- **[Breaking]** Rewritten scrollable diagram component `PaperArea`
in React way, moved `zoomToFit()` and other related members.
This change fixes many issues with scrolling and resizing diagram area.
- **[Breaking]** Fixed typo in `GraphBuilder.getGraphFromConstruct()` method name.
- Significant performance improvments when importing diagram.
- Increased preferred link length in force layout.

### Fixed
- Unable to export as PNG/SVG diagram that contains element with SVG thumbnail.
- Unable to export as PNG/SVG in Firefox >= 50.
- Connections popup height overflow in Firefox.

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

[Latest]: https://github.com/ontodia-org/ontodia/compare/v0.6.1...HEAD
[0.8.0]: https://github.com/ontodia-org/ontodia/compare/v0.8.0...v0.6.1
[0.7.0]: https://github.com/ontodia-org/ontodia/compare/v0.7.0...v0.6.1
[0.6.1]: https://github.com/ontodia-org/ontodia/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/ontodia-org/ontodia/compare/v0.5.3...v0.6.0
[0.5.3]: https://github.com/ontodia-org/ontodia/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/ontodia-org/ontodia/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/ontodia-org/ontodia/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/ontodia-org/ontodia/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/ontodia-org/ontodia/compare/v0.3.8...v0.4.1
[0.3.8]: https://github.com/ontodia-org/ontodia/compare/v0.3.7...v0.3.8
[0.3.7]: https://github.com/ontodia-org/ontodia/compare/v0.3.6...v0.3.7
[0.3.6]: https://github.com/ontodia-org/ontodia/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/ontodia-org/ontodia/compare/v0.3.3...v0.3.5
[0.3.3]: https://github.com/ontodia-org/ontodia/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/ontodia-org/ontodia/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/ontodia-org/ontodia/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ontodia-org/ontodia/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/ontodia-org/ontodia/compare/v0.2.0...v0.2.1
