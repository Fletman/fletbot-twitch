const database = require('./database.js');

module.exports = class Fletrics {
    constructor(datasource = "postgres") {
        this.ds_type = datasource;
        switch(datasource) {
            case "postgres":
                this.datasource = database.get_db();
                break;
            default:
                throw(`Unsupported datasource: ${datasource}`);
        }
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
        switch(this.ds_type) {
            case "postgres":
                insert_cmd_metric_row(channel, command, start_time, latency, was_valid, caller);
                break;
            default:
                throw(`Cannot publish metric to unknown datasource: ${this.ds_type}`);
        }
    }
}

function insert_cmd_metric_row(channel, command, start_time, latency, was_valid, caller) {
    const res = await this.datasource.query(
        `INSERT INTO cmd_metric (channel, command, calling_user, invoke_time, valid, latency)
         VALUES ($1::text, $2::text, $3::text, to_timestamp($4::bigint), $5::boolean INTERVAL '${latency} milliseconds')`,
        [channel, command, caller, start_time, was_valid]
    );
}