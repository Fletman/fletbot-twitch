const fs = require('fs');
const bot_data = require('./data.js');
const credentials = require('./credentials.js');
const logger = require('./fletlog.js');
const pyramids = require('./pyramids.js');

let chat_meta = {};
let fletalytics = {};
let active_cooldowns = {};

module.exports = {
    init: (chat_data, flet_lib) => {
        chat_meta = chat_data;
        fletalytics = flet_lib;
        validate_commands();
    },

    check_cmd_access: (channel_name, context, command) => {
        const cmd_id = (command.startsWith('!') ? command.slice(1) : command);
        const cmd_access = bot_data.get_command_access(cmd_id);
        const access_roles = (cmd_access[channel_name] ? cmd_access[channel_name] : cmd_access.default);
        const can_access = access_roles.length === 0 ||
            chat_meta.bot_owners.includes(context.username) ||
            credentials.is_broadcaster(context) ||
            access_roles.some((role) => {
                let access_allowed = false;
                switch (role) {
                    case "moderator":
                        access_allowed = credentials.is_moderator(context);
                        break;
                    case "vip":
                        access_allowed = credentials.is_vip(context);
                        break;
                    case "subscriber":
                        access_allowed = credentials.is_subscriber(context);
                        break;
                    default:
                        break;
                }
                return access_allowed;
            });
        return {
            allowed: can_access,
            roles: access_roles
        }
    },

    check_cmd_cooldown: (channel_name, command) => {
        const cooldown_len = bot_data.get_command_cooldown(channel_name, command);
        if(!cooldown_len) {
            return { available: true };
        } else if(active_cooldowns[channel_name] &&
            active_cooldowns[channel_name][command] &&
            active_cooldowns[channel_name][command].active) {
            return {
                available: false,
                time_remaining_sec: Math.ceil(cooldown_len - (Date.now() - active_cooldowns[channel_name][command].cooldown_start) / 1000)
            };
        } else {
            const cmd_cooldown = {
                cooldown_start: Date.now(),
                active: true,
                cooldown_fn: setTimeout(() => { active_cooldowns[channel_name][command].active = false; }, cooldown_len * 1000)
            };
            if(!active_cooldowns[channel_name]) {
                active_cooldowns[channel_name] = {};
            }
            active_cooldowns[channel_name][command] = cmd_cooldown;
            return { available: true };
        }
    },
    chat: {
        "!flethelp": async (client, channel_name, context, msg_parts) => {
            if(!msg_parts[1]) {
                const cmd_list = Object.keys(chat_meta.commands).map((cmd) => "!" + cmd).join(" ");
                return {
                    data: await client.say(
                        channel_name,
                        `@${context.username} Available commands: ${cmd_list} | Use !flethelp <command> for details on each command`
                        ),
                    success: true   
                }
            } else {
                const cmd_id = (msg_parts[1].startsWith('!') ? msg_parts[1].slice(1) : msg_parts[1]);
                let success;
                let help_response;
                if(cmd_id in chat_meta.commands) {
                    help_response = chat_meta.commands[cmd_id].description;
                    success = true;
                } else {
                    help_response = `Unknown command "${cmd_id}". Use !flethelp to list available commands`;
                    success = false;
                }
                return {
                    data: await client.say(channel_name, `@${context.username} ${help_response}`),
                    success: success
                };
            }
        },

        "!fletsetroles": async (client, channel_name, context, msg_parts) => {
            let role_msg;
            let success;
            if(msg_parts.length < 3) {
                role_msg = "Invalid arguments provided. Type \"!flethelp !fletsetroles\" for command usage";
                success = false;
            } else {
                const valid_lvls = ['broadcaster', 'moderator', 'vip', 'subscriber', 'all', 'default'];
                const cmd_id = (msg_parts[1].startsWith('!') ? msg_parts[1].slice(1) : msg_parts[1]);
                const levels = msg_parts.slice(2);
                if(!chat_meta.commands.hasOwnProperty(cmd_id)) {
                    role_msg = `Unknown command ${msg_parts[1]}`;
                    success = false;
                } else if((levels.includes('all') || levels.includes('default')) && levels.length > 1) {
                    role_msg = "Access levels \"all\" or \"default\" cannot be provided alongside other levels";
                    success = false;
                } else if(unknown_lvl = levels.find((lvl) => !valid_lvls.includes(lvl))) {
                    role_msg = `Invalid access level "${unknown_lvl}". Valid levels are ${valid_lvls.join(", ")}`;
                    success = false;
                } else {
                    const new_access = bot_data.set_command_access(channel_name, cmd_id, levels);
                    role_msg = `${new_access.type} access for !${cmd_id}: ${new_access.roles.length === 0 ? "no restrictions" : new_access.roles.join(', ')}`;
                    success = true;
                }
                return {
                    data: await client.say(channel_name, `@${context.username} ${role_msg}`),
                    success: success
                };
            }
        },

        "!fletgetroles": async (client, channel_name, context, msg_parts) => {
            if(!msg_parts[1]) {
                return {
                    data: await client.say(channel_name, `@${context.username} No command name provided`),
                    success: false
                };
            } else {
                let success;
                const cmd_id = (msg_parts[1].startsWith('!') ? msg_parts[1].slice(1) : msg_parts[1]);
                const cmd_access = bot_data.get_command_access(cmd_id);
                let access_msg = "";
                if(!cmd_access) {
                    access_msg = `Unknown command ${msg_parts[1]}`;
                    success = false;
                } else if(!(channel_name in cmd_access)) {
                    access_msg = `Default access for ${msg_parts[1]}: ${cmd_access.default.length == 0 ? "no restrictions" : cmd_access.default.join(", ")}`;
                    success = true;
                } else {
                    access_msg = `Custom access for ${msg_parts[1]}: ${cmd_access[channel_name].length == 0 ? "no restrictions" : cmd_access[channel_name].join(", ")}`;
                    success = true;
                }
                return {
                    data: await client.say(channel_name, `@${context.username} ${access_msg}`),
                    success: success
                };
            }
        },

        "!fcooldown": async (client, channel_name, context, msg_parts) => {
            let cooldown_msg;
            let success;
            if(!msg_parts[1]) {
                cooldown_msg = `@${context.username} No command name provided`;
                success = false;
            } else {
                const cmd_id = (msg_parts[1].startsWith('!') ? msg_parts[1].slice(1) : msg_parts[1]);
                const cmd_name = '!' + cmd_id;
                if(!module.exports.chat.hasOwnProperty(cmd_name)) {
                    cooldown_msg = `@${context.username} Unknown command ${cmd_name}`;
                    success = false;
                } else if(msg_parts[2]) {
                    const cooldown_sec = parseInt(msg_parts[2], 10);
                    if(Number.isNaN(cooldown_sec) || cooldown_sec < 0 || cooldown_sec % 1 != 0) {
                        cooldown_msg = `@${context.username} Invalid number provided`;
                        success = false;
                    } else {
                        bot_data.set_command_cooldown(channel_name, cmd_id, cooldown_sec);
                        if(active_cooldowns[channel_name] && active_cooldowns[channel_name][cmd_name] && active_cooldowns[channel_name][cmd_name].active) {
                            clearTimeout(active_cooldowns[channel_name][cmd_name].cooldown_fn);
                            const time_diff = Math.ceil((Date.now() - active_cooldowns[channel_name][cmd_name].cooldown_start) / 1000);
                            if(time_diff < cooldown_sec) {
                                active_cooldowns[channel_name][cmd_name].cooldown_fn = setTimeout(() => { active_cooldowns[channel_name][cmd_name].active = false; }, (cooldown_sec - time_diff) * 1000)
                            } else {
                                active_cooldowns[channel_name][cmd_name].active = false;
                            }
                        }
                        cooldown_msg = `@${context.username} ${cmd_name} cooldown set to ${cooldown_sec} seconds`;
                        success = true;
                    }
                } else {
                    const cooldown_sec = bot_data.get_command_cooldown(channel_name, cmd_id);
                    cooldown_msg = `@${context.username} Cooldown for !${cmd_id} is set to ${cooldown_sec} seconds`;
                    success = true;
                }
            }
            return {
                data: await client.say(channel_name, cooldown_msg),
                success: success
            };
        },

        "!fletbot": async (client, channel_name, context) => {
            logger.log(`Received ping command in channel ${channel_name}`);
            const username = context.username.toLowerCase();
            let greeting = (chat_meta.custom_greetings[username] ? chat_meta.custom_greetings[username] : "👀");
            if(typeof greeting !== "string") {
                greeting = greeting[Math.floor(Math.random() * greeting.length)];
            }
            return {
                data: await client.say(channel_name, `@${context.username} ${greeting}`),
                success: true
            };
        },

        "!fletpet": async (client, channel_name, context) => {
            return {
                data: await client.say(channel_name, `@${context.username} ${chat_meta.pet_pool[Math.floor(Math.random() * chat_meta.pet_pool.length)]}`),
                success: true
            };
        },

        "!fletinc": async (client, channel_name) => {
            logger.log(`Received Flet Inc. command in channel ${channel_name}`);
            return {
                data: await client.say(channel_name, chat_meta.ad_opts[Math.floor(Math.random() * chat_meta.ad_opts.length)]),
                success: true
            };
        },

        "!otd": async (client, channel_name) => {
            return {
                data: await client.action(channel_name, "Start your stream off right with some ItsBoshyTime Obligatory ItsBoshyTime Technical ItsBoshyTime Difficulties™, part of every pro streamer's balanced diet"),
                success: true
            };
        },

        "!fso": async (client, channel_name, context, msg_parts) => {
            if(!msg_parts[1]) {
                return {
                    data: await client.say(channel_name, `@${context.username} no username provided`),
                    success: false
                };
            } else {
                const so_msg = await fletalytics.shoutout(msg_parts[1]);
                return {
                    data: await client.say(channel_name, so_msg),
                    success: true
                };
            }
        },

        "!fletso": async (client, channel_name, context, msg_parts) => {
            let result_msg;
            let success;
            switch (msg_parts[1]) {
                case 'active':
                    const use_fso = (msg_parts[2] && msg_parts[2] === 'fso');
                    bot_data.set_auto_shoutout(channel_name, true, fso = use_fso);
                    result_msg = "Auto-SO now active";
                    if(use_fso) {
                        result_msg += " using Fletbot shoutout";
                    }
                    success = true;
                    break;
                case 'inactive':
                    bot_data.set_auto_shoutout(channel_name, false);
                    result_msg = "Auto-SO now inactive";
                    success = true;
                    break;
                default:
                    result_msg = "Invalid flag provided. Valid flags are <active | inactive>";
                    success = false;
                    break;
            }
            return {
                data: await client.say(channel_name, `@${context.username} ${result_msg}`),
                success: success
            };
        },

        "!sip": async (client, channel_name) => {
            const sips = bot_data.add_sip(channel_name);
            let sip_msg;
            switch (sips) {
                case 1:
                    sip_msg = "The first of many sips. Kappa";
                    break;
                case 69:
                    sip_msg = "69 sips. Nice. TPFufun";
                    break;
                default:
                    sip_msg = `${sips} sips... So far. TPFufun`;
                    break;
            }
            return {
                data: await client.action(channel_name, sip_msg),
                success: true
            };
        },

        "!setsips": async (client, channel_name, context, msg_parts) => {
            const sips = parseInt(msg_parts[1], 10);
            return (Number.isNaN(sips) || sips < 0) ?
                {
                    data: await client.say(channel_name, `@${context.username} Invalid number provided`),
                    success: false
                } :
                {
                    data: await client.say(channel_name, `@${context.username} Sip count set to ${bot_data.set_sips(channel_name, sips)}`),
                    success: true
                };
        },

        "!getsips": async (client, channel_name) => {
            const sips = bot_data.get_sips(channel_name);
            const sip_msg = sips ? `Current sip count: ${sips}` : "No sips on record, shockingly";
            return {
                data: await client.action(channel_name, sip_msg),
                success: true
            };
        },

        "!fletscrew": async (client, channel_name, context, msg_parts) => {
            // TODO: udpate this command to be structured in line with other commands
            pyramids.toggle_blocking(client, channel_name, context, msg_parts[1]);
            return {
                data: "pyramid blocking level updated",
                success: true
            }
        },

        "!fletalytics": async (client, channel_name) => {
            return {
                data: await client.action(channel_name, chat_meta.changelog),
                success: true
            };
        },

        "!fletpfp": async (client, channel_name, context, msg_parts) => {
            const result = await fletalytics.get_pfp(msg_parts[1]);
            const msg = (!result) ? `@${context.username} No profile picture could be found for streamer` : `@${context.username} ${result}`
            return {
                data: await client.say(channel_name, msg),
                success: !!msg_parts[1] && !!result
            };
        },

        "!fletmote": async (client, channel_name, context, msg_parts) => {
            if(msg_parts.length < 3) {
                return {
                    data: await client.say(channel_name, `@${context.username} Channel name and emote code must be provided`),
                    success: false
                };
            } else {
                const result = await fletalytics.get_emote(msg_parts[1], msg_parts[2]);
                const msg = (!result) ? `@${context.username} No emote could be found from given parameters` : `@${context.username} ${result}`;
                return {
                    data: await client.say(channel_name, msg),
                    success: !!result
                };
            }
        },

        "!fletpermit": async (client, channel_name, context) => {
            return {
                data: await client.say(
                    channel_name,
                    `@${context.username} Permission link: ${fletalytics.get_permit_link(channel_name.slice(1))} ` +
                    "Upon permission confirmation, you will be redirected to a dummy URL containing an access code. " +
                    "From the URL copy the value for access code (i.e. code=<code value>), " +
                    "then *WHISPER* it to Fletbot using !fletpermit <code value>"
                ),
                success: true
            };
        },

        "!fletunpermit": async (client, channel_name, context) => {
            await fletalytics.remove_permit(channel_name.slice(1));
            return {
                data: await client.say(channel_name, `@${context.username} fletalytics permissions removed`),
                success: true
            };
        },

        "!fletevents": async (client, channel_name, context, msg_parts) => {
            if(!msg_parts[1] && !["active", "inactive"].includes(msg_parts[1])) {
                return {
                    data: await client.say(channel_name, `@${context.username} Invalid argument`),
                    success: false
                };
            } else {
                const channel = channel_name.slice(1);
                if(msg_parts[1] == "active") {
                    const result =  await fletalytics.listen(channel);
                    return {
                        data: await client.say(channel_name, `@${context.username} ${result}`),
                        success: true
                    };
                } else if(msg_parts[1] == "inactive") {
                    const result = await fletalytics.unlisten(channel);
                    return {
                        data: await client.say(channel_name, `@${context.username} ${result}`),
                        success: true
                    };
                }
            }
        },

        "!fletyt": async (client, channel_name, context, msg_parts) => {
            if(msg_parts.length < 2) {
                return {
                    data: await client.say(channel_name, `@${context.username} No search criteria provided`),
                    success: false
                };
            } else {
                const yt_link = await fletalytics.get_yt_link(msg_parts.slice(1).join(" "));
                const yt = (yt_link ? yt_link : "Unable to find video for search criteria");
                return {
                    data: await client.say(channel_name, `@${context.username} ${yt.title}: ${yt.url}`),
                    success: true
                };
            }
        },

        "!fletclip": async (client, channel_name, context, msg_parts) => {
            if(msg_parts.length < 3) {
                return {
                    data: await client.say(channel_name, `@${context.username} Invalid search criteria provided`),
                    success: false
                };
            } else {
                try {
                    const clip = await fletalytics.get_clip_link(msg_parts[1], msg_parts.slice(2).join(" "));
                    const clip_response = (clip ?
                        (clip.match_percent ? `This clip has ${clip.match_percent}% title match: ${clip.url}` : clip.url) :
                        "Unable to find matching clip from provided criteria");
                    return {
                        data: await client.say(channel_name, `@${context.username} ${clip_response}`),
                        success: true
                    };
                } catch(err) {
                    if(err.response && err.response.status == 400) {
                        return await client.say(channel_name, `@${context.username} Invalid search criteria provided`);
                    } else {
                        throw(err);
                    }
                }
            }
        },

        "!fletsrc": async (client, channel_name) => {
            return {
                data: await client.say(channel_name, "https://github.com/Fletman/fletbot-twitch"),
                success: true
            };
        }
    },

    whispers: {
        "!fletpermit": (client, context, msg_parts) => {
            if(!msg_parts[1]) {
                client.whisper(context.username, "No token provided")
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            } else {
                let uname;
                if(msg_parts[2] && chat_meta.bot_owners.includes(context.username)) {
                    uname = msg_parts[2];
                } else {
                    uname = context.username;
                }
                fletalytics.add_permit(uname, msg_parts[1])
                    .then(() => {
                        client.say(`#${uname}`, `@${uname} Fletalytics permit applied`)
                            .then((data) => {
                                logger.log(data);
                            }).catch((err) => {
                                logger.error(err);
                            })
                    }).catch((err) => {
                        logger.error(err);
                        client.say(`#${uname}`, `@${uname} Fletalytics permit failed. Try refreshing access code`)
                            .then((data) => {
                                logger.log(data);
                            }).catch((err) => {
                                logger.error(err);
                            })
                    });
            }
        },

        "!fletjoin": (client, context, msg_parts) => {
            if(!chat_meta.bot_owners.includes(context.username)) {
                client.whisper(context.username, "Only daddy can use this command")
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            } else if(!msg_parts[1]) {
                client.whisper(context.username, "No channel provided")
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    })
            } else {
                if(!client.getChannels().includes(`#${msg_parts[1]}`)) {
                    client.join(msg_parts[1])
                        .then(() => {
                            logger.log(`Joining channel ${msg_parts[1]}`);
                            logger.log(client.getChannels());
                        }).catch((err) => {
                            logger.error(err);
                        })
                } else {
                    client.whisper(context.username, `Already connected to channel ${msg_parts[1]}`)
                        .then((data) => {
                            logger.log(data);
                        }).catch((err) => {
                            logger.error(err);
                        })
                }
            }
        },

        "!fletleave": (client, context, msg_parts) => {
            if(!chat_meta.bot_owners.includes(context.username)) {
                client.whisper(context.username, "Only daddy can use this command")
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            } else if(!msg_parts[1]) {
                client.whisper(context.username, "No channel provided")
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    })
            } else {
                if(client.getChannels().includes(`#${msg_parts[1]}`)) {
                    client.action(`#${msg_parts[1]}`, "is now offline NotLikeThis")
                        .then(() => {
                            logger.log(`Leaving channel ${msg_parts[1]}`);
                            client.part(msg_parts[1])
                                .then(() => {
                                    logger.log(client.getChannels());
                                }).catch((err) => {
                                    logger.error(err);
                                });
                        }).catch((err) => {
                            logger.error(err);
                        });
                } else {
                    client.whisper(context.username, `Not connected to channel ${msg_parts[1]}`)
                        .then((data) => {
                            logger.log(data);
                        }).catch((err) => {
                            logger.error(err);
                        });
                }
            }
        },

        "!fletchannels": (client, context) => {
            if(chat_meta.bot_owners.includes(context.username)) {
                logger.log(`Channel list:  ${client.getChannels()}`);
            }
        },

        "!fletupdate": (client, context, msg_parts) => {
            if(!chat_meta.bot_owners.includes(context.username)) {
                return;
            }
            logger.log(`Update broadcast message triggered by ${context.username}`);
            const update_msg = (msg_parts[1] ? `Update started, Fletbot will be back online soon™. Update message: ${msg_parts.slice(1).join(" ")}` : "Update started, Fletbot will be back online soon™");
            bot_data.backup();
            client.getChannels().forEach((channel) => {
                client.action(channel, update_msg)
                    .then((data) => {
                        logger.log(data);
                        client.part(channel)
                            .then((data) => {
                                logger.log(data);
                            }).catch((err) => {
                                logger.error(err);
                            });
                    }).catch((err) => {
                        logger.error(err);
                    });
            });
        },

        "!fletbackup": (client, context) => {
            if(chat_meta.bot_owners.includes(context.username)) {
                bot_data.backup();
            }
        }
    }
};

/**
 * Check whether all exposed chat commands are implemented
 * @throws if a documented chat command does not have a corresponding implementation
 */
function validate_commands() {
    const documented_cmds = Object.keys(chat_meta.commands);
    documented_cmds.forEach((command) => {
        const cmd = `!${command}`;
        if(!(cmd in module.exports.chat)) {
            throw (`Chat command ${cmd} implementation missing`);
        }
    });
    logger.log("All chat commands validated");
}
