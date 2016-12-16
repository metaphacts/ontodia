var webpack = require('webpack');
var path = require('path');

var npmDir = path.join(__dirname, 'node_modules');

module.exports = {
    entry: {
        ontodia: path.join(__dirname, 'src', 'index.ts'),
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
    plugins: [],
    output: {
        path: path.join(__dirname, 'dist'),
        filename: 'ontodia.js',
        library: 'Ontodia',
        libraryTarget: 'umd',
    },
    externals: {
        'd3-color': true,
        'detect-browser': true,
        'intro.js': true,
        'jointjs': true,
        'jquery': true,
        'handlebars': true,
        'lodash': true,
        'n3': true,
        'react': true,
        'react-dom': true,
        'backbone': true,
        'webcola': true,
    },
    devtool: '#source-map',
};
