"use strict";

const axios = require('axios');
const fs = require('fs');
const path_resolve = require('path').resolve;
const bot_data = require('./data.js');
const credentials = require('./credentials.js');
const logger = require('./fletlog.js');
const Fletalytics = require('./fletalytics');

const mod_data_file = './resources/mod_data.json';
const one_minute_ms = 60000;
const one_hour_ms = one_minute_ms * 60;

module.exports = {

    protection_active: bot_data.is_bot_protected_channel,

    /**
     * Start a job to periodically fetch a list of accounts to ban
     * @param {Object} chat_client tmi.js chat client
     * @param {Number?} loop_period time in ms between ban waves
     */
    start_ban_loop: (chat_client, loop_period = (one_hour_ms * 6)) => {
        setInterval(() => ban_wave(chat_client), loop_period);
    },

    /**
     * Pull list of banned usernames from Google Docs/Sheets, apply bans across relevant channels
     * @param {Object} chat_client tmi.js chat client
     */
    manual_ban_wave: ban_wave,

    /**
     * Determine if a given user's account is old enough to meet a channel's minimum account age threshold
     * @param {string} channel_name Name of channel in which user's age is verified
     * @param {string} username Name of user to verify account age
     * @param {Fletalytics} flet_lib Class containing API interatctions
     * @returns {Promise<boolean>} Whether account's age meets channel's minimum age threshold
     */
    verify_account_age: async (channel_name, username, flet_lib) => {
        const age_threshold = bot_data.get_accountage_threshold(channel_name);
        if(age_threshold == 0) {
            return {
                valid: true,
                check_required: false
            }
        }
        const user_data = await flet_lib.get_user(username);
        const user_create_date = new Date(user_data.created_at).getTime();
        const current_date = new Date(Date.now()).getTime();
        const date_diff_hrs = Math.floor((current_date - user_create_date) / one_hour_ms);
        return {
            valid: date_diff_hrs >= age_threshold,
            account_age: date_diff_hrs,
            required_age: age_threshold,
            check_required: true
        };
    }
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
    return doc_lines;
}

/**
 * 
 * @param {Object} g_sheet Google Spreadsheet objects
 * @returns {Array<string>} list of strings from sheet cells
 */
function get_sheet_lines(g_sheet) {
    const cell_list = [];
    const sheet = g_sheet.sheets[0];
    const rows = sheet.data[0].rowData;
    for(const row of rows) {
        if(row.values && row.values[0] && row.values[0].effectiveValue) {
            cell_list.push(row.values[0].effectiveValue.stringValue);
        }
    }
    return cell_list;
}

async function apply_bans(chat_client, full_ban_list, chat_cmd, delay_ms = 500) {
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
                await chat_client.say(channel_name, `${chat_cmd} ${ban_name}`);
            } catch (e) {
                logger.error(e);
            }
        }
        bot_data.update_ban_cache(channel_name, to_ban_list);
    }
}

async function fetch_doc(access_token, doc_data) {
    let uri;
    let parse_func;
    switch (doc_data.ban_doc_type) {
        case "doc":
            uri = `https://docs.googleapis.com/v1/documents/${doc_data.ban_doc_id}?key=${credentials.get_google_key()}`;
            parse_func = get_doc_lines;
            break;
        case "sheet":
            uri = `https://sheets.googleapis.com/v4/spreadsheets/${doc_data.ban_doc_id}?key=${credentials.get_google_key()}&ranges=${doc_data.data_range}&includeGridData=true`;
            parse_func = get_sheet_lines;
            break;
        default:
            throw (`Unrecognized doc type ${doc_data.ban_doc_type}`);
    }
    const response = await axios({
        url: uri,
        method: 'get',
        headers: {
            'Authorization': `Bearer ${access_token}`
        }
    });
    return parse_func(response.data);
}

/**
 * Pull list of banned usernames from Google Docs/Sheets, apply bans across relevant channels
 * @param {Object} chat_client tmi.js chat client
 */
function ban_wave(chat_client) {
    logger.log("Starting ban wave");

    fs.readFile(mod_data_file, 'utf8', (error, str_data) => {
        if(error) {
            logger.error(error);
            throw (error);
        }
        const mod_data = JSON.parse(str_data);
        credentials.get_google_access_token()
            .then((access_token) => {
                const user_doc_requests = mod_data.user_ban_docs.map((doc_data) => fetch_doc(access_token, doc_data));
                // TODO: once API for banning terms is exposed, update this to include blocking terms as part of ban wave
                Promise.all(user_doc_requests)
                    .then((doc_lines) => {
                        const ban_list = Array.from(new Set(doc_lines.flat()));
                        apply_bans(chat_client, ban_list, "/ban")
                            .then(() => {
                                logger.log("User ban wave completed");
                            }).catch((err) => {
                                logger.error(err);
                            });
                    }).catch((err) => {
                        logger.error(err);
                    });
            }).catch((err) => {
                logger.error(err);
            });
    });
}
