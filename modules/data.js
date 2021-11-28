const fs = require('fs');
const logger = require('./fletlog.js');
const path_resolve = require('path').resolve;

const datasources = {
    'sip': {
        'file': "./data/sips.json",
        'postgres': "sip"
    },
    'shoutout': {
        'file': "./data/so.json",
        'postgres': "shoutout"
    },
    'command access': {
        'file': "./data/cmd_access.json",
        'postgres': "cmd_access"
    },
    'command cooldown': {
        'file': "./data/cmd_cooldown.json",
        'postgres': "cmd_cooldown"
    },
    'ban cache': {
        'file': "./data/ban_cache.json",
        'postgres': "ban_cache"
    }
};

let sip_map;
let shoutout_map;
let access_map;
let cooldown_map;
let ban_cache_map;

let datasource;
let db_client;

module.exports = {
    /**
     * 
     * @param {Object} commands Map of Fletbot commands 
     * @param {string} data_source Flag denoting what datasource to store bot data to
     * @param {Object} db Database client
     * @param {Number?} data_version Version of data to load. Defaults to latest version when omitted (only used with postgres datasource)
     */
    init: async (commands, data_source, db, data_version = null) => {
        datasource = data_source;
        db_client = db;
        sip_map = await load_map('sip', data_version);
        shoutout_map = await load_map('shoutout', data_version);
        access_map = await load_map('command access', data_version);
        cooldown_map = await load_map('command cooldown', data_version);
        ban_cache_map = await load_map('ban cache', data_version);

        Object.entries(commands).forEach((entry) => {
            const cmd_name = entry[0];
            if(!(cmd_name in access_map)) {
                access_map[cmd_name] = { default: entry[1].default_access }
            }
        });
        backup_loop(1000 * 60 * 60 * 12); // auto backup every 12hrs
    },

    /**
     * Backup maps to file
     * @param {string?} ds optional flag to force backing up data to specified data source
     */
    backup: (ds = null) => {
        let data_output;
        if(ds && ['file', 'postgres'].includes(ds)) {
            data_output = ds;
        } else {
            data_output = datasource;
        }
        switch(data_output) {
            case 'file':
                const files = [
                    {
                        file: datasources['sip']['file'],
                        data_map: sip_map,
                        desc: 'Sip counts'
                    },
                    {
                        file: datasources['shoutout']['file'],
                        data_map: shoutout_map,
                        desc: 'Shoutout settings'
                    },
                    {
                        file: datasources['command access']['file'],
                        data_map: access_map,
                        desc: 'Command access settings'
                    },
                    {
                        file: datasources['command cooldown']['file'],
                        data_map: cooldown_map,
                        desc: 'Command cooldown settings'
                    },
                    {
                        file: datasources['ban cache']['file'],
                        data_map: ban_cache_map,
                        desc: 'Ban cache'
                    }
                ];
                for(const f of files) {
                    fs.writeFile(f.file, JSON.stringify(f.data_map), () => logger.log(`${f.desc} saved to ${path_resolve(f.file)}`));
                }
                break;
            case 'postgres':
                const maps = {
                    'sip': sip_map,
                    'shoutout': shoutout_map,
                    'command access': access_map,
                    'command cooldown': cooldown_map,
                    'ban cache': ban_cache_map
                };
                for(const m in maps) {
                    write_to_db(m, maps[m])
                        .then((new_version) => {
                            logger.log(`${m} data backed up to database, latest version: ${new_version}`);
                        }).catch((err) => {
                            logger.error(err);
                        });
                }
                break;
            default:
                logger.error(`Unknown datasource ${datasource}. Dumping contents to file.`);
                fs.writeFileSync('./sip_dump.json', JSON.stringify(sip_map));
                fs.writeFileSync('./shoutout_dump.json', JSON.stringify(shoutout_map));
                fs.writeFileSync('./access_dump.json', JSON.stringify(access_map));
                fs.writeFileSync('./cooldown_dump.json', JSON.stringify(cooldown_map));
                fs.writeFileSync('./ban_dump.json', JSON.stringify(ban_cache_map));
                throw(`Unable to backup data using datasource ${datasource}. Data has been dumped to temp files`);
        }
    },

    /**
     * Set active sip profile in specified channel to a given profile. If profile does not exist, it is created then set active
     * @param {String} channel_name Channel name
     * @param {String} profile Profile name
     * @returns {Number} Total number of profiles saved under channel, or -1 if new profile could not be created
     */
    set_active_sip_profile: (channel_name, profile) => {
        let profile_count;
        if(!sip_map[channel_name]) {
            sip_map[channel_name] = {
                active_profile: profile,
                profiles: {
                    'default': 0,
                    [profile]: 0
                }
            };
            profile_count = Object.keys(sip_map[channel_name].profiles).length;
        } else if(!sip_map[channel_name].profiles[profile]) {
            if(Object.keys(sip_map[channel_name].profiles).length < 10) {
                sip_map[channel_name].active_profile = profile;
                sip_map[channel_name].profiles[profile] = 0;
                profile_count = Object.keys(sip_map[channel_name].profiles).length;
            } else {
                profile_count = -1;
            }
        } else {
            sip_map[channel_name].active_profile = profile;
            profile_count = Object.keys(sip_map[channel_name].profiles).length;
        }
        return profile_count;
    },

    /**
     * List all sip profiles and the active profile for a specified channel
     * @param {String} channel_name name of channel
     * @returns {Object} Channel's active profile and list of all profiles
     */
    list_sip_profiles: (channel_name) => {
        if(!sip_map[channel_name]) {
            sip_map[channel_name] = {
                active_profile: 'default',
                profiles: { 'default': 0 }
            };
        }
        return {
            active_profile: sip_map[channel_name].active_profile,
            profiles: Object.keys(sip_map[channel_name].profiles)
        };
    },

    /**
     * Delete a profile from a given channel. Idempotent operation, will take no action if profile did not already exist
     * @param {String} channel_name Channel name
     * @param {*} profile Profile name
     */
    remove_sip_profile: (channel_name, profile) => {
        if(!sip_map[channel_name]) {
            // nothing to do here
            return;
        }
        delete sip_map[channel_name].profiles[profile];
        if(sip_map[channel_name].active_profile === profile) {
            sip_map[channel_name].active_profile = 'default';
        }
    },

    /**
     * Incremenet channel's sip counter
     * @param {string} channel_name Name of channel
     * @returns {Number} Updated sip count
     */
    add_sip: (channel_name) => {
        let active_profile;
        if(!sip_map[channel_name]) {
            active_profile = 'default';
            sip_map[channel_name] = {
                active_profile: active_profile,
                profiles: {
                    [active_profile]: 1
                }
            }
        } else {
            active_profile = sip_map[channel_name].active_profile;
            sip_map[channel_name].profiles[active_profile]++;
        }
        return sip_map[channel_name].profiles[active_profile];
    },

    /**
     * Update channel's sip count to specified number
     * @param {string} channel_name Name of channel
     * @param {Number} sip_count Number to update counter to
     * @returns {Number} Updated sip count
     */
    set_sips: (channel_name, sip_count) => {
        let active_profile;
        if(sip_map[channel_name]) {
            active_profile = sip_map[channel_name].active_profile;
        } else {
            active_profile = 'default';
            sip_map[channel_name] = {
                active_profile: active_profile,
                profiles: {
                    [active_profile]: 0
                }
            }
        }
        sip_map[channel_name].profiles[active_profile] = sip_count;
        return sip_map[channel_name].profiles[active_profile];
    },

    /**
     * Get sip count for a given channel
     * @param {string} channel_name Name of channel
     * @returns {Number} Updated sip count
     */
    get_sips: (channel_name) => {
        return sip_map[channel_name] ? sip_map[channel_name].profiles[sip_map[channel_name].active_profile] : null;
    },

    /**
     * Control automatic shoutout on raid for specified channel
     * @param {string} channel_name Channel name
     * @param {boolean} active Whether auto shoutout is active
     * @param {boolean} [fso=false] Whether to use channel shoutout or builtin shoutout
     * 
     */
    set_auto_shoutout: (channel_name, active, fso = false) => {
        if(active) {
            shoutout_map[channel_name] = { fso: fso };
        } else {
            delete shoutout_map[channel_name];
        }
        logger.log(`Shoutout update for ${channel_name}`, shoutout_map);
    },

    /**
     * Check whether automatic shoutout is active on a specific channel
     * @param {string} channel_name Channel name
     * @returns {Object} Shoutout setting for channel
     */
    get_auto_shoutout: (channel_name) => {
        return shoutout_map[channel_name];
    },

    /**
     * Update access settings for a given command in a channel
     * @param {string} channel_name Channel name
     * @param {string} command Command name
     * @param {string[]} roles List of access roles for command
     * @returns {string[]} List of access roles for command
     */
    set_command_access: (channel_name, command, roles) => {
        switch (roles[0]) {
            case 'all':
                access_map[command][channel_name] = [];
                return {
                    type: 'custom',
                        roles: []
                };
            case 'default':
                delete access_map[command][channel_name];
                return {
                    type: 'default',
                        roles: access_map[command].default
                };
            default:
                access_map[command][channel_name] = roles;
                return {
                    type: 'custom',
                        roles: access_map[command][channel_name]
                };
        }
    },

    /**
     * Get access settings for specified command
     * @param {string} command Command name
     */
    get_command_access: (command) => {
        return access_map[command];
    },

    /**
     * Add username to list of banned Fletbot users
     * @param {string} banned_username Name of user to ban
     */
    ban_user: (banned_username) => {
        if(!access_map.ban_list) {
            access_map.ban_list = [banned_username]
        } else if(!access_map.ban_list.includes(banned_username)) {
            access_map.ban_list.push(banned_username);
        }
    },

    /**
     * Remove username from list of banned Fletbot users
     * @param {string} unbanned_username 
     */
    unban_user(unbanned_username) {
        if(access_map.ban_list) {
            access_map.ban_list = access_map.ban_list.filter(username => username !== unbanned_username)
        }
    },

    /**
     * Get list of users banned from using Fletbot commands
     * @returns {string[]} List of banned users
     */
    get_ban_list: () => {
        return access_map.ban_list ? access_map.ban_list : []
    },

    /**
     * Set cooldown period for specified command in a channel
     * @param {string} channel_name Channel name
     * @param {string} command Command name
     * @param {Number} cd_sec Intever value for cooldown time (in seconds)
     */
    set_command_cooldown: (channel_name, command, cd_sec) => {
        if(cd_sec === 0) {
            delete cooldown_map[channel_name][command];
        } else {
            if(!cooldown_map[channel_name]) {
                cooldown_map[channel_name] = {};
            }
            cooldown_map[channel_name][command] = cd_sec;
        }
    },

    /**
     * Get cooldown time for a specified command in a channel
     * @param {string} channel_name Channel name
     * @param {string} command Command name
     * @returns {Number} Cooldown time, returns 0 if command has no cooldown
     */
    get_command_cooldown: (channel_name, command) => {
        const cmd_id = (command.startsWith('!') ? command.slice(1) : command);
        if(cooldown_map[channel_name] && cooldown_map[channel_name][cmd_id] !== undefined) {
            return cooldown_map[channel_name][cmd_id];
        } else {
            return 0;
        }
    },

    /**
     * Add channel to list of bot protected channels
     * @param {string} channel_name Channel name
     */
    add_bot_protected_channel: (channel_name) => {
        if(ban_cache_map.channels) {
            ban_cache_map.channels = [...new Set(ban_cache_map.channels).add(channel_name)];
        } else {
            ban_cache_map.channels = [channel_name];
        }
    },

    /**
     * @returns {string[]} List of channels where bot protection is active
     */
    get_bot_protected_channels: () => {
        return ban_cache_map.channels || [];
    },

    /**
     * Remove given channel from list of bot protected channels
     * @param {string} channel_name Channel name
     */
    remove_bot_protected_channel: (channel_name) => {
        if(ban_cache_map.channels) {
            ban_cache_map.channels = ban_cache_map.channels.filter((active_channel) => active_channel != channel_name);
        }
        delete ban_cache_map[channel_name];
    },

    /**
     * Return whether a given channel has bot protection enabled
     * @param {string} channel_name Channel name
     * @returns {boolean}
     */
    is_bot_protected_channel: (channel_name) => {
        return ban_cache_map.channels && ban_cache_map.channels.includes(channel_name);
    },

    /**
     * @param {string} ban_name Name of cached banned user
     * @returns {Array<string>} list of channels that have previously banned user
     */
    get_ban_cache: (ban_name) => {
        return (ban_cache_map.banned_users && ban_cache_map.banned_users.hasOwnProperty(ban_name)) ?
            ban_cache_map.banned_users[ban_name] : [];
    },

    /**
     * Update the list of channels that have previously banned an account
     * @param {string} channel_name
     * @param {string} ban_name
     */
    update_ban_cache: (channel_name, ban_name) => {
        if(!ban_cache_map.banned_users) {
            ban_cache_map.banned_users = {
                [ban_name]: [channel_name]
            };
        } else if(!ban_cache_map.banned_users.hasOwnProperty(ban_name)) {
            ban_cache_map.banned_users[ban_name] = [channel_name];
        } else {
            ban_cache_map.banned_users[ban_name].push(channel_name);
        }
    },

    /**
     * Set the minimum hours required for an account's age to be able to chat in a channel
     * @param {string} channel_name Name of channel to set threshold for
     * @param {Number} threshold_hours Minimum number of hours
     * @param {string} mod_action Flag signifying action to take when an account fails to meet age threshold
     * @returns {Object} new threshould settings containing account age and mod action
     */
    set_accountage_threshold: (channel_name, threshold_hours, mod_action) => {
        if(ban_cache_map.age_thresholds) {
            ban_cache_map.age_thresholds[channel_name] = {
                threshold_hours,
                mod_action
            };
        } else {
            ban_cache_map.age_thresholds = {
                [channel_name]: {
                    threshold_hours,
                    mod_action
                }
            };
        }
        return ban_cache_map.age_thresholds[channel_name];
    },

    /**
     * 
     * @param {string} channel_name Name of channel to check threshold for
     * @param {Number?} default_threshold_hrs Default threshold to return if no threshold has been defined
     * @returns {Number} Age threshold for channel
     */
    get_accountage_threshold: (channel_name, default_threshold_hrs = 0) => {
        if(!ban_cache_map.age_thresholds || !ban_cache_map.age_thresholds[channel_name]) {
            return {
                threshold_hours: default_threshold_hrs,
                mod_action: "timeout"
            };
        } else {
            return ban_cache_map.age_thresholds[channel_name];
        }
    }
};

