const { parentPort } = require('worker_threads');
const clip_searcher = require('../modules/clip_search.js');

parentPort.on('message', (params) => {
    if(params.clip_title === '*') {
        clip_searcher.random_clip(params.client_id, params.token, params.channel)
            .then((clip) => {
                parentPort.postMessage(clip);
            }).catch((err) => {
                throw (err);
            });
    } else {
        clip_searcher.clip_search(params.client_id, params.token, params.channel, params.clip_title)
            .then((clip) => {
                parentPort.postMessage(clip);
            }).catch((err) => {
                throw (err);
            });
    }
});
