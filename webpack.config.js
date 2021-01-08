const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
    mode: process.env.NODE_ENV || 'development',
    entry: {
        'auditorium': './web/auditorium.ts'
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
            template: './web/auditorium.liquid',
            inject: true,
            chunks: ['auditorium'],
            filename: "auditorium.liquid",
        }),
    ],
    output: {
        path: path.resolve(__dirname, 'srv'),
        publicPath: '/',
        filename: "bundles/[chunkhash]/[name].js",
        chunkFilename: "bundles/[chunkhash]/[name].js",
    },
    devServer: {
        contentBase: path.join(__dirname, 'srv'),
        compress: true,
        port: 8081, // avoid conflicting with element-web
    }
};
