"use strict";

const axios = require('axios');
const fs = require('fs');
const path_resolve = require('path').resolve;
const bot_data = require('./data.js');
const credentials = require('./credentials.js');
const logger = require('./fletlog.js');

const mod_data_file = './resources/mod_data.json';
const one_minute_ms = 60000;
const one_hour_ms = one_minute_ms * 60;
const one_day_ms = one_hour_ms * 24;

module.exports = {
    /**
     * Start a job to periodically fetch a list of accounts to ban
     * @param {Object} chat_client tmi.js chat client
     * @param {Number?} loop_period time in ms between ban waves
     */
    start_ban_loop: (chat_client, loop_period=one_hour_ms) => {
        setInterval(() => ban_wave(chat_client), loop_period);
    },

    manual_ban_wave: ban_wave
}

/**
 * 
 * @param {Array<Object>} doc_elements //Google Document object
 * @returns {Array<string>} list of lines in doc
 */
function get_doc_lines(doc_elements) {
    let doc_lines = [];
    for(const value of doc_elements) {
        if('paragraph' in value) {
            for(const p_elem of value.paragraph.elements) {
                if(p_elem.textRun) {
                    const raw_text = p_elem.textRun.content.trim();
                    if(raw_text.length > 0) {
                        doc_lines.push(raw_text);
                    }
                }
            }
        }
    }
    return Array.from(new Set(doc_lines));
}

/**
 * Pull list of banned usernames from Google Docs, apply bans across relevant channels
 * @param {Object} chat_client
 */
function ban_wave(chat_client) {
    logger.log("Starting ban wave");

    const mod_data = JSON.parse(fs.readFileSync(mod_data_file));
    credentials.get_google_access_token()
        .then((access_token) => {
            axios({
                url: `https://docs.googleapis.com/v1/documents/${mod_data.ban_doc_id}?key=${credentials.get_google_key()}`,
                method: 'get',
                headers: {
                    'Authorization': `Bearer ${access_token}`
                }
            })
            .then((response) => {
                const doc_lines = get_doc_lines(response.data.body.content);
                for(const channel_name of chat_client.getChannels()) {
                    let skip_reason = null;
                    if(!chat_client.isMod(channel_name, "fletbot795")) {
                        skip_reason = `Moderation not available in channel ${channel_name}`;
                    }
                    if(!bot_data.is_bot_protected_channel(channel_name)) {
                        skip_reason = `Channel ${channel_name} does not have active protection`;
                    }
                    if(skip_reason) {
                        logger.log(`${skip_reason}, skipping channel...`);
                        continue;
                    }

                    const ban_cache = bot_data.get_ban_cache(channel_name);
                    const to_ban_list = ban_cache ?
                        doc_lines.filter(username => !ban_cache.includes(username)) :
                        doc_lines;
                    const ban_promises = to_ban_list.map((username) => chat_client.say(channel_name, `/ban ${username}`));
                    Promise.all(ban_promises)
                        .then((promise_values) => {
                            for(const data of promise_values) {
                                logger.log(data);
                            }
                            bot_data.update_ban_cache(channel_name, to_ban_list);
                            logger.log(`Completed ban wave for channel ${channel_name}`);
                        }).catch((err) => {
                            logger.error(err);
                        });
                }
            })
            .catch((err) => {
                logger.error(err);
            });
        })
        .catch((err) => {
            logger.error(err);
        });
}