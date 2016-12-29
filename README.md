# Ontodia [![npm](https://img.shields.io/npm/v/ontodia.svg)]() [![Travis CI](https://img.shields.io/travis/ontodia-org/ontodia.svg)](https://travis-ci.org/ontodia-org/ontodia) #

Ontodia is a JavaScript library that allows to visualize, navigate and explore the data in the form of an interactive graph based on underlying data sources. The library is a major front-end component in <a href="http://ontodia.org">ontodia.org</a> web application that provides semantic data visualization services.

### What is Ontodia for? ###

Ontodia is a JavaScript library that allows you to create and persist diagrams made from data - relational, object, semantic.

It was designed to visualize RDF data sets in particular, but could be tailored to almost any data sourece by implementing data provider interface.  

### How do I get set up? ###

You can get Ontodia by using either npm or yarn:
```
$ npm install --save ontodia
```
or
```
$ yarn add ontodia
```


To quickly get Ontodia up and running run:
```
$ npm install && npm run demo
```
This will compile everything and you can start trying it.

* [http://localhost:10444/](http://localhost:10444/) will display Ontodia with static build-in data.
* [http://localhost:10444/sparql.html](http://localhost:10444/sparql.html) will display Ontodia with SPARQL endpoint set in `SPARQL_ENDPOINT` environment variable.

### Usage of TypeScript ###

Ontodia library heavily uses TypeScript language. All type definitions are exported along with a library. It's not required to use TypeScript to use this library, but even for JS developers it's worth through TypeScript sources or ontodia.d.ts build output file to know API.   

### Usage of library in you own code ###

Ontodia interface is React-based application and you should initialize React component to work with. You can see example of initializing library in [`src/examples/template.ejs`](src/examples/template.ejs) and [`src/examples/demo.ts`](src/examples/demo.ts).

#### Licence ####

Ontodia library is distributed under LGPL-2.1

#### Dependencies ####

- `react` - rendering UI views
- `intro.js` - displaying overlay help
- `jointjs` - base diagramming library
- `lodash` - general purpose utility library
- `n3` - parsing SPARQL endpoint responses
- `webcola` - performing graph layout

### Contribution guidelines ###

- Please describe your changes when creating pull requests.
- Please follow [our styleguide](./STYLEGUIDE.md).

### Who do I talk to? ###

Feel free to write to [ontodia-people@vismart.biz](mailto:ontodia-people@vismart.biz).
