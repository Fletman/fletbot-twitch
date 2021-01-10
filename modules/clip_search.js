const axios = require('axios');
const str_similarity = require('string-similarity');

/**
 * Search channel's top 1000 clips for matching title. Bailout early if title match meets specified threshold
 * @param {string} client_id 
 * @param {string} token 
 * @param {string} channel_id 
 * @param {string} clip_title 
 * @param {number} match_threshold 
 */
module.exports = async (client_id, token, channel_id, clip_title, match_threshold = .85) => {
    if(match_threshold < 0 || match_threshold > 1) {
        throw (`Invalid match threshold: ${match_threshold} Value must be between 0 and 1`);
    }

    let match = {};
    let page_index = 0;
    const t0 = Date.now();
    const req_body = {
        method: 'get',
        url: `https://api.twitch.tv/helix/clips?broadcaster_id=${channel_id}&first=100`,
        headers: {
            'client-id': client_id,
            'Authorization': `Bearer ${token}`
        }
    };
    let req = axios(req_body);
    let response;
    let paging;

    do {
        response = await req;
        paging = (response.data && response.data.pagination && response.data.pagination.cursor);
        if(paging) {
            req_body.url = `https://api.twitch.tv/helix/clips?broadcaster_id=${channel_id}&first=100&after=${response.data.pagination.cursor}`;
            req = axios(req_body);
        }
        page_index++;
        match = get_best_match(match, clip_title, response.data.data);
    } while(paging && match.percentage < match_threshold);

    return match.url ?
        Object.assign(
            match, {
                match_percent: Math.trunc(match.percentage * 10000) / 100,
                pages_read: page_index,
                search_time: `${(Date.now() - t0) / 1000} sec`
            }) :
        null;
};

function get_best_match(prev_match, clip_title, clips) {
    let match = prev_match;
    for(const clip of clips) {
        const title_match = str_similarity.compareTwoStrings(clip_title, clip.title.toLowerCase());
        if(!match.url || title_match > match.percentage) {
            match = {
                title: clip.title,
                url: clip.url,
                percentage: title_match
            };
        }
    }
    return match;
}
