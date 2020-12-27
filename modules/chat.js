const fs = require('fs');
const credentials = require('./credentials.js');
const Fletalytics = require('./fletalytics.js');
const logger = require('./fletlog.js');
const pyramids = require('./pyramids.js');

// twitch chat client
let client;

// data used in responses to certain commands
const chat_meta = JSON.parse(fs.readFileSync('./resources/chat_medatata.json'));

// per channel sip counter
const sip_map = {};

let fletalytics;

module.exports = {
    /**
     * Initiate chat with event handlers
     * @param chat_client tmi.js Client object
     */
    init: (chat_client) => {
        client = chat_client;

        // register event handlers
        client.on('connected', handle_connect);
        client.on('join', handle_join);
        client.on("notice", handle_notice);
        client.on('chat', handle_chat_message);
        client.on('whisper', handle_whisper);
        client.on('raided', handle_raid);

        // connect to channels specified in command line args
        logger.log(`Connecting to channels: ${process.argv.slice(2)}`);
        client.connect()
            .then((data) => {
                logger.log(data);
            })
            .catch((err) => {
                logger.error(err);
            });

        fletalytics = new Fletalytics(chat_client);
        pyramids.set_block_messages(chat_meta.pyramid_block_pool);
    }
};

// event for connecting to Twitch chat
function handle_connect(addr, port) {
    logger.log(`Fletbot connected to ${addr}:${port}`);
}

//handle user joining channel
function handle_join(channel_name, username, self) {
    if(self) { // report self joining chat
        client.action(channel_name, "is now online")
            .then((data) => {
                logger.log(data);
            }).catch((err) => {
                logger.error(err);
            });
        pyramids.channel_init(channel_name);
    }
}

// handle chat notices
function handle_notice(channel, msg_id, message) {
    logger.log("Notice received:");
    logger.log({
        channel: channel,
        notice_id: msg_id,
        message: message
    });
}

// event for chat messages
function handle_chat_message(channel_name, context, msg, self) {
    if(self) { return; } // ignore messages from self

    const message = msg.trim().toLowerCase();
    const msg_parts = message.split(" ");

    switch (msg_parts[0]) {
        case '!testmod':
            client.say(channel_name, "/mod fletman795")
                .then((data) => {
                    logger.log(data);
                }).catch((err) => {
                    logger.error(err);
                });
            break;
        case '!flethelp':
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
                    chat_meta.commands[cmd_id] :
                    `Unknown command "${cmd_id}". Use !flethelp to list available commands`
                );

                client.say(channel_name, `@${context.username} ${help_response}`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            }
            break;
        case '!fletbot':
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
            break;
        case '!fletpet':
            client.say(channel_name, `@${context.username} ${chat_meta.pet_pool[Math.floor(Math.random() * chat_meta.pet_pool.length)]}`)
                .then((data) => {
                    logger.log(data);
                }).catch((err) => {
                    logger.error(err);
                });
            break;
        case '!fletinc':
            logger.log(`Received Flet Inc. command in channel ${channel_name}`);
            client.say(channel_name, chat_meta.ad_opts[Math.floor(Math.random() * chat_meta.ad_opts.length)])
                .then((data) => {
                    logger.log(data);
                }).catch((err) => {
                    logger.error(err);
                });
            break;
        case '!fso':
            if(!chat_meta.bot_owners.includes(context.username) && !credentials.is_moderator(context)) {
                client.say(channel_name, `@${context.username} Only broadcaster and moderators can use this command`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            } else if(!msg_parts[1]) {
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
            break;
        case '!fletso':
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
            break;

        case '!sip':
            if(sip_map[channel_name]) {
                sip_map[channel_name] += 1;
                client.action(channel_name, `${sip_map[channel_name]} sips... So far. TPFufun`)
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
            break;
        case '!setsips':
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
            break;
        case '!getsips':
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
            break;
        case '!fletscrew':
            pyramids.toggle_blocking(client, channel_name, context, msg_parts[1]);
            break;
        case '!fletalytics':
            client.action(channel_name, chat_meta.changelog)
                .then((data) => {
                    logger.log(data);
                }).catch((err) => {
                    logger.error(err);
                });
            break;
        case '!fletpfp':
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
            break;
        case '!fletpermit':
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
            break;
        case '!fletunpermit':
            if(!chat_meta.bot_owners.includes(context.username) && !credentials.is_moderator(context)) {
                client.say(channel_name, `@${context.username} Only broadcaster and moderators can change this setting`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            }
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

            break;
        case '!fletevents':
            if(!chat_meta.bot_owners.includes(context.username) && !credentials.is_moderator(context)) {
                client.say(channel_name, `@${context.username} Only broadcaster and moderators can change this setting`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            } else {
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
            }
            break;
        case '!fletyt':
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
            break;
        case '!fletclip':
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
            break;
        case '!fletsrc':
            client.say(channel_name, "https://github.com/Fletman/fletbot-twitch")
                .then((data) => {
                    logger.log(data);
                }).catch((err) => {
                    logger.error(err);
                });
            break;
        default:
            if(message.includes("#teampav")) {
                client.say(channel_name, `@${context.username} Team Pav, the one true team`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            } else if(message.includes("#teamlina")) {
                client.say(channel_name, `@${context.username} Team Lina is fake news`)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            } else {
                pyramids.pyramid_check(client, channel_name, context.username, message);
            }
    }
}

// event for whispered messages
function handle_whisper(username, context, msg, self) {
    if(self) { return; } // ignore whispers from self

    const message = msg.trim().toLowerCase();
    const msg_parts = message.split(" ");

    switch (msg_parts[0]) {
        case '!fletpermit':
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
            break;
        case '!fletjoin':
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
            break;
        case '!fletleave':
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
            break;
        case '!fletchannels':
            if(chat_meta.bot_owners.includes(context.username)) {
                logger.log(`Channel list:  ${client.getChannels()}`);
            }
            break;
        case '!fletupdate':
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
        default:
            return;
    }
}

// event for a channel being raided
function handle_raid(channel_name, username, raider_count = 0) {
    logger.log(`${channel_name} raided by ${username} with ${raider_count} raiders`);
    fletalytics.auto_shoutout(channel_name, username.toLowerCase(), 2500)
        .then((so_msg) => {
            if(so_msg) {
                client.say(channel_name, so_msg)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            }
        }).catch((err) => {
            logger.error(err);
        });
}
