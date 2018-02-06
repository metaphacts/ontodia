var webpack = require('webpack');
var path = require('path');

var npmDir = path.join(__dirname, 'node_modules');

// if BUNDLE_PEERS is set, we'll produce bundle with all dependencies
var BUNDLE_PEERS = Boolean(process.env.BUNDLE_PEERS);
// always include IE support in full bundle
var SUPPORT_IE = Boolean(process.env.SUPPORT_IE || process.env.BUNDLE_PEERS);

var plugins = [];
if (BUNDLE_PEERS) {
    plugins.push(new webpack.optimize.UglifyJsPlugin({
        compress: {
            warnings: false
        }
    }));
}

var aliases = {};
if (!SUPPORT_IE) {
    const emptyModule = path.resolve(__dirname, 'src', 'emptyModule.ts');
    aliases['canvg-fixed'] = emptyModule;
    aliases['es6-promise/auto'] = emptyModule;
}

module.exports = {
    entry: {
        ontodia: path.join(__dirname, 'src', 'index.ts'),
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
    plugins: plugins,
    output: {
        path: path.join(__dirname, 'dist'),
        filename: (
            BUNDLE_PEERS ? 'ontodia-full.min.js' :
            SUPPORT_IE ? 'ontodia-ie.js' :
            'ontodia.js'
        ),
        library: 'Ontodia',
        libraryTarget: 'umd',
    },
    externals: BUNDLE_PEERS ? {} : {
        'd3-color': true,
        'intro.js': true,
        'lodash': true,
        'n3': true,
        'react': true,
        'react-dom': true,
        'webcola': true,
        'whatwg-fetch': true,
    },
    devtool: '#source-map',
};
