const { parentPort } = require('worker_threads');
const clip_searcher = require('../modules/clip_search.js');

parentPort.on('message', (params) => {
    console.log(params.search_params);
    if(params.search_params.title === '*' || params.search_params.search_type === 'game') {
        clip_searcher.random_clip(params.client_id, params.token, params.channel, params.search_params.game)
            .then((clip) => {
                parentPort.postMessage(clip);
            }).catch((err) => {
                throw (err);
            });
    } else {
        clip_searcher.clip_search(params.client_id, params.token, params.channel, params.search_params)
            .then((clip) => {
                parentPort.postMessage(clip);
            }).catch((err) => {
                throw (err);
            });
    }
});
