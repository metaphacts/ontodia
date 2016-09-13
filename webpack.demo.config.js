var webpack = require('webpack');
var path = require('path');

var HtmlWebpackPlugin = require('html-webpack-plugin');

var npmDir = path.join(__dirname, 'node_modules');

module.exports = {
    entry: {
        demo: path.join(__dirname, 'src', 'examples', 'demo.ts'),
        sparql: path.join(__dirname, 'src', 'examples', 'sparql.ts'),
        sparqlConstruct: path.join(__dirname, 'src', 'examples', 'sparqlConstruct.ts'),
    },
    resolve: {
        extensions: ['', '.ts', '.tsx', '.webpack.js', '.web.js', '.js'],
        alias: {
            // Backbone provided by joint.js, to prevent module duplication which
            // causes errors when Ontodia uses Backbone models from joint.js
            'backbone': path.join(npmDir, 'backbone', 'backbone.js'),
        }
    },
    module: {
        loaders: [
            {test: /\.ts$|\.tsx$/, loader: 'ts-loader'},
            {test: /\.css$/, loader: 'style-loader!css-loader'},
            {test: /\.jpe?g$/, loader: 'file?name=images/[name].[ext]'},
            {test: /\.gif$/, loader: 'url-loader?mimetype=image/gif'},
            {test: /\.png$/, loader: 'url-loader?mimetype=image/png'},
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            title: 'Ontodia Local Demo',
            chunks: ['demo'],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
        new HtmlWebpackPlugin({
            filename: 'sparql.html',
            title: 'Ontodia SparQL Demo',
            chunks: ['sparql'],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
        new HtmlWebpackPlugin({
            filename: 'sparqlConstruct.html',
            title: 'Ontodia SparQL Construct Demo',
            chunks: ['sparqlConstruct'],
            template: path.join(__dirname, 'src', 'examples', 'template.ejs'),
        }),
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
            "/sparql-endpoint": {
                target: process.env.SPARQL_ENDPOINT,
                ignorePath: true,
                changeOrigin: true,
                secure: false,
            },
        },
    },
};
