// samplesInDwp.js
export let samplesInMemory = [];

export function addSample(name, blob) {
    samplesInMemory.push({name, blob});
}

export function clearSamples() {
    samplesInMemory = [];
}

export function getSamples() {
    return samplesInMemory;
}
