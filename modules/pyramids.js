const credentials = require('./credentials.js');
const logger = require('./fletlog.js');

// channels where attempting pyramid = smite
let mod_channels = [];

/*
active_blocking: for each channel, state whether pyramid blocking is active
	<channel>: <boolean>
*/
const active_blocking = {};

/*
pyramid_log: for each tracked channel, record the user currently (potentially) making a pyramid
	<channel>:
		user <string>
		phrase <regex>
		repetition_log [<int>]
*/
const pyramid_log = {};

/*
pyramid_history: for each channel, track each user who has made a pyramid and how many they've made in a time frame
	<channel>:
		<user>:
			last_pyramid <timestamp>
			counter <int>
*/
const pyramid_history = {};

// list of possible messages for ruining the filthy pyramids
let message_pool = [];

// minimum log length before pyramid pattern is checked
const min_pyramid_size = 4;

module.exports = {
    /**
     * Add channel to pyramid-blocking list
     * @param {string} channel_name Channel name
     */
    channel_init: (channel_name) => {
        // every channel defaults to active pyramid blocking
        active_blocking[channel_name] = true;
        logger.log(active_blocking);
    },

    /**
     * Set messages to use for blocking pyramids
     * @param {string[]} block_messages List of strings to pull from to interrupt pyramids
     */
    set_block_messages: (block_messages) => {
        message_pool = block_messages;
    },

    /**
     * Set pyramid blocking mode for a channel
     * @param {object} client tmi.js Client object
     * @param {string} channel_name Channel name
     * @param {object} context tmi.js user context object
     * @param {string} flag Pyramid blocking mode.
     * One of: [off | normal | max]
     * off: disable pyramid blocking
     * normal: block pyramids
     * max: time out users attempting to create pyramids (requires Fletbot to have moderator-level privileges)
     */
    toggle_blocking: (client, channel_name, context, flag) => {
        switch (flag) {
            case 'off': // disable pyramid blocking completely
                active_blocking[channel_name] = false;
                mod_channels = mod_channels.filter((channel) => channel != channel_name);
                client.say(channel_name, `@${context.username} Pyramid screwing is now disabled`)
                    .then((data) => {
                        logger.log(data);
                        logger.log(`Pyramid blocking level updated by ${context.username} for ${channel_name}:`);
                        logger.log({
                            blocking: active_blocking,
                            modded: mod_channels
                        });
                    })
                    .catch((err) => {
                        logger.error(err);
                    });
                break;
            case 'normal': // enable pyramid blocking without timeouts
                active_blocking[channel_name] = true;
                mod_channels = mod_channels.filter((channel) => channel != channel_name);
                client.say(channel_name, `@${context.username} Pyramid screwing is now enabled`)
                    .then((data) => {
                        logger.log(data);
                        logger.log(`Pyramid blocking level updated by ${context.username} for ${channel_name}:`);
                        logger.log({
                            blocking: active_blocking,
                            modded: mod_channels
                        });
                    })
                    .catch((err) => {
                        logger.error(err);
                    });
                break;
            case 'max': // timeout pyramid makers
                if(channel_name == "#fletbot795" || client.isMod(channel_name, "fletbot795")) {
                    active_blocking[channel_name] = true;
                    if(!mod_channels.includes(channel_name)) {
                        mod_channels.push(channel_name);
                    }
                    client.say(channel_name, `@${context.username} Pyramid screwing set to no-mercy mode DarkMode`)
                        .then((data) => {
                            logger.log(data);
                            logger.log(`Pyramid blocking level updated by ${context.username} for ${channel_name}:`);
                            logger.log({
                                blocking: active_blocking,
                                modded: mod_channels
                            });
                        })
                        .catch((err) => {
                            logger.error(err);
                        });
                } else {
                    client.say(channel_name, `@${context.username} Fletbot must be a moderator for this setting`)
                        .then((data) => {
                            logger.log(data);
                        })
                        .catch((err) => {
                            logger.error(err);
                        });
                }
                break;
            default:
                client.say(channel_name, `@${context.username} Invalid flag. Valid flags are <off | normal | max>`)
                    .then((data) => {
                        logger.log(data);
                    })
                    .catch((err) => {
                        logger.error(err);
                    });
                return;
        }
    },

    /**
     * Check state of chat for possible pyramid being created
     * @param {object} client tmi.js Client object
     * @param {string} channel_name Channel name
     * @param {string} username Name of user possibly attempting pyramid
     * @param {string} messasge Chat message
     */
    pyramid_check: (client, channel_name, username, message) => {
        // nothing to do if blocking is inactive
        if(!active_blocking[channel_name]) {
            return;
        }

        // on first message or new user, record regex
        if(!pyramid_log[channel_name] || pyramid_log[channel_name].user != username) {
            track_pyramid(channel_name, username, message);
            return;
        }

        // check if message contains regex by filtering out all text that does not follow regex
        if(!pyramid_log[channel_name].phrase.test(message)) {
            track_pyramid(channel_name, username, message);
            return;
        }

        // check if message begins with repeated phrase
        if(!message.startsWith(pyramid_log[channel_name].str_phrase)) {
            track_pyramid(channel_name, username, message);
            return;
        }

        // record pyramid "steps"
        const steps = message.match(pyramid_log[channel_name].phrase).length;
        const repeat_count = pyramid_log[channel_name].repetition_log.push(steps);

        // each pyramid step size must have a delta of 1
        if(repeat_count > 1) {
            const repeat_log = pyramid_log[channel_name].repetition_log;
            if(Math.abs(repeat_log[repeat_log.length - 1] - repeat_log[repeat_log.length - 2]) != 1) {
                track_pyramid(channel_name, username, message);
                return;
            }
        } else {
            // only 1 step so far, nothing to do
            return;
        }

        /*
        	check if a pyramid is near completion:
        		- repetition counts match in each direction (excluding first entry)
        		- pyramid has more than a single step (i.e. a "peak" of 2 repeat phrases)
        			- <min_pyramd_size> or more log entries recorded denote a pyramid with a "peak" of at least 3 repeat phrases
        				* aka ignore small pp pyramids
        		- even number of repetitions, denoting pyramid as one step away from finished
        */
        let result;
        if(repeat_count >= min_pyramid_size && repeat_count % 2 == 0) {
            const repeat_log = pyramid_log[channel_name].repetition_log;
            if(repeat_log[2] - repeat_log[1] != repeat_log[1] - repeat_log[0]) {
                // pyramid beginning step delta doesn't match subsequent step delta
                return;
            }
            for(let i = 1; i < repeat_log.length / 2; i++) {
                if(repeat_log[i] != repeat_log[repeat_log.length - i]) {
                    // pyramid not at final stage, nothing to do yet
                    return;
                }
            }

            // all conditions met, pyramid is about to be completed, commence countermeasure
            client.say(channel_name, `@${username} ${message_pool[Math.floor(Math.random() * message_pool.length)]}`)
                .then((data) => {
                    logger.log(data);
                })
                .catch((err) => {
                    logger.error(err);
                });
            logger.log(`All conditions met, pyramid countermeasure activated in ${channel_name}`);
            logger.log(pyramid_log[channel_name]);

            //record pyramid history, check for previous pyramids from same user in last 5 min
            const curr_time = new Date(Date.now()); // timestamp converted to date object for logging readability because I'm lazy lmao
            if(channel_name in pyramid_history && username in pyramid_history[channel_name]) {
                if(curr_time.valueOf() - pyramid_history[channel_name][username].last_pyramid.valueOf() <= 300000) {
                    pyramid_history[channel_name][username].counter++;
                } else {
                    pyramid_history[channel_name][username].counter = 1;
                }
                pyramid_history[channel_name][username].last_pyramid = curr_time;
            } else {
                if(!pyramid_history[channel_name]) {
                    pyramid_history[channel_name] = {};
                }
                pyramid_history[channel_name][username] = {
                    last_pyramid: curr_time,
                    counter: 1
                };
            }
            logger.log(pyramid_history);


            // if in a moderated channel, timeout user
            if(mod_channels.includes(channel_name)) {
                let timeout_len;
                switch (pyramid_history[channel_name][username].counter) {
                    case 1:
                        timeout_len = 1;
                        break;
                    case 2:
                        timeout_len = 15;
                        break;
                    case 3:
                        timeout_len = 30;
                        break;
                    default:
                        timeout_len = 60;
                }
                client.timeout(channel_name, username, timeout_len, "Filthy pyramids aren't allowed here")
                    .then((data) => {
                        logger.log(data);
                    })
                    .catch((err) => {
                        logger.error(err);
                    });
                if(pyramid_history[channel_name][username].counter > 1) {
                    client.say(
                            channel_name,
                            `@${username} That's pyramid #${pyramid_history[channel_name][username].counter} in the last 5 minutes. Watch yourself 👀`
                        )
                        .then((data) => {
                            logger.log(data);
                        })
                        .catch((err) => {
                            logger.error(err);
                        });
                }
            }
            result = {
                channel: channel_name.slice(1),
                user: username,
                phrase: pyramid_log[channel_name].str_phrase,
                time: pyramid_history[channel_name][username].last_pyramid
            };

            //cleanup for next target
            pyramid_log[channel_name] = {
                user: null,
                phrase: null,
                repetition_log: []
            };
        }
        return result;
    }
};

// record user making pyramid and a regular expression of the phrase used for pyramid
function track_pyramid(channel_name, username, message) {
    const phrase_str = message.split(' ')[0];
    const regex_str = phrase_str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'); // escape any special regex characters
    const regex = new RegExp(`(${regex_str})`, 'g'); // create regular expression out of given phrase
    pyramid_log[channel_name] = {
        user: username,
        phrase: regex,
        str_phrase: phrase_str,
        repetition_log: [message.match(regex).length]
    };
}
