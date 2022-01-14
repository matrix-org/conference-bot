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

/**
 * Converts a duration to a string.
 * @param duration The duration, in milliseconds.
 * @returns The duration, in mm:ss format.
 */
export function formatDuration(duration: number): string {
    const minutes = Math.floor(duration / 60 / 1000).toString().padStart(2, "0");
    const seconds = (Math.floor(duration / 1000) % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
}

export function getAttr(name: string): string {
    return Array.from(document.getElementsByTagName('meta'))
        .find(t => t.name === name)
        .getAttribute('content');
}
