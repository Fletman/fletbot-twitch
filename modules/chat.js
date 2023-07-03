const fs = require('fs');
const bot_data = require('./data.js');
const commands = require('./commands.js');
const database = require('./database.js');
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
     * @param {Object} args Additional arguments to configure behavior
     * @param {string[]} args.channels List of channels to connect to
     * @param {string} args.metrics Datasource to output metrics to
     * @param {string} args.backup Datasource to backup data to
     * @param {string} args.logger Output location for logs
     */
    init: async (chat_client, args) => {
        client = chat_client;

        // initialize libraries
        const db = args.metrics === 'postgres' || args.backup === 'postgres' ? await database.get_db() : null;
        fletalytics = new Fletalytics(client);
        fletrics = new Fletrics(args.metrics, db);
        commands.init(chat_meta, fletalytics);
        pyramids.set_block_messages(chat_meta.pyramid_block_pool);
        await bot_data.init(chat_meta.commands, args.backup, db);

        // register event handlers
        client.on('connected', handle_connect);
        client.on('join', handle_join);
        client.on("notice", handle_notice);
        client.on('chat', handle_chat_message);
        client.on('whisper', handle_whisper);
        client.on('raided', handle_raid);
        client.on('cheer', handle_cheer);

        // connect to channels specified in command line args
        await logger.set_output(args.logger);
        logger.log(`Connecting to channels: ${args.channels}`);
        logger.log(await client.connect());
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

    mod_tools.moderate_account_age(client, channel_name, context.username, fletalytics)
        .then((user_allowed) => {
            if(user_allowed) {
                parse_chat_msg(channel_name, context, msg);
            }
        }).catch((err) => {
            logger.error(err);
        });
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
        const cmd_availability = cmd_is_available(channel_name, context, cmd);
        let cmd_end_time;
        let cmd_success;

        if(cmd_availability.available) {
            commands.chat[cmd](client, channel_name, context, msg_parts)
                .then((result) => {
                    cmd_success = true;
                    logger.log(result.data);
                }).catch((err) => {
                    cmd_success = false;
                    logger.error(err);
                }).finally(() => {
                    cmd_end_time = Date.now();
                    fletrics.publish_cmd_metric(
                        channel_name.slice(1),
                        cmd.slice(1),
                        cmd_start_time.valueOf(),
                        (cmd_end_time - cmd_start_time || 1),
                        cmd_success,
                        context.username
                    ).catch((err) => logger.error(err));
                });
        } else {
            client.say(channel_name, cmd_availability.deny_msg)
                .then((data) => {
                    logger.log(data);
                }).catch((err) => {
                    logger.error(err);
                }).finally(() => {
                    cmd_end_time = Date.now();
                    fletrics.publish_cmd_metric(
                        channel_name.slice(1),
                        cmd.slice(1),
                        cmd_start_time.valueOf(),
                        (cmd_end_time - cmd_start_time || 1),
                        false,
                        context.username
                    ).catch((err) => logger.error(err));
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

function cmd_is_available(channel_name, context, cmd) {
    const command_access = commands.check_cmd_access(channel_name, context, cmd);
    if(!command_access.allowed) {
        return {
            available: false,
            deny_msg: `@${context.username} Not allowed to use ${cmd} command. Must be one of: ${command_access.roles.join(", ")}`
        };
    }

    const command_cooldown = commands.check_cmd_cooldown(channel_name, cmd);
    if(!command_cooldown.available) {
        return {
            available: false,
            deny_msg: `@${context.username} ${cmd} is on cooldown for ${command_cooldown.time_remaining_sec} ${command_cooldown.time_remaining_sec > 1 ? "seconds" : "second"}`
        }
    }

    return { available: true };
}