const { parentPort } = require('worker_threads');
const clip_search = require('../modules/clip_search.js');

parentPort.on('message', (params) => {
    clip_search(params.client_id, params.token, params.channel, params.clip_title)
        .then((clip) => {
            parentPort.postMessage(clip);
        })
        .catch((err) => {
            throw (err);
        });
});
