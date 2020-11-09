const tmi = require('tmi.js');
const chat = require('./modules/chat.js');
const credentials = require('./modules/credentials.js');

const channels = process.argv.slice(2);
const chat_client = new tmi.client({
	identity: {
		username: "fletbot795",
		password: credentials.get_oauth_token()
	},
	connection: {
		reconnect: true
	},
	channels: channels
});

chat.init(chat_client);