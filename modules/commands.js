const fs = require('fs');
const credentials = require('./credentials.js');
const logger = require('./fletlog.js');
const pyramids = require('./pyramids.js');

let chat_meta = {};
const sip_map = {};
let fletalytics = {};
let cmd_access = {};
const cmd_access_file = './resources/cmd_access.json';

module.exports = {
    init: (chat_data, flet_lib) => {
        chat_meta = chat_data;
        fletalytics = flet_lib;
        validate_commands();
        load_cmd_access();
    },

    check_cmd_access: (channel_name, context, command) => {
        const cmd_id = (command.startsWith('!') ? command.slice(1) : command);
        const access_roles = (cmd_access[cmd_id][channel_name] ? cmd_access[cmd_id][channel_name] : cmd_access[cmd_id].default);
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

    chat: {
        "!flethelp": (client, channel_name, context, msg_parts) => {
            if(!msg_parts[1]) {
                const cmd_list = Object.keys(chat_meta.commands).map((cmd) => "!" + cmd).join(" ");
                client.say(
                    channel_name,
                    `@${context.username} Available commands: ${cmd_list} | Use !flethelp <command> for details on each command`
                ).then((data) => {
                    logger.log(data);
                }).catch((err) => {
                    logger.log(err);
                });
            } else {
                const cmd_id = (msg_parts[1].startsWith('!') ? msg_parts[1].slice(1) : msg_parts[1]);
                const help_response = (
                    chat_meta.commands[cmd_id] ?
                    chat_meta.commands[cmd_id].description :
                    `Unknown command "${cmd_id}". Use !flethelp to list available commands`
                );
                client.say(channel_name, `@${context.username} ${help_response}`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            }
        },

        "!fletsetroles": (client, channel_name, context, msg_parts) => {
            if(msg_parts.length < 3) {
                client.say(channel_name, `@${context.username} Invalid arguments provided. Type !flethelp !fletsetaccess for command usage`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            } else {
                const cmd_id = (msg_parts[1].startsWith('!') ? msg_parts[1].slice(1) : msg_parts[1]);
                const valid_lvls = ['broadcaster', 'moderator', 'vip', 'subscriber', 'all', 'default'];
                if(!chat_meta.commands.hasOwnProperty(cmd_id)) {
                    client.say(channel_name, `@${context.username} Unkown command ${msg_parts[1]}`)
                        .then((data) => {
                            logger.log(data);
                        }).catch((err) => {
                            logger.error(err);
                        });
                } else {
                    const levels = msg_parts.slice(2);
                    if((levels.includes("all") || levels.includes("default")) && levels.length > 1) {
                        client.say(channel_name, `@${context.username} Access levels "all" or "default" cannot be provided alongside other levels`)
                            .then((data) => {
                                logger.log(data);
                            }).catch((err) => {
                                logger.error(err);
                            });
                        return;
                    }
                    for(const lvl of levels) {
                        if(!valid_lvls.includes(lvl)) {
                            client.say(channel_name, `@${context.username} Invalid access level "${lvl}". Valid levels are ${valid_lvls.join(", ")}`)
                                .then((data) => {
                                    logger.log(data);
                                }).catch((err) => {
                                    logger.error(err);
                                });
                            return;
                        }
                    }
                    let access_msg = "";
                    switch (levels[0]) {
                        case 'all':
                            cmd_access[cmd_id][channel_name] = [];
                            access_msg = "no restrictions";
                            break;
                        case 'default':
                            delete cmd_access[cmd_id][channel_name];
                            access_msg = `default: ${cmd_access[cmd_id].default.length == 0 ? "no restrictions" : cmd_access[cmd_id].default.join(", ")}`;
                            logger.log(cmd_access[cmd_id].default);
                            logger.log(access_msg);
                            break;
                        default:
                            cmd_access[cmd_id][channel_name] = levels;
                            access_msg = cmd_access[cmd_id][channel_name].length == 0 ? "no restrictions" : cmd_access[cmd_id][channel_name].join(", ");
                            break;
                    }
                    fs.writeFile(cmd_access_file, JSON.stringify(cmd_access), () => logger.log(`${cmd_id} permissions updated in channel ${channel_name}`));
                    client.say(channel_name, `@${context.username} Access level for ${msg_parts[1]} updated to ${access_msg}`)
                        .then((data) => {
                            logger.log(data);
                        }).catch((err) => {
                            logger.error(err);
                        });
                }
            }
        },

        "!fletgetroles": (client, channel_name, context, msg_parts) => {
            if(!msg_parts[1]) {
                client.say(channel_name, `@${context.username} No command name provided`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            } else {
                const cmd_id = (msg_parts[1].startsWith('!') ? msg_parts[1].slice(1) : msg_parts[1]);
                let access_msg = "";
                if(!(cmd_id in cmd_access)) {
                    access_msg = `Unknown command ${msg_parts[1]}`;
                } else if(!(channel_name in cmd_access[cmd_id])) {
                    access_msg = `Default access for ${msg_parts[1]}: ${cmd_access[cmd_id].default.length == 0 ? "no restrictions" : cmd_access[cmd_id].default.join(", ")}`;
                } else {
                    access_msg = `Custom access for ${msg_parts[1]}: ${cmd_access[cmd_id][channel_name].length == 0 ? "no restrictions" : cmd_access[cmd_id][channel_name].join(", ")}`;
                }
                client.say(channel_name, `@${context.username} ${access_msg}`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    })
            }
        },

        "!fletbot": (client, channel_name, context) => {
            logger.log(`Received ping command in channel ${channel_name}`);
            const username = context.username.toLowerCase();
            let greeting = (chat_meta.custom_greetings[username] ? chat_meta.custom_greetings[username] : "👀");
            if(typeof greeting !== "string") {
                greeting = greeting[Math.floor(Math.random() * greeting.length)];
            }
            client.say(channel_name, `@${context.username} ${greeting}`)
                .then((data) => {
                    logger.log(data);
                }).catch((err) => {
                    logger.error(err);
                });
        },

        "!fletpet": (client, channel_name, context) => {
            client.say(channel_name, `@${context.username} ${chat_meta.pet_pool[Math.floor(Math.random() * chat_meta.pet_pool.length)]}`)
                .then((data) => {
                    logger.log(data);
                }).catch((err) => {
                    logger.error(err);
                });
        },

        "!fletinc": (client, channel_name) => {
            logger.log(`Received Flet Inc. command in channel ${channel_name}`);
            client.say(channel_name, chat_meta.ad_opts[Math.floor(Math.random() * chat_meta.ad_opts.length)])
                .then((data) => {
                    logger.log(data);
                }).catch((err) => {
                    logger.error(err);
                });
        },

        "!otd": (client, channel_name) => {
            client.action(channel_name, "Start your stream off right with some ItsBoshyTime Obligatory ItsBoshyTime Technical ItsBoshyTime Difficulties™, part of every pro streamer's balanced diet")
                .then((data) => {
                    logger.log(data);
                }).catch((err) => {
                    logger.error(err);
                });
        },

        "!fso": (client, channel_name, context, msg_parts) => {
            if(!msg_parts[1]) {
                client.say(channel_name, `@${context.username} no username provided`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            } else {
                fletalytics.shoutout(msg_parts[1])
                    .then((so_msg) => {
                        client.say(channel_name, so_msg)
                            .then((data) => {
                                logger.log(data);
                            }).catch((err) => {
                                logger.error(err);
                            });
                    }).catch((err) => {
                        logger.error(err);
                    })
            }
        },

        "!fletso": (client, channel_name, context, msg_parts) => {
            let result_msg;
            switch (msg_parts[1]) {
                case 'active':
                    const use_fso = (msg_parts[2] && msg_parts[2] === 'fso');
                    fletalytics.set_shoutout_channel(channel_name, true, fso = use_fso);
                    result_msg = "Auto-SO now active";
                    if(use_fso) {
                        result_msg += " using Fletbot shoutout";
                    }
                    break;
                case 'inactive':
                    fletalytics.set_shoutout_channel(channel_name, false);
                    result_msg = "Auto-SO now inactive";
                    break;
                default:
                    result_msg = "Invalid flag provided. Valid flags are <active | inactive>"
                    break;
            }
            client.say(channel_name, `@${context.username} ${result_msg}`)
                .then((data) => {
                    logger.log(data);
                }).catch((err) => {
                    logger.error(err);
                });
        },

        "!sip": (client, channel_name) => {
            if(sip_map[channel_name]) {
                sip_map[channel_name] += 1;
                const sip_msg = sip_map[channel_name] == 69 ? "69 sips. Nice. TPFufun" : `${sip_map[channel_name]} sips... So far. TPFufun`;
                client.action(channel_name, sip_msg)
                    .then((data) => {
                        logger.log(data);
                    })
                    .catch((err) => {
                        logger.error(err);
                    });
            } else {
                sip_map[channel_name] = 1;
                client.action(channel_name, "The first of many sips. Kappa")
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            }
        },

        "!setsips": (client, channel_name, context, msg_parts) => {
            const sips = parseInt(msg_parts[1], 10);
            if(Number.isNaN(sips) || sips < 0) {
                client.say(channel_name, `@${context.username} Invalid number provided`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            } else {
                sip_map[channel_name] = sips;
                client.say(channel_name, `@${context.username} Sip count set to ${sip_map[channel_name]}`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            }
        },

        "!getsips": (client, channel_name) => {
            if(sip_map[channel_name]) {
                client.action(channel_name, `Current sip count: ${sip_map[channel_name]}`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            } else {
                client.action(channel_name, "No sips on record, shockingly")
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            }
        },

        "!fletscrew": (client, channel_name, context, msg_parts) => {
            pyramids.toggle_blocking(client, channel_name, context, msg_parts[1]);
        },

        "!fletalytics": (client, channel_name) => {
            client.action(channel_name, chat_meta.changelog)
                .then((data) => {
                    logger.log(data);
                }).catch((err) => {
                    logger.error(err);
                });
        },

        "!fletpfp": (client, channel_name, context, msg_parts) => {
            fletalytics.get_pfp(msg_parts[1])
                .then((result) => {
                    let msg;
                    if(!result) {
                        msg = `@${context.username} No profile picture could be found for streamer`;
                    } else {
                        msg = `@${context.username} ${result}`
                    }
                    client.say(channel_name, msg)
                        .then((data) => {
                            logger.log(data);
                        }).catch((err) => {
                            logger.error(err);
                        });
                }).catch((err) => {
                    logger.error(err);
                });
        },

        "!fletpermit": (client, channel_name, context) => {
            client.say(
                    channel_name,
                    `@${context.username} Permission link: ${fletalytics.get_permit_link(channel_name.slice(1))} ` +
                    "Upon permission confirmation, you will be redirected to a dummy URL containing an access code. " +
                    "From the URL copy the value for access code (i.e. code=<code value>), " +
                    "then *WHISPER* it to Fletbot using !fletpermit <code value>"
                )
                .then((data) => {
                    logger.log(data);
                }).catch((err) => {
                    logger.log(err);
                });
        },

        "!fletunpermit": (client, channel_name, context) => {
            fletalytics.remove_permit(channel_name.slice(1))
                .then(() => {
                    client.say(channel_name, `@${context.username} fletalytics permissions removed`)
                        .then((data) => {
                            logger.log(data);
                        }).catch((err) => {
                            logger.error(err);
                        });
                }).catch((err) => {
                    logger.error(err);
                });
        },

        "!fletevents": (client, channel_name, context, msg_parts) => {
            if(!msg_parts[1] && !["active", "inactive"].includes(msg_parts[1])) {
                client.say(channel_name, `@${context.username} Invalid argument`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            } else {
                const channel = channel_name.slice(1);
                if(msg_parts[1] == "active") {
                    fletalytics.listen(channel)
                        .then((result) => {
                            client.say(channel_name, `@${context.username} ${result}`)
                                .then((data) => {
                                    logger.log(data);
                                }).catch((err) => {
                                    logger.error(err);
                                });
                        }).catch((err) => {
                            logger.error(err);
                        });
                } else if(msg_parts[1] == "inactive") {
                    fletalytics.unlisten(channel)
                        .then((result) => {
                            client.say(channel_name, `@${context.username} ${result}`)
                                .then((data) => {
                                    logger.log(data);
                                }).catch((err) => {
                                    logger.error(err);
                                });
                        }).catch((err) => {
                            logger.error(err);
                        })

                }
            }

        },

        "!fletyt": (client, channel_name, context, msg_parts) => {
            if(msg_parts.length < 2) {
                client.say(channel_name, `@${context.username} No search criteria provided`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            } else {
                fletalytics.get_yt_link(msg_parts.slice(1).join(" "))
                    .then((yt_link) => {
                        const yt = (yt_link ? yt_link : "Unable to find video for search criteria");
                        client.say(channel_name, `@${context.username} ${yt.title}: ${yt.url}`)
                            .then((data) => {
                                logger.log(data);
                            }).catch((err) => {
                                logger.log(err);
                            });
                    }).catch((err) => {
                        logger.log(err);
                    });
            }
        },

        "!fletclip": (client, channel_name, context, msg_parts) => {
            if(msg_parts.length < 3) {
                client.say(channel_name, `@${context.username} Invalid search criteria provided`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            } else {
                fletalytics.get_clip_link(msg_parts[1], msg_parts.slice(2).join(" "))
                    .then((clip) => {
                        const clip_response = (clip ? `This clip has ${clip.match_percent}% title match: ${clip.url}` :
                            "Unable to find matching clip from provided criteria");
                        client.say(channel_name, `@${context.username} ${clip_response}`)
                            .then((data) => {
                                logger.log(data);
                            }).catch((err) => {
                                logger.log(err);
                            });
                    }).catch((err) => {
                        logger.log(err);
                        if(err.response && err.response.status == 400) {
                            client.say(channel_name, `@${context.username} Invalid search criteria provided`)
                                .then((data) => {
                                    logger.log(data);
                                }).catch((err) => {
                                    logger.error(err);
                                });
                        }
                    });
            }
        },

        "!fletsrc": (client, channel_name) => {
            client.say(channel_name, "https://github.com/Fletman/fletbot-twitch")
                .then((data) => {
                    logger.log(data);
                }).catch((err) => {
                    logger.error(err);
                });
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
            logger.log(`Update broadcast message triggered by ${username}`);
            const update_msg = (msg_parts[1] ? `Update started, Fletbot will be back online soon™. Update message: ${msg_parts.slice(1).join(" ")}` : "Update started, Fletbot will be back online soon™");
            client.getChannels().forEach((channel) => {
                client.action(channel, update_msg)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            });
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

/**
 * Load command permission settings from file.
 * If file does not exist, generate new one populated with default access levels
 * Empty array implies no command restrictions
 */
function load_cmd_access() {
    if(fs.existsSync(cmd_access_file)) {
        logger.log(`Loading access permissions from ${require('path').resolve(cmd_access_file)}`);
        cmd_access = JSON.parse(fs.readFileSync(cmd_access_file));
        Object.entries(chat_meta.commands).forEach((entry) => {
            const cmd_name = entry[0];
            const access_lvl = entry[1].default_access;
            if(!(cmd_name in cmd_access)) {
                cmd_access[cmd_name] = { default: access_lvl };
            }
        });
    } else {
        logger.log(`No command permission file found. Genereating default file at ${require('path').resolve(cmd_access_file)}`);
        Object.entries(chat_meta.commands).forEach((entry) => {
            const cmd_name = entry[0];
            const access_lvl = entry[1].default_access;
            cmd_access[cmd_name] = { default: access_lvl };
        });
        fs.writeFileSync(cmd_access_file, JSON.stringify(cmd_access));
    }
}
