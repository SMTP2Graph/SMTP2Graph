const webpack = require('webpack');
const path = require('path');

module.exports = (env, argv) => ({
    target: 'node',
    entry: {
        server: './src/server.ts',
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
    },
    module: {
        rules: [
            {
                exclude: /node_modules/,
                test: /\.ts$/,
                loader: 'ts-loader'
            },
            // Embed WebUI static files as strings
            {
                test: /\.(html|css)$/,
                include: path.resolve(__dirname, 'src/webui/public'),
                type: 'asset/source',
            },
            {
                test: /\.js$/,
                include: path.resolve(__dirname, 'src/webui/public'),
                type: 'asset/source',
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    // Express and ajv must be loaded at runtime (not bundled)
    externals: {
        'express': 'commonjs express',
        'ajv': 'commonjs ajv',
    },
    plugins: [
        new webpack.DefinePlugin({
            VERSION: JSON.stringify(require("./package.json").version),
            DEBUG: (argv.mode!=='production'),
        }),
    ],
    devtool: argv.mode==='production'?undefined:'inline-source-map',
    performance: {
        hints: false,
    },
    stats: {
        builtAt: true,
        chunks: false,
        chunkModules: false,
        chunkOrigins: false,
        modules: false,
        entrypoints: false,
        warnings: false,
    },
});