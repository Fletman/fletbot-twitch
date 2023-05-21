const credentials = require('./credentials.js');
const { Client, GatewayIntentBits } = require('discord.js');

let output = "console";
/**
 * @type {Client}
 */
let discord_client = null;

/**
 * Wrapper around log functions
 * Allows for changing underlying log functionality without any exposure
 */
module.exports = {
    /**
     * Set output mode for logging module. Defaults to console if discord login fails
     * @param {("console"|"discord")} mode Output mode
     * @returns {Promise<void>}
     */
    async set_output(mode) {
        if(mode === 'discord' && !discord_client) {
            discord_client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
            const discord_login = new Promise((resolve, reject) => {
                discord_client.on('ready', () => {
                    output = mode;
                    resolve();
                });
                discord_client.on('error', (err) => {
                    console.error("Error connecting to Discord, defaulting to console logs");
                    output = "console";
                    reject(err);
                });
            });
            discord_client.login(credentials.get_discord_token());
            
            try {
                await discord_login;
            } catch(err) {
                console.error(err);
            }
        } else {
            output = mode;
        }
        
    },

    /**
     * Log data at level INFO
     * @param  {...any} data Data message(s) to log
     */
    log: (...data) => {
        let log_fn;
        switch(output) {
            case "console":
                log_fn = console.log;
                log_fn.apply(null, [`[ ${new Date(Date.now()).toLocaleString()} ]`, "INFO:"].concat(data));
                break;
            case "discord":
                log_fn = discord_message;
                discord_message(...data);
                break;
            default:
                throw(`Invalid log output mode: ${output}`);
        }
    },
    
    /**
     * Log data at level ERROR
     * @param  {...any} err Error message(s) to log
     */
    error: (...err) => {
        let log_fn;
        switch(output) {
            case "console":
                log_fn = console.error;
                log_fn.apply(null, [`[ ${new Date(Date.now()).toLocaleString()} ]`, "ERROR:"].concat(err));
                break;
            case "discord":
                log_fn = discord_message;
                discord_message(...err);
                break;
            default:
                throw(`Invalid log output mode: ${output}`);
        }
    }
}

async function discord_message(...msg) {
    const message = msg.map((m) => typeof m === 'object' ? "```" + JSON.stringify(m, null, 2) + "```" : "```" + m + "```").join("\n\n");
    const channel = await discord_client.channels.fetch(credentials.get_discord_channel('log'));
    await channel.send(message);
}
