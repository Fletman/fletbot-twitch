const fs = require('fs');
const tmi = require('tmi.js');
const chat = require('./modules/chat.js');
const credentials = require('./modules/credentials.js');

const argv = argparse();
console.log(argv);

const chat_client = new tmi.client({
    identity: {
        username: "fletbot795",
        password: credentials.get_oauth_token()
    },
    connection: {
        reconnect: true,
        secure: true
    },
    channels: argv.channels
});

chat.init(chat_client, argv).catch((err) => {
    console.error(err);
});


/**
 * Parse and validate command-line args
 * Sets default values for omitted args
 * @returns Map of arg names and vals
 */
function argparse() {
    const args = process.argv.slice(2).map((arg) => arg.toLowerCase());
    const argmap = {};
    let key;
    let val;
    for(const arg of args) {
        [key, val] = arg.split('=', 2);
        argmap[key] = (!['"', "'"].includes(val[0]) && val.includes(',')) ?
            val.split(',') :
            val;
    }

    validate_arg(argmap, 'metrics', ['console', 'postgres']);
    validate_arg(argmap, 'backup', ['file', 'postgres']);
    validate_arg(argmap, 'logger', ['console', 'discord']);
    if(!argmap['channels']) {
        if(fs.existsSync('./resources/channels.json')) {
            argmap['channels'] = JSON.parse(fs.readFileSync('./resources/channels.json'));
        } else {
            argmap['channels'] = [];
        }
    }
    return argmap;
}

/**
 * @param {Object} argmap Object containing parsed command line args
 * @param {string} flag Flag for command line arg
 * @param {string[]} valid_vals List of valid arguments for flag
 */
function validate_arg(argmap, flag, valid_vals) {
    if(!argmap[flag]) {
        argmap[flag] = valid_vals[0];
    } else if(!valid_vals.includes(argmap[flag])) {
        throw(`'${argmap[flag]}' not a valid value for ${flag}. Valid arguments are: ${valid_vals}`);
    }
}