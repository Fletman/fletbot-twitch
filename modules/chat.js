const fs = require('fs');
const bot_data = require('./data.js');
const commands = require('./commands.js');
const Fletalytics = require('./fletalytics.js');
const Fletrics = require('./metrics.js');
const logger = require('./fletlog.js');
const pyramids = require('./pyramids.js');
const mod_tools = require('./mod_tools.js');

// twitch chat client
let client;

// data used in responses to certain commands
const chat_meta = JSON.parse(fs.readFileSync('./resources/chat_medatata.json'));

/** @type {Fletalytics} */
let fletalytics;

/** @type {Fletrics} */
let fletrics;

module.exports = {
    /**
     * Initiate chat with event handlers
     * @param chat_client tmi.js Client object
     */
    init: (chat_client) => {
        client = chat_client;

        fletalytics = new Fletalytics(client);
        fletrics = new Fletrics("postgres");
        bot_data.init(chat_meta.commands);
        commands.init(chat_meta, fletalytics);
        pyramids.set_block_messages(chat_meta.pyramid_block_pool);

        // register event handlers
        client.on('connected', handle_connect);
        client.on('join', handle_join);
        client.on("notice", handle_notice);
        client.on('chat', handle_chat_message);
        client.on('whisper', handle_whisper);
        client.on('raided', handle_raid);
        client.on('cheer', handle_cheer);

        // connect to channels specified in command line args
        logger.log(`Connecting to channels: ${process.argv.slice(2)}`);
        client.connect()
            .then((data) => {
                logger.log(data);
            })
            .catch((err) => {
                logger.error(err);
            });
        mod_tools.start_ban_loop(client);
    }
};

// event for connecting to Twitch chat
function handle_connect(addr, port) {
    logger.log(`Fletbot connected to ${addr}:${port}`);
}

//handle user joining channel
function handle_join(channel_name, username, self) {
    if(self) { // report self joining chat
        logger.log(`Connected to channel ${channel_name}`);
        pyramids.channel_init(channel_name);
    } else {
        if(mod_tools.protection_active(channel_name)) {
            mod_tools.verify_account_age(channel_name, username, fletalytics)
                .then((verification) => {
                    if(verification.valid) {
                        if(verification.check_required) {
                            logger.log(`User ${username} has been verified for ${channel_name}: Account age is ${verification.account_age} hours old, required age is ${verification.required_age} hours`);
                        }
                    } else {
                        let mod_cmd;
                        const reason = `Account age of ${username} (${verification.account_age} hours) failed to meet channel's requirement of at least ${verification.required_age} hours`;
                        switch (verification.mod_action) {
                            case "timeout":
                                mod_cmd = client.timeout(channel_name, username, Math.min((verification.required_age - verification.account_age) * 3600, 604800), reason);
                                break;
                            case "ban":
                                mod_cmd = client.ban(channel_name, username, reason);
                                break;
                            default:
                                throw (`Unknown mod action ${verification.mod_action}`);
                        }
                        logger.log(reason);
                        mod_cmd.then((data) => {
                            logger.log(data);
                        }).catch((err) => {
                            logger.error(err);
                        });
                    }
                }).catch((err) => {
                    logger.error(err);
                });
        }
    }
}

// handle chat notices
function handle_notice(channel, msg_id, message) {
    if(msg_id !== 'host_target_went_offline') {
        logger.log("Notice received:", {
            channel: channel,
            notice_id: msg_id,
            message: message
        });
    }
}

// event for chat messages
function handle_chat_message(channel_name, context, msg, self) {
    if(self) { return; } // ignore messages from self

    parse_chat_msg(channel_name, context, msg);
}

// event for whispered messages
function handle_whisper(username, context, msg, self) {
    if(self) { return; } // ignore whispers from self

    const message = msg.trim().toLowerCase();
    const msg_parts = message.split(" ");
    const cmd = msg_parts[0];

    if(commands.whispers.hasOwnProperty(cmd)) {
        commands.whispers[cmd](client, context, msg_parts);
    }
}

