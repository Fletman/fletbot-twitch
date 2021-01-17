const fs = require('fs');
const tmi = require('tmi.js');
const chat = require('./modules/chat.js');
const credentials = require('./modules/credentials.js');

const get_channels = () => {
    if(process.argv.length > 2) {
        return process.argv.slice(2);
    } else if(fs.existsSync('./resources/channels.json')) {
        return JSON.parse(fs.readFileSync('./resources/channels.json'));
    } else {
        return [];
    }
}

const chat_client = new tmi.client({
    identity: {
        username: "fletbot795",
        password: credentials.get_oauth_token()
    },
    connection: {
        reconnect: true
    },
    channels: get_channels()
});

chat.init(chat_client);
