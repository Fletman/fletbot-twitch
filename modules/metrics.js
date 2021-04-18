const os = require('os');
const data = require('./data.js');
const database = require('./database.js');
const logger = require('./fletlog.js');

module.exports = class Fletrics {
    constructor(datasource = 'console') {
        switch(datasource) {
            case 'console':
                this.publish_fn = console_log_metric;
                this.datasource = logger;
                break;
            case 'postgres':
                this.publish_fn = insert_metric_to_pg;
                database.get_db()
                    .then((db_client) => {
                        this.datasource = db_client;
                    }).catch((err) => {
                        logger.error(err);
                    })
                break;
            default:
                throw(`Unsupported datasource ${datasource}`);
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
        await this.publish_fn(
            channel,
            command,
            start_time,
            latency,
            was_valid,
            caller
        );
    }
}

async function console_log_metric(channel, command, start_time, latency, was_valid, caller) {
    const metric_obj = {
        channel: channel,
        command: command,
        caller: caller,
        invoked: new Date(start_time).toLocaleString(),
        latency: `${latency}ms`,
        valid: was_valid,
        host: os.hostname()
    };
    this.datasource.log(metric_obj);
}

async function insert_metric_to_pg(channel, command, start_time, latency, was_valid, caller) {
    console.log(new Date(start_time).toISOString());
    await this.datasource.query(
        `INSERT INTO fletbot.cmd_metric (channel, command, calling_user, invoke_time, valid, host, latency)
         VALUES ($1::text, $2::text, $3::text, $4::timestamp, $5::boolean, $6::text, $7::int)`,
        [channel, command, caller, new Date(start_time).toISOString(), was_valid, os.hostname(), latency]
    );
}