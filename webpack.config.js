var webpack = require('webpack');
var path = require('path');

var npmDir = path.join(__dirname, 'node_modules');

// if BUNDLE_PEERS is set, we'll produce bundle with all dependencies
var bundlePeers = Boolean(process.env.BUNDLE_PEERS);

var plugins = [];

if (bundlePeers) plugins.push(new webpack.optimize.UglifyJsPlugin({
    compress: {
        warnings: false
    }
}));

module.exports = {
    entry: {
        ontodia: path.join(__dirname, 'src', 'index.ts'),
    },
    resolve: {
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
        ],
    },
    plugins: plugins,
    output: {
        path: path.join(__dirname, 'dist'),
        filename: !bundlePeers ? 'ontodia.js' : 'ontodia-full.min.js',
        library: 'Ontodia',
        libraryTarget: 'umd',
    },
    externals: !bundlePeers ? {
        'd3-color': true,
        'intro.js': true,
        'jointjs': true,
        'jquery': true,
        'lodash': true,
        'n3': true,
        'react': true,
        'react-dom': true,
        'backbone': true,
        'webcola': true,
        'whatwg-fetch': true,
    } : {},
    devtool: '#source-map',
};
