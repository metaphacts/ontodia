# Ontodia [![npm](https://img.shields.io/npm/v/ontodia.svg)](https://www.npmjs.com/package/ontodia) [![CircleCI](https://circleci.com/gh/sputniq-space/ontodia.svg?style=svg)](https://circleci.com/gh/sputniq-space/ontodia) #

Ontodia is a JavaScript library that allows to visualize, navigate and explore data in the form of an interactive graph based on underlying data sources. The library is a major front-end component in <a href="http://ontodia.org">ontodia.org</a> web application that provides semantic data visualization services.

## What is Ontodia for?

Ontodia allows you to create and persist diagrams made from existing data - relational, object, semantic.

It was designed to visualize RDF data sets in particular, but could be tailored to almost any data source by implementing a data provider interface.  

## Core features

- Visual navigation and diagramming over large graph data sets
- Rich graph visualization and context-aware navigation features 
- Ability to store and retrieve diagrams
- User friendly - no graph query language or prior knowledge of the schema required
- Customizable user interface (by modifying templates for nodes and links) and data storage back-end

## How to try it?

You can: 

- Open ontodia.org [demo diagram](http://app.ontodia.org/diagram?sharedDiagram=3vi9gi6akh9agrs9a7k7i14huo) and navigate through demo data set
- Create an account at [ontodia.org](http://app.ontodia.org/register), browse through sample diagrams, upload your RDF file or point to your SPARQL endpoint to build diagrams over your data
- Follow developer tutorials at the [developer documentation page](https://github.com/ontodia-org/ontodia/wiki)

Please note that on Ontodia.org we deployed the commercial version of the Ontodia library, which includes some additional features:

- Support of undo/redo for user actions
- Multiple selection of nodes
- Rectangular box multiple selection of nodes
- Multiple removal of nodes from diagrams
- Snap guides for node alignment
- Additional layouts for better distribution of nodes on the canvas, etc.

## How to use it

- Use it as service at [ontodia.org](http://ontodia.org). Connect to your data, create and share diagrams
- Customize it and embed into your web application as a JavaScript library

## License

The Ontodia library is distributed under LGPL-2.1. A commercial license with additional features, support and custom development is available, please contact us at [ontodia-people@vismart.biz](ontodia-people@vismart.biz).   


## Developer documentation and contributing

Developer documentation is available at [wiki page](https://github.com/ontodia-org/ontodia/wiki).

## Whom do I talk to? ##

Feel free to write to [ontodia-people@vismart.biz](mailto:ontodia-people@vismart.biz).

In order to simplify your access to our development team and to our growing community, we'd like to invite you to join our Slack channel. Here's the [form](https://goo.gl/forms/mfKFRRNU9ToHxGGM2) to fill out, so we can add you to the list of members. On our slack channel you can get answers to your questions regarding the library and ontodia.org service directly from developers and other users.

## Giving Ontodia people credit

If you use the Ontodia library in your projects, please provide a link to this repository in your publication and a citation reference to the following paper: 

Mouromtsev, D., Pavlov, D., Emelyanov, Y., Morozov, A., Razdyakonov, D. and Galkin, M., 2015. The Simple Web-based Tool for Visualization and Sharing of Semantic Data and Ontologies. In International Semantic Web Conference (Posters & Demos).

```
@inproceedings{Mouromtsev2015,
    author = {Mouromtsev, Dmitry and Pavlov, Dmitry and Emelyanov, Yury and
        Morozov, Alexey and Razdyakonov, Daniil and Galkin, Mikhail},
    year = {2015},
    month = {10},
    title = {The Simple Web-based Tool for Visualization and Sharing of Semantic Data and Ontologies},
    booktitle = {International Semantic Web Conference (Posters & Demos)}
}
```

It really helps our team to gain publicity and acknowledgment for our efforts.
Thank you for being considerate!