// event for a channel being raided
function handle_raid(channel_name, username, raider_count = 0) {
    const so_setting = bot_data.get_auto_shoutout(channel_name);
    if(so_setting) {
        logger.log(`${channel_name} raided by ${username} with ${raider_count} raiders`);
        fletalytics.auto_shoutout(username.toLowerCase(), so_setting, 2500)
            .then((so_msg) => {
                client.say(channel_name, so_msg)
                    .then((data) => {
                        logger.log(data);
                    }).catch((err) => {
                        logger.error(err);
                    });
            }).catch((err) => {
                logger.error(err);
            });
    }
}

// event for someone cheering bits
function handle_cheer(channel_name, context, msg) {
    const message = msg.trim().toLowerCase();
    const pyramid = pyramids.pyramid_check(client, channel_name, context.username, message);
    if(pyramid) {
        fletrics.publish_pyramid_metric(
            pyramid.channel,
            pyramid.phrase,
            pyramid.time,
            pyramid.user
        );
    }
}

function parse_chat_msg(channel_name, context, msg) {
    const message = msg.trim().toLowerCase();
    const msg_parts = message.split(" ");
    const cmd = msg_parts[0];

    if(commands.chat.hasOwnProperty(cmd)) {
        const cmd_start_time = Date.now();
        const command_access = commands.check_cmd_access(channel_name, context, cmd);
        const command_cooldown = commands.check_cmd_cooldown(channel_name, cmd);
        if(command_access.allowed && command_cooldown.available) {
            commands.chat[cmd](client, channel_name, context, msg_parts)
                .then((result) => {
                    const cmd_end_time = Date.now();
                    fletrics.publish_cmd_metric(
                        channel_name.slice(1),
                        cmd.slice(1),
                        cmd_start_time.valueOf(),
                        (cmd_end_time - cmd_start_time || 1),
                        result.success,
                        context.username
                    ).catch((err) => logger.error(err));
                    logger.log(result.data);
                }).catch((err) => {
                    const cmd_end_time = Date.now();
                    fletrics.publish_cmd_metric(
                        channel_name.slice(1),
                        cmd.slice(1),
                        cmd_start_time.valueOf(),
                        (cmd_end_time - cmd_start_time || 1),
                        false,
                        context.username
                    ).catch((err) => logger.error(err));
                    logger.error(err);
                });
        } else {
            let deny_msg;
            if(!command_cooldown.available) {
                deny_msg = `@${context.username} ${cmd} is on cooldown for ${command_cooldown.time_remaining_sec} ${command_cooldown.time_remaining_sec > 1 ? "seconds" : "second"}`;
            } else if(command_access.ban) {
                deny_msg = "";
            } else {
                deny_msg = `@${context.username} Not allowed to use ${cmd} command. Must be one of: ${command_access.roles.join(", ")}`;
            }
            client.say(channel_name, deny_msg)
                .then((data) => {
                    const cmd_end_time = Date.now();
                    fletrics.publish_cmd_metric(
                        channel_name.slice(1),
                        cmd.slice(1),
                        cmd_start_time.valueOf(),
                        (cmd_end_time - cmd_start_time || 1),
                        false,
                        context.username
                    ).catch((err) => logger.error(err));
                    logger.log(data);
                }).catch((err) => {
                    const cmd_end_time = Date.now();
                    fletrics.publish_cmd_metric(
                        channel_name.slice(1),
                        cmd.slice(1),
                        cmd_start_time.valueOf(),
                        (cmd_end_time - cmd_start_time || 1),
                        false,
                        context.username
                    ).catch((err) => logger.error(err));
                    logger.error(err);
                });
        }
    } else if(message.includes("#teampav")) {
        client.say(channel_name, `@${context.username} Team Pav, the one true team`)
            .then((data) => {
                logger.log(data);
            }).catch((err) => {
                logger.error(err);
            });
    } else {
        const pyramid = pyramids.pyramid_check(client, channel_name, context.username, message);
        if(pyramid) {
            fletrics.publish_pyramid_metric(
                pyramid.channel,
                pyramid.phrase,
                pyramid.time,
                pyramid.user
            );
        }
    }
}