/**
 * 
 * @param {string} data_name Name of data field to load
 * @param {Number?} data_version Version of data to load (only used when datasource is set to postgres)
 * @returns {Promise<Object>} Map of data
 */
async function load_map(data_name, data_version) {
    switch(datasource) {
        case 'file':
            const file_path = datasources[data_name][datasource];
            if(fs.existsSync(file_path)) {
                logger.log(`Loading ${data_name} file from ${path_resolve(file_path)}`);
                return JSON.parse(fs.readFileSync(file_path));
            } else {
                logger.log(`No file found at ${path_resolve(file_path)}`);
                return {};
            }
        case 'postgres':
            return await load_from_db(datasources[data_name][datasource], data_version);
        default:
            throw(`Unknown datasource ${datasource}`);
    }

}


async function load_from_db(data_name, version) {
    let query;
    let args;

    if(version) {
        // get specific version of data
        query = `SELECT data_version, json_data
                 FROM fletbot.data_store
                 WHERE data_name = $1::text AND data_version = $2::integer`;
        args = [data_name, version];
    } else {
        // get latest version of data
        query = `SELECT data_version, json_data
                 FROM fletbot.data_store
                 WHERE data_name = $1::text
                 ORDER BY data_version DESC
                 LIMIT 1`;
        args = [data_name];
    }

    const result = await db_client.query(query, args);
    if(result.rows[0] && result.rows[0].json_data) {
        logger.log(`Loaded ${data_name} data from database, using version ${result.rows[0].data_version}`);
        return result.rows[0].json_data;
    } else {
        logger.log(`No data found in database for ${data_name}, using empty map`);
        return {};
    }
}

