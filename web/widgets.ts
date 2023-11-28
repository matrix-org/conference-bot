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

import * as qs from 'qs';

export const urlParams = (new URL(window.location.href)).searchParams;
export const widgetId = urlParams.get("widgetId");
export const isWidget = widgetId && widgetId !== "$matrix_widget_id";

const widgetQuery = qs.parse(window.location.hash.substring(1));
export const addlQuery = Object.assign({}, qs.parse(window.location.search.substring(1)), widgetQuery);
