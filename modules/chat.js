const fs = require('fs');
const commands = require('./commands.js');
const Fletalytics = require('./fletalytics.js');
const logger = require('./fletlog.js');
const pyramids = require('./pyramids.js');

// twitch chat client
let client;

// data used in responses to certain commands
const chat_meta = JSON.parse(fs.readFileSync('./resources/chat_medatata.json'));

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

        fletalytics = new Fletalytics(client);
        commands.init(chat_meta, fletalytics);
        pyramids.set_block_messages(chat_meta.pyramid_block_pool);

        // connect to channels specified in command line args
        logger.log(`Connecting to channels: ${process.argv.slice(2)}`);
        client.connect()
            .then((data) => {
                logger.log(data);
            })
            .catch((err) => {
                logger.error(err);
            });
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
    const cmd = msg_parts[0];

    if(commands.chat.hasOwnProperty(cmd)) {
        const command_access = commands.check_cmd_access(channel_name, context, cmd);
        if(command_access.allowed) {
            commands.chat[cmd](client, channel_name, context, msg_parts);
        } else {
            client.say(channel_name, `@${context.username} Not allowed to use ${cmd} command. Must be one of: ${command_access.roles.join(", ")}`)
                .then((data) => {
                    logger.log(data);
                }).catch((err) => {
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
