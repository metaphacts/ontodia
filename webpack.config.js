var webpack = require('webpack');
var path = require('path');

var npmDir = path.join(__dirname, 'node_modules');

module.exports = {
    entry: {
        ontodia: path.join(__dirname, 'index.ts'),
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
            {test: /\.jpe?g$|\.gif$|\.png$/i, loader: 'file?name=images/[name].[ext]'},
        ]
    },
    plugins: [],
    output: {
        path: path.join(__dirname, 'dist'),
        filename: 'ontodia.js',
        library: 'Ontodia',
        libraryTarget: 'umd',
    },
    externals: {
        'd3': true,
        'intro.js': true,
        'jointjs': true,
        'jquery': true,
        'lodash': true,
        'n3': true,
        'react': true,
        'react-dom': true,
        'springy': true,
        'backbone': true,
    },
    devtool: '#source-map',
};
