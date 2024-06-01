const os = require('os');
const logger = require('./fletlog.js');

module.exports = class Fletrics {
    constructor(datasource = 'console', db_client = null) {
        switch (datasource) {
            case 'console':
                this.cmd_publish_fn = console_log_cmd_metric;
                this.pyramid_publish_fn = console_log_pyramid_metric;
                this.prompt_publish_fn = console_log_prompt_metric;
                this.datasource = logger;
                break;
            case 'postgres':
                this.cmd_publish_fn = insert_cmd_metric_to_pg;
                this.pyramid_publish_fn = insert_pyramid_metric_to_pg;
                this.prompt_publish_fn = insert_prompt_metric_to_pg;
                this.datasource = db_client;
                break;
            default:
                throw (`Unsupported datasource ${datasource}`);
        }
        this.ds_type = datasource;
    }

    /**
     * Publish command metric to backend datasource
     * @param {string} channel Channel name
     * @param {string} command Command name
     * @param {Number} start_time Timestamp of when command was called
     * @param {Number} latency Time in ms between command invocation and result
     * @param {boolean} was_valid Whether the command was allowed to be executed
     * @param {string} caller Caller of command
     */
    async publish_cmd_metric(channel, command, start_time, latency, was_valid, caller) {
        await this.cmd_publish_fn(
            channel,
            command,
            start_time,
            latency,
            was_valid,
            caller
        );
    }

    /**
     * Publish pyramid block metric to backend datasource
     * @param {string} channel Channel name
     * @param {string} phrase Phrase used to form pyramid
     * @param {Date} pyramid_time Timestamp of when pyramid was detected
     * @param {string} user User that attempted pyramid
     */
    async publish_pyramid_metric(channel, phrase, pyramid_time, user) {
        await this.pyramid_publish_fn(
            channel,
            phrase,
            pyramid_time,
            user
        );
    }

    /**
     * Publish metrics on AI prompts
     * @param {string} caller Caller of AI prompt
     * @param {string} channel Channel where prompt was invoked
     * @param {Number} start_time Timestamp when prompt was invoked
     * @param {Number} latency Time in ms to handle AI prompt
     * @param {string} prompt  
     * @param {string} response 
     */
    async publish_prompt_metric(caller, channel, start_time, latency, prompt, response) {
        await this.prompt_publish_fn(
            caller,
            channel,
            start_time,
            latency,
            prompt,
            response
        );
    }
}

function get_host() {
    return os.hostname().replace('-', '_');
}

async function console_log_cmd_metric(channel, command, start_time, latency, was_valid, caller) {
    const metric_obj = {
        channel: channel,
        command: command,
        caller: caller,
        invoked: new Date(start_time).toLocaleString(),
        latency: `${latency}ms`,
        valid: was_valid,
        host: get_host()
    };
    this.datasource.log(metric_obj);
}

async function console_log_pyramid_metric(channel, phrase, pyramid_time, user) {
    const metric_obj = {
        channel: channel,
        user: user,
        phrase: phrase,
        time: pyramid_time.toLocaleString(),
        host: get_host()
    };
    this.datasource.log(metric_obj);
}

async function console_log_prompt_metric(user, channel, invoke_time, latency, prompt, response) {
    const metric_obj = {
        user,
        channel,
        invoke_time: new Date(invoke_time).toLocaleString(),
        latency: `${latency}ms`,
        prompt,
        response
    };
    this.datasource.log(metric_obj);
}

async function insert_cmd_metric_to_pg(channel, command, start_time, latency, was_valid, caller) {
    await this.datasource.query(
        `INSERT INTO fletbot.cmd_metric (channel, command, calling_user, invoke_time, valid, host, latency)
         VALUES ($1::text, $2::text, $3::text, $4::timestamp, $5::boolean, $6::text, $7::int)`,
        [channel, command, caller, new Date(start_time).toISOString(), was_valid, get_host(), latency]
    );
}

async function insert_pyramid_metric_to_pg(channel, phrase, pyramid_time, user) {
    await this.datasource.query(
        `INSERT INTO fletbot.pyramid (channel, pyramid_user, phrase, pyramid_time, host)
         VALUES ($1::text, $2::text, $3::text, $4::timestamp, $5::text)`,
        [channel, user, phrase, pyramid_time.toLocaleString(), get_host()]
    );
}

async function insert_prompt_metric_to_pg(user, channel, invoke_time, latency, prompt, response) {
    await this.datasource.query(
        `INSERT INTO fletbot.ai_prompts (username, channel, invoke_time, processing_time, prompt, response)
         VALUES ($1::text, $2::text, $3::timestamp, $4::int, $5::text, $6::text)`,
        [user, channel, new Date(invoke_time).toISOString(), latency, prompt, response]
    );
}
