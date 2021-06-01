const fs = require('fs');
const logger = require('./fletlog.js');
const path_resolve = require('path').resolve;

const sip_file = './data/sips.json';
const so_file = './data/so.json';
const cmd_access_file = './data/cmd_access.json';
const cmd_cd_file = './data/cmd_cooldown.json';

let sip_map;
let shoutout_map;
let access_map;
let cooldown_map;

module.exports = {
    init: (commands) => {
        sip_map = load_map(sip_file, 'sip');
        shoutout_map = load_map(so_file, 'shoutout');
        access_map = load_map(cmd_access_file, 'command access');
        cooldown_map = load_map(cmd_cd_file, 'command cooldown');
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
     */
    backup: () => {
        fs.writeFile(sip_file, JSON.stringify(sip_map), () => logger.log(`Sip counts saved to ${path_resolve(sip_file)}`));
        fs.writeFile(so_file, JSON.stringify(shoutout_map), () => logger.log(`Shoutout settings saved to ${path_resolve(so_file)}`));
        fs.writeFile(cmd_access_file, JSON.stringify(access_map), () => logger.log(`Command access settings saved to ${path_resolve(cmd_access_file)}`));
        fs.writeFile(cmd_cd_file, JSON.stringify(cooldown_map), () => logger.log(`Command cooldown settings saved to ${path_resolve(cmd_cd_file)}`));
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
                profiles: { [active_profile]: 1 }
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
        const active_profile = sip_map[channel_name].active_profile;
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
    }
};

function load_map(file_path, map_name = "") {
    if(fs.existsSync(file_path)) {
        logger.log(`Loading ${map_name} file from ${path_resolve(file_path)}`);
        return JSON.parse(fs.readFileSync(file_path));
    } else {
        logger.log(`No file found at ${path_resolve(file_path)}`);
        return {};
    }
}

function backup_loop(interval = 3600000) {
    setInterval(module.exports.backup, interval);
}