async function write_to_db(field_name, data_map) {
    // insert new latest version to table
    const data_name = datasources[field_name]['postgres'];
    let query = `
        WITH prev_data AS (
            SELECT data_version
            FROM fletbot.data_store
            WHERE data_name = $1::text
            ORDER BY data_version DESC
            LIMIT 1
        )
        INSERT INTO fletbot.data_store (data_name, json_data, data_version)
        SELECT $1::text,
               $2::json,
               CASE WHEN EXISTS (
                   SELECT * FROM prev_data
               ) THEN (SELECT data_version + 1 FROM prev_data)
                 ELSE 1
               END
        RETURNING data_version`;
    let args = [data_name, data_map];
    const result = await db_client.query(query, args);
    const new_version = result.rows[0].data_version;

    // delete versions more than 5 behind latest
    query = `DELETE FROM fletbot.data_store
             WHERE data_name = $1::text
                AND data_version NOT IN (
                    SELECT data_version
                    FROM fletbot.data_store
                    WHERE data_name = $1::text
                    ORDER BY data_version DESC
                    LIMIT 5
                )`;
    args = [data_name];
    await db_client.query(query, args);

    return new_version;
}

function backup_loop(interval_ms = 3600000) {
    setInterval(module.exports.backup, interval_ms);
}
