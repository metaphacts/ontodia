var webpack = require('webpack');
var path = require('path');

var CommonsChunkPlugin = require("webpack/lib/optimize/CommonsChunkPlugin");
var HtmlWebpackPlugin = require('html-webpack-plugin');

var SUPPORT_IE = Boolean(process.env.SUPPORT_IE);

var npmDir = path.join(__dirname, 'node_modules');

var aliases = {};
if (!SUPPORT_IE) {
    const emptyModule = path.resolve(__dirname, 'src', 'emptyModule.ts');
    aliases['canvg-fixed'] = emptyModule;
    aliases['es6-promise/auto'] = emptyModule;
}

module.exports = {
    entry: {
        rdf: path.join(__dirname, 'src', 'examples', 'rdf.ts'),
        demo: path.join(__dirname, 'src', 'examples', 'demo.ts'),
        sparql: path.join(__dirname, 'src', 'examples', 'sparql.ts'),
        dbpedia: path.join(__dirname, 'src', 'examples', 'dbpedia.ts'),
        sparqlNoStats: path.join(__dirname, 'src', 'examples', 'sparqlNoStats.ts'),
        sparqlConstruct: path.join(__dirname, 'src', 'examples', 'sparqlConstruct.ts'),
        sparqlRDFGraph: path.join(__dirname, 'src', 'examples', 'sparqlRDFGraph.ts'),
        sparqlTurtleGraph: path.join(__dirname, 'src', 'examples', 'sparqlTurtleGraph.ts'),
        styleCustomization: path.join(__dirname, 'src', 'examples', 'styleCustomization.ts'),
        wikidata: path.join(__dirname, 'src', 'examples', 'wikidata.ts'),
        composite: path.join(__dirname, 'src', 'examples', 'composite.ts'),
        wikidataGraph: path.join(__dirname, 'src', 'examples', 'wikidataGraph.ts'),
        toolbarCustomization: path.join(__dirname, 'src', 'examples', 'toolbarCustomization.tsx'),
    },
    resolve: {
        alias: aliases,
        extensions: ['', '.ts', '.tsx', '.webpack.js', '.web.js', '.js'],
    },
    module: {
        loaders: [
            {test: /\.ts$|\.tsx$/, loader: 'ts-loader'},
            {test: /\.css$/, loader: 'style-loader!css-loader'},
            {test: /\.scss$/, loader: 'style-loader!css-loader!sass-loader'},
            {test: /\.jpe?g$/, loader: 'url-loader?mimetype=image/jpeg'},
            {test: /\.gif$/, loader: 'url-loader?mimetype=image/gif'},
            {test: /\.png$/, loader: 'url-loader?mimetype=image/png'},
            {test: /\.svg$/, loader: 'url-loader?mimetype=image/svg+xml'},
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            filename: 'rdf.html',
            title: 'Ontodia RDF Demo',
            chunks: ['commons', 'rdf'],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
        new HtmlWebpackPlugin({
            title: 'Ontodia Local Demo',
            chunks: ['commons', 'demo'],
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
            filename: 'sparqlTurtleGraph.html',
            title: 'Ontodia SparQL Turtle Graph Demo',
            chunks: ['commons', 'sparqlTurtleGraph'],
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
        new HtmlWebpackPlugin({
            filename: 'composite.html',
            title: 'Ontodia composite DP Demo',
            chunks: ['commons', 'composite'],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
        new HtmlWebpackPlugin({
            filename: 'toolbarCustomization.html',
            title: 'Ontodia Toolbar Customization Demo',
            chunks: ['commons', 'toolbarCustomization'],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
        new CommonsChunkPlugin('commons', 'commons.chunk.js'),
    ],
    output: {
        path: path.join(__dirname, 'dist', 'examples'),
        filename: '[name].bundle.js',
        chunkFilename: '[id].chunk.js',
        publicPath: '',
    },
    devtool: '#source-map',
    devServer: {
        proxy: {
            '/sparql**': {
                target: process.env.SPARQL_ENDPOINT,
                pathRewrite: {'/sparql' : ''},
                changeOrigin: true,
                secure: false,
            },
            '/wikidata**': {
                target: process.env.WIKIDATA_ENDPOINT || process.env.SPARQL_ENDPOINT,
                pathRewrite: {'/wikidata' : ''},
                changeOrigin: true,
                secure: false,
            },
            '/lod-proxy/**': {
                target: process.env.LOD_PROXY,
                changeOrigin: true,
                secure: false,
            },
            '/wikidata-prop-suggest**': {
                target: 'http://wikidata-prop-suggest.apps.vismart.biz/',
                pathRewrite: {'/wikidata-prop-suggest' : ''},
                changeOrigin: true,
                secure: false,
            },
        },
    },
};
