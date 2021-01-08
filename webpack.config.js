const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
    mode: 'development',
    entry: {
        'devroom': './web/devroom.ts'
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    plugins: [
        new CleanWebpackPlugin({ cleanStaleWebpackAssets: false }),
        new HtmlWebpackPlugin({
            template: './web/devroom.html',
            inject: true,
            chunks: ['devroom'],
            filename: "devroom.html",
        }),
    ],
    output: {
        path: path.resolve(__dirname, 'srv'),
        filename: "bundles/[chunkhash]/[name].js",
        chunkFilename: "bundles/[chunkhash]/[name].js",
    },
    devServer: {
        contentBase: path.join(__dirname, 'srv'),
        compress: true,
        port: 8081, // avoid conflicting with element-web
    }
};
