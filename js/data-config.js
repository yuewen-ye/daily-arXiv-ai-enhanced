/* Archived public data is served with the site. */
const DATA_CONFIG = {
    demo: false,
    getDataBaseUrl() { return new URL('.', window.location.href).href.replace(/\/$/, ''); },
    getDataUrl(filePath) { return new URL(filePath, new URL('.', window.location.href)).href; }
};
