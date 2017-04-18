var webpack = require('webpack');
var path = require('path');

var CommonsChunkPlugin = require("webpack/lib/optimize/CommonsChunkPlugin");
var HtmlWebpackPlugin = require('html-webpack-plugin');

var npmDir = path.join(__dirname, 'node_modules');

module.exports = {
    entry: {
        demo: path.join(__dirname, 'src', 'examples', 'demo.ts'),
        sparql: path.join(__dirname, 'src', 'examples', 'sparql.ts'),
        neo4jMovies: path.join(__dirname, 'src', 'examples', 'neo4jMovies.ts'),
        neo4jPanama: path.join(__dirname, 'src', 'examples', 'neo4jPanama.ts'),
        dbpedia: path.join(__dirname, 'src', 'examples', 'dbpedia.ts'),
        sparqlNoStats: path.join(__dirname, 'src', 'examples', 'sparqlNoStats.ts'),
        sparqlConstruct: path.join(__dirname, 'src', 'examples', 'sparqlConstruct.ts'),
        sparqlRDFGraph: path.join(__dirname, 'src', 'examples', 'sparqlRDFGraph.ts'),
        styleCustomization: path.join(__dirname, 'src', 'examples', 'styleCustomization.ts'),
        wikidata: path.join(__dirname, 'src', 'examples', 'wikidata.ts'),
        wikidataGraph: path.join(__dirname, 'src', 'examples', 'wikidataGraph.ts'),
    },
    resolve: {
        extensions: ['', '.ts', '.tsx', '.webpack.js', '.web.js', '.js'],
        alias: {
            // Backbone provided by joint.js, to prevent module duplication which
            // causes errors when Ontodia uses Backbone models from joint.js
            'backbone': path.join(npmDir, 'backbone', 'backbone.js'),
            // awful and temporary workaround to reference browser bundle instead of node's, see:
            // https://github.com/wycats/handlebars.js/issues/1102
            'handlebars': path.join(npmDir, 'handlebars', 'dist', 'handlebars.min.js'),
        },
    },
    module: {
        loaders: [
            {test: /\.ts$|\.tsx$/, loader: 'ts-loader'},
            {test: /\.css$/, loader: 'style-loader!css-loader'},
            {test: /\.scss$/, loader: 'style-loader!css-loader!sass-loader'},
            {test: /\.jpe?g$/, loader: 'url-loader?mimetype=image/jpeg'},
            {test: /\.gif$/, loader: 'url-loader?mimetype=image/gif'},
            {test: /\.png$/, loader: 'url-loader?mimetype=image/png'},
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            title: 'Ontodia Local Demo',
            chunks: ['commons', 'demo'],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
        new HtmlWebpackPlugin({
            filename: 'neo4jMovies.html',
            title: 'Ontodia neo4jMovies Demo',
            chunks: ['commons', 'neo4jMovies'],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
        new HtmlWebpackPlugin({
            filename: 'neo4jPanama.html',
            title: 'Ontodia neo4jPanamaPapers Demo',
            chunks: ['commons', 'neo4jPanama'],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
        new HtmlWebpackPlugin({
            filename: 'sparql.html',
            title: 'Ontodia SparQL Demo',
            chunks: ['commons', 'sparql'],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
        new HtmlWebpackPlugin({
            filename: 'dbpedia.html',
            title: 'Ontodia DBPedia SparQL Demo',
            chunks: ['commons', 'dbpedia'],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
        new HtmlWebpackPlugin({
            filename: 'sparqlNoStats.html',
            title: 'Ontodia SparQL Demo',
            chunks: ['commons', 'sparqlNoStats'],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
        new HtmlWebpackPlugin({
            filename: 'sparqlConstruct.html',
            title: 'Ontodia SparQL Construct Demo',
            chunks: ['commons', 'sparqlConstruct'],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
        new HtmlWebpackPlugin({
            filename: 'sparqlRDFGraph.html',
            title: 'Ontodia SparQL RDF Graph Demo',
            chunks: ['commons', 'sparqlRDFGraph'],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
        new HtmlWebpackPlugin({
            filename: 'styleCustomization.html',
            title: 'Ontodia Style Customization Demo',
            chunks: ['commons', 'styleCustomization', ],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
        new HtmlWebpackPlugin({
            filename: 'wikidata.html',
            title: 'Ontodia Wikidata Demo',
            chunks: ['commons', 'wikidata', ],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
        new HtmlWebpackPlugin({
            filename: 'wikidataGraph.html',
            title: 'Ontodia Wikidata with graph Demo',
            chunks: ['commons', 'wikidataGraph', ],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
        new CommonsChunkPlugin('commons', 'commons.chunk.js'),
    ],
    output: {
        path: path.join(__dirname, 'dist', 'examples'),
        filename: '[name].bundle.js',
        chunkFilename: '[id].chunk.js',
        publicPath: '/',
    },
    devtool: '#source-map',
    devServer: {
        proxy: {
            "/sparql-endpoint**": {
                //preventing endpoint to be null, HPM will not initialize correctly
                target: process.env.SPARQL_ENDPOINT ? process.env.SPARQL_ENDPOINT : 'http://example.com/sparql',
                pathRewrite: {'/sparql-endpoint' : ''},
                changeOrigin: true,
                secure: false
            },
            "/neo4j-endpoint/**": {
                target: process.env.NEO4J_ENDPOINT ? process.env.NEO4J_ENDPOINT : 'http://localhost:7474',
                auth: process.env.NEO4J_AUTH ? process.env.NEO4J_AUTH  : 'neo4j:neo4j',
                pathRewrite: { '/neo4j-endpoint' : ''},
                changeOrigin: true,
                secure: false
            },
        },
    },
};
