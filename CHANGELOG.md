# Change Log
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) 
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Latest]

## [0.12.0] - 2020-02-05
### Changed
- Move toolbar to paper viewport as a widget.
- Add handling for cancelled MetadataApi or ValidationApi requests.
- Wait and show spinner in EditLayer until metadata requests finish.
- Optimize authoring mode performance on large diagrams.

### Fixed
- Update node-sass to work to build on newer Node runtimes (> 8.x).
- Avoid moving the canvas in `Workspace.showWaitIndicatorWhile()`.
- Set progress bar color to red when in the error state.
- Fix losing links from selection on changing graph content
(adding or removing elements or links).
- Prevent canvas scroll jump when dropping URIs onto canvas (e.g. from class tree).

## [0.11.0] - 2019-12-04
### Added
- Ability to externally fetch labels for resources in `SparqlDataProvider`
using `prepareLabels` option.
- Options to override schema info queries (classes, link types, datatype properties)
in `SparqlDataProviderSettings`.
- Support for "direct" link and property configurations in `SparqlDataProviderSettings`,
explicit domain types matching and experimental "open world" mode for link and property
configurations.
- Support for changing IRI of existing entities in authoring mode.
- Display link type IRI as default title for link labels.

### Changed
- **[Breaking]** Made `LocalizedString` compatible with `Literal` interface
from [RDF/JS Data Model](https://rdf.js.org/data-model-spec/) specification.
- **[Breaking]** Replaced separate authoring event types for deleting entities
and links by `deleted` flag in corresponding events, replaced `AuthoringState`
representation by only using authoring event index.
- **[Breaking]** Renamed `SparqlDataProviderSettings.filterTypePattern` binding
`${elementTypeIri}` -> `?class`.
- **[Breaking]** Removed `LinkConfiguration.inverseId`.

### Fixed
- Stale `ElementLayer` rendering after calling `importLayout()` if diagram
already contains elements with the same IDs.
- React 16.x warning about uppercase characters in `data-linkTypeId` attribute name.
- `SparqlDataProvider` only adds `extractLabel` pattern to queries if text token is
provided when searching/filtering elements.

## [0.10.0] - 2019-09-30
### Added
- Custom element state in the serialized diagram layout via
`elementTemplateState` property.
- Enhance standard template with ability to "pin" properties to display them
even in collapsed state.
- Options to override `selectLabelLanguage` to customize label language
selection based on user-preferred language.

### Changed
- **[Breaking]** New look for collapsible sidebar panels,
remove sidebar expand/collapse state props from `ToolbarProps`.
- Use first character of types instead of label as thubmnail fallback in
standard element template.
- Highlight single-selected nodes with additional border in Halo.
- Changed the look for temporary elements in authoring mode.

### Fixed
- Incorrectly overlapping authoring status overlays of elements and links
(new, changed, deleted, etc).
- Scrolling to canvas location on navigator click when there are any vertical
scrolling on a page (`Window.pageYOffset` is not zero).
- Bias in layout algorithms making diagrams look too vertical.
- Drag'n'drop button to create entity from class tree in Firefox.

## [0.9.12] - 2019-08-27
### Added
- Option to collapse diagram navigator by default.

### Changed
- **[Breaking]** decoding href value of anchor before calling UI callback.
- Selected elements on a diagram are always brought to front.
- Loading class tree is now done in a lazy way and separately from importing
diagram layout.
- Changed copyright due to IP transfer to metaphacts GmbH.

## [0.9.11] - 2019-07-25
### Fixed
- Add workaround for invalid rendering of items in scrollable containers in Chrome.

## [0.9.10] - 2019-06-28
### Fixed
- Error in authoring mode when one of the ends of new link doesn't have a label.
- Export SVG by bundling only CSS rules applied to child element on the diagram.

## [0.9.9] - 2019-06-11
### Added
- Allow to change IRI of new entities via custom editor.
- Separate close button to every dialog.

### Changed
- **[Breaking]** Require `generateElementIri` to be implemented in `MetadataApi`.
- Allow to choose link direction in "edit link" dialog.

### Fixed
- An error while calculating class stats with cyclically referenced classes.
- Invalid authoring state after creating new entity by dragging from another one.
- An error while rendering additional labels for link properties.
- Prevent reusing the same "edit entity" form after switching to another entity.
- Support multiple values of a property in `RdfDataProvider`.

## [0.9.8] - 2019-03-26
### Added
- Custom link state in the serialized diagram layout.
- Link "renaming" using custom link template.
- Ability to highlight diagram elements using `DiagramView.setHighlighter()`.
- Expand/collapse button to the Navigator.

### Changed
- **[Breaking]** Pass IRI click intent to the `onIriClick` handler.
- Navigator now displays only a part of the diagram area with elements and links,
instead of the full scrollable pane.

### Fixed
- Resizing dialogs with custom size specified, resizing handle style in IE11/Edge.
- Creating new element instead of showing existing one after drag'n'drop from
class tree to create a new entity.
- Mismatch between routed link geometry and status overlay for the same link
that sometimes happens in the authoring mode.
- Support of international IRIs in `SparqlDataProvider` and drag'n'drop.
- `zoomToFit()` for zero bounding box.
- Trigger `historyChanged` event in the default no-op command history.
- Diagram zooming with Control+Wheel which was broken with Chrome 73,
see https://github.com/facebook/react/issues/14856 for details.

## [0.9.7] - 2018-12-18
### Added
- Internal support for animated paper operations.

### Changed
- **[Breaking]** Generate element and link IDs as full IRIs (fixes issue
with getting relative IRIs when framing JSON-LD layout data).

### Fixed
- Missing prefixes for the blank nodes query in `SparqlDataProvider`.
- Duplication of link types in `RdfDataProvider`.
- Search by text in `RdfDataProvider`.
- Mixed up datatype and object property icons.
- Missing parents for classes with multiple parents in `SparqlDataProvider`.
- Stale validation state when removing element with new links, deleting target
element and incorrect highlighting for deleted links.

## [0.9.6] - 2018-11-10
### Added
- Ability to return validation result for outgoing links when validating an element.
- `Cancellation` and `CancellationToken` to exported API.
- Auto-scroll to contextual menu when it appears in the viewport.

### Changed
- **[Breaking]** Replaced `DiagramViewOptions.typeStyleResolvers` option
with single `WorkspaceProps.typeStyleResolver` function;
same for `linkTemplateResolvers` and `templatesResolvers`.
- Display link authoring state using status label with *cancel* action.
- Prevent closing "Edit entity" dialog when clicking outside.

### Fixed
- Link style conflicts when using multiple `Workspace` instances on a page.
- JSON-LD context definition (now using `@vocab` for element IRIs).
- Incorrectly displayed icons and non-working drag and drop from class tree
in IE11.
- Regexp search for some SPARQL endpoints in `SparqlDataProvider`.
- Inability to redefine functions for custom toolbar.

## [0.9.5] - 2018-10-16
### Fixed
- Missing localized labels on class tree initialization.
- Resetting language on `Workspace` update in uncontrolled mode.

## [0.9.4] - 2018-10-16
### Fixed
- Resetting temporary elements and links in authoring mode when changing selection.
- Missing validation on authoring changes.
- Missing "add to filter" button in Firefox.
- Duplication of link type labels in `SparqlDataProvider`.

### Removed
- **[Breaking]** Intro.js-based tutorial.
- Dependency on jsTree for class tree (greatly reduced bundle size).

## [0.9.3] - 2018-09-20
### Added
- Ontodia watermark to diagrams.

### Changed
- Using CircleCI instead of Travis for builds.
- Updated dependencies 

### Fixed
- Force layout for nested elements.

## [0.9.2] - 2018-09-05
### Added
- "Clear All" button to the toolbar.
- "Jump to resource" button to the halo.
- `WorkspaceProps.hideScrollBars` and `ZoomOptions.requireCtrl` options.
- Workspace events on various user actions and operations completion.

### Changed
- **[Breaking]** Export and import diagrams using new `SerializedDiagram` interface,
compatible with JSON-LD.
- Select a range of items in a search result using Shift and Control keys.

### Fixed
- Limit zoom to fit level by `ZoomOptions.maxFit`.

## [0.9.1] - 2018-07-20
### Fixed
- Show halo for links only in authoring mode.
- Wait until element models loaded when importing layout.

## [0.9.0] - 2018-07-19
### Added
- Data authoring capabilities (see `AuthoringState`, `MetadataApi`, `ValidationApi`).
- Support for "pinned" paper widgets (which doesn't move on paper scroll).
- Tooltips with IRIs to Classes, Instances, Connections and standard template.
- Patterns for datatype properties through `propertyConfigurations` property of
`SparqlDataProvider` configuration.

### Changed
- **[Breaking]** Introduce `AsyncModel` derived from `DiagramModel` managing all async
operations (e.g. loading labels, links, etc).
- **[Breaking]** Extract standard widget handling (halo, dialogs) into `EditorController`.
- **[Breaking]** Use image URLs instead of CSS classes to customize icons.
- Made `inverseOf` optional and allow multiple items with same `id` or `inverseId` in
`linkConfigurations` property of `SparqlDataProvider` configuration.
- Made look and feel of controls and templates more modern.

## [0.8.1] - 2018-07-02
### Changed
- **[Breaking]** Introduce nominal types for element, class, link type and property type IRIs.

### Fixed
- **[Breaking]** Assumption "element ID equals its IRI" when dealing with sources
and targets of links.
- Non-updating link labels when changing the language.
- Extracting link and property types metadata for multiple languages.
- Filtering in Connections menu for upper-case text.
- Increase default inter-node distance for force layout.

## [0.8.0] - 2018-04-16
### Added
- Nesting (grouping) elements on diagram using `groupBy` option and `<EmbeddedLayer />`
element in custom templates.
- Buttons to toggle visiblility of left and right panels.
- `renderTo` function to create Workspace using compiled in bundled mode library.
- Separate library bundle for IE11 compatibility (when compile with `SUPPORT_IE` flag).
- Command history API hooks with `CommandHistory`.
- Blank nodes support to `RdfDataProvider`.

### Changed
- **[Breaking]** Optimize `SparqlDataProvider`: change `elementInfoQuery` from SELECT to
CONSTRUCT query, extract `linkTypesOf` statistics into separate `linkTypesOfStatsQuery`.
- **[Breaking]** Throw exception instead of returning null or undefined when fetching
error happens in `RdfDataProvider`.
- **[Breaking]** Replaced JointJS rendering engine with our own React-based
implementation.
- **[Breaking]** Replaced Backbone property and event system with native class
properties and composition-based event emitter implementation.
- **[Breaking]** Generate placeholder data only when rendering, e.g. `Element.data.label`
will be empty until element info will load.
- **[Breaking]** Split up `isViewOnly` option into `hideToolbar`, `hidePanels`
and `hideHalo`.
- Simplify overriding default toolbar with a custom one by providing default
callbacks in props.
- Removed default "checkboard" background in the diagram area.
- Replace default templates with unified `standard` template,
removed special templates for person and organization.
- Limit maximum number of connected elements in Connection menu to 100.

### Fixed
- `stroke-dasharray` style override for link labels.
- Error when RDF data storage returns `undefined` statements.
- Drag and drop from class tree in Safari.
- Missing "All" entry in Connections menu when there are two connections with
the same ID in the list.

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

[Latest]: https://github.com/metaphacts/ontodia/compare/v0.12.0...HEAD
[0.12.0]: https://github.com/metaphacts/ontodia/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/metaphacts/ontodia/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/metaphacts/ontodia/compare/v0.9.12...v0.10.0
[0.9.12]: https://github.com/metaphacts/ontodia/compare/v0.9.11...v0.9.12
[0.9.11]: https://github.com/metaphacts/ontodia/compare/v0.9.10...v0.9.11
[0.9.10]: https://github.com/metaphacts/ontodia/compare/v0.9.9...v0.9.10
[0.9.9]: https://github.com/metaphacts/ontodia/compare/v0.9.8...v0.9.9
[0.9.8]: https://github.com/metaphacts/ontodia/compare/v0.9.7...v0.9.8
[0.9.7]: https://github.com/metaphacts/ontodia/compare/v0.9.6...v0.9.7
[0.9.6]: https://github.com/metaphacts/ontodia/compare/v0.9.5...v0.9.6
[0.9.5]: https://github.com/metaphacts/ontodia/compare/v0.9.4...v0.9.5
[0.9.4]: https://github.com/metaphacts/ontodia/compare/v0.9.3...v0.9.4
[0.9.3]: https://github.com/metaphacts/ontodia/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/metaphacts/ontodia/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/metaphacts/ontodia/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/metaphacts/ontodia/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/metaphacts/ontodia/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/metaphacts/ontodia/compare/v0.6.1...v0.8.0
[0.6.1]: https://github.com/metaphacts/ontodia/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/metaphacts/ontodia/compare/v0.5.3...v0.6.0
[0.5.3]: https://github.com/metaphacts/ontodia/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/metaphacts/ontodia/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/metaphacts/ontodia/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/metaphacts/ontodia/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/metaphacts/ontodia/compare/v0.3.8...v0.4.1
[0.3.8]: https://github.com/metaphacts/ontodia/compare/v0.3.7...v0.3.8
[0.3.7]: https://github.com/metaphacts/ontodia/compare/v0.3.6...v0.3.7
[0.3.6]: https://github.com/metaphacts/ontodia/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/metaphacts/ontodia/compare/v0.3.3...v0.3.5
[0.3.3]: https://github.com/metaphacts/ontodia/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/metaphacts/ontodia/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/metaphacts/ontodia/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/metaphacts/ontodia/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/metaphacts/ontodia/compare/v0.2.0...v0.2.1
