/*
Copyright 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
    mode: process.env.NODE_ENV || 'development',
    entry: {
        'auditorium': './web/auditorium.ts',
        'talk': './web/talk.ts',
        'scoreboard': './web/scoreboard.ts',
    },
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: {
                    loader: 'ts-loader',
                    options: {
                        configFile: 'tsconfig.web.json',
                    },
                },
                exclude: /node_modules/,
            },
            {
                test: /\.scss$/i,
                use: [
                    "style-loader",
                    "css-loader",
                    "sass-loader",
                ],
            }
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
        new HtmlWebpackPlugin({
            template: './web/talk.liquid',
            inject: true,
            chunks: ['talk'],
            filename: "talk.liquid",
        }),
        new HtmlWebpackPlugin({
            template: './web/scoreboard.liquid',
            inject: true,
            chunks: ['scoreboard'],
            filename: "scoreboard.liquid",
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
