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
        ],
    },
    resolve: {
        extensions: ['.ts', '.js'],
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