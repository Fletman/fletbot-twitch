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
    start_ban_loop: (chat_client, loop_period=(one_hour_ms*4)) => {
        setInterval(() => ban_wave(chat_client), loop_period);
    },

    manual_ban_wave: ban_wave
}

function delay(t) {
    return new Promise(resolve => setTimeout(resolve, t));
}

/**
 * 
 * @param {Object} g_doc Google Document object
 * @returns {Array<string>} list of lines in doc
 */
function get_doc_lines(g_doc) {
    const doc_lines = [];
    const doc_elements = g_doc.body.content;
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
 * 
 * @param {Object} g_sheet Google Spreadhheet objects
 * @returns {Array<string>} list of strings from sheet cells
 */
function get_sheet_lines(g_sheet) {
    const cell_list = [];
    const sheet = g_sheet.sheets[0];
    const rows = sheet.data[0].rowData;
    for(const row of rows) {
        if(row.values && row.values[0]) {
            cell_list.push(row.values[0].effectiveValue.stringValue);
        }
    }
    return Array.from(new Set(cell_list));
}

async function apply_bans(chat_client, full_ban_list, delay_ms=500) {
    for(const channel_name of chat_client.getChannels()) {
        if(!bot_data.is_bot_protected_channel(channel_name)) {
            continue;
        }
        const ban_cache = bot_data.get_ban_cache(channel_name);
        const to_ban_list = ban_cache ?
            full_ban_list.filter(username => !ban_cache.includes(username)) :
            full_ban_list;
        for(const ban_name of to_ban_list) {
            await delay(delay_ms);
            try {
                await chat_client.say(channel_name, `/ban ${ban_name}`);
            } catch(e) {
                logger.error(e);
            }
        }
        bot_data.update_ban_cache(channel_name, to_ban_list);
    }
}

/**
 * Pull list of banned usernames from Google Docs, apply bans across relevant channels
 * @param {Object} chat_client
 */
function ban_wave(chat_client) {
    logger.log("Starting ban wave");

    const mod_data = JSON.parse(fs.readFileSync(mod_data_file));
    let uri;
    let parse_func;
    switch(mod_data.ban_doc_type) {
        case "doc":
            uri = `https://docs.googleapis.com/v1/documents/${mod_data.ban_doc_id}?key=${credentials.get_google_key()}`;
            parse_func = get_doc_lines;
            break;
        case "sheet":
            uri = `https://sheets.googleapis.com/v4/spreadsheets/${mod_data.ban_doc_id}?key=${credentials.get_google_key()}&ranges=A2:A&includeGridData=true`;
            parse_func = get_sheet_lines;
            break;
        default:
            throw(`Unrecognized doc type ${mod_data.ban_doc_type}`);
    }

    credentials.get_google_access_token()
        .then((access_token) => {
            axios({
                url: uri,
                method: 'get',
                headers: {
                    'Authorization': `Bearer ${access_token}`
                }
            })
            .then((response) => {
                const ban_list = parse_func(response.data);
                apply_bans(chat_client, ban_list)
                    .then(() => {
                        logger.log("Ban wave completed");
                    }).catch((err) => {
                        logger.error(err);
                    });
            })
            .catch((err) => {
                logger.error(err);
            });
        })
        .catch((err) => {
            logger.error(err);
        });
}