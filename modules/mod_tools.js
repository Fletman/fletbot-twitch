"use strict";

const { Worker } = require('worker_threads');
const bot_data = require('./data.js');
const logger = require('./fletlog.js');
const Fletalytics = require('./fletalytics');

const mod_data_file = './resources/mod_data.json';
const one_minute_ms = 60000;
const one_hour_ms = one_minute_ms * 60;

const user_cache = {};

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
     * @returns {Promise<Object>} Whether account's age meets channel's minimum age threshold
     */
    verify_account_age: async (channel_name, username, flet_lib) => {
        const age_threshold = bot_data.get_accountage_threshold(channel_name);
        if(age_threshold.threshold_hours == 0 || username == channel_name.substring(1)) {
            return {
                valid: true,
                check_required: false
            }
        }
        const user_data = user_cache.hasOwnProperty(username) ? user_cache[username] : await flet_lib.get_user(username);
        user_cache[username] = { created_at: user_data.created_at };
        const user_create_date = new Date(user_data.created_at).getTime();
        const current_date = new Date(Date.now()).getTime();
        const date_diff_hrs = Math.floor((current_date - user_create_date) / one_hour_ms);
        return {
            valid: date_diff_hrs >= age_threshold.threshold_hours,
            account_age: date_diff_hrs,
            required_age: age_threshold.threshold_hours,
            check_required: true,
            mod_action: age_threshold.mod_action
        };
    },

    /**
     * If protection is active in a channel, check an account's age and ban/timeout the user if they fail to meet channel's age threshold
     * @param {Object} chat_client tmi.js chat client
     * @param {string} channel_name 
     * @param {string} username 
     * @param {Fletalytics} flet_lib 
     * @returns {Promise<boolean>} Whether account is allowed to chat in channel
     */
    moderate_account_age: async (chat_client, channel_name, username, flet_lib) => {
        if(module.exports.protection_active(channel_name)) {
            const verification = await module.exports.verify_account_age(channel_name, username, flet_lib);
            if(verification.valid) {
                /*
                if(verification.check_required) {
                    logger.log(`User ${username} has been verified for ${channel_name}: Account age is ${verification.account_age} hours old, required age is ${verification.required_age} hours`);
                }
                */
                return true;
            } else {
                let mod_cmd;
                const reason = `Account age of ${username} (${verification.account_age} hours) failed to meet channel's requirement of at least ${verification.required_age} hours`;
                switch (verification.mod_action) {
                    case "timeout":
                        mod_cmd = chat_client.timeout(channel_name, username, Math.min((verification.required_age - verification.account_age) * 3600, 604800), reason);
                        break;
                    case "ban":
                        mod_cmd = chat_client.ban(channel_name, username, reason);
                        break;
                    default:
                        throw (`Unknown mod action ${verification.mod_action}`);
                }
                logger.log(reason);
                logger.log(await mod_cmd);
                return false;
            }
        } else {
            return true;
        }
    }
}

function delay(t) {
    return new Promise(resolve => setTimeout(resolve, t));
}

async function apply_bans(chat_client, full_ban_list, chat_cmd, delay_ms = 500) {
    for(const ban_name of full_ban_list) {
        const cached_channels = bot_data.get_ban_cache(ban_name);
        for(const channel_name of chat_client.getChannels()) {
            if(!bot_data.is_bot_protected_channel(channel_name) || cached_channels.includes(channel_name)) {
                continue;
            }
            await delay(delay_ms);
            try {
                await chat_client.say(channel_name, `${chat_cmd} ${ban_name}`);
                bot_data.update_ban_cache(channel_name, ban_name);
            } catch (e) {
                logger.error(e);
            }
        }

    }
}

/**
 * Pull list of banned usernames from Google Docs/Sheets, apply bans across relevant channels
 * @param {Object} chat_client tmi.js chat client
 */
function ban_wave(chat_client) {
    logger.log("Starting ban wave");

    const worker = new Worker('./workers/fetch_ban_list.js');
    const fetch_promise = new Promise((resolve, reject) => {
        worker.on('message', (message) => {
            worker.terminate();
            resolve(message);
        });
        worker.on('error', (err) => {
            worker.terminate();
            reject(err);
        });
        worker.on('exit', (exit_code) => {
            if(exit_code != 0) {
                reject(`Worker exited with code ${exit_code}`);
            }
        });
    });

    fetch_promise.then((ban_lists) => {
        apply_bans(chat_client, ban_lists.user_ban_list, "/ban")
            .then(() => {
                logger.log("User ban wave completed");
            }).catch((err) => {
                logger.error(err);
            });
    }).catch((err) => {
        logger.error(err);
    });

    worker.postMessage({
        mod_data_file
    });
}
