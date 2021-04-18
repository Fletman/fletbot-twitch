const fs = require('fs');
const { Client } = require('pg');
const path_resolve = require('path').resolve;
const logger = require('./fletlog.js');

module.exports = {
    get_db: async (config_file = '../resources/db_config.json') => {
        let db_config;
        if(fs.existsSync(config_file)) {
            logger.log(`Loading database config from file ${path_resolve(config_file)}`);
            db_config = JSON.parse(fs.readFileSync(config_file));
        } else {
            logger.log("No database config file found. Using config defaults");
            db_config = {};
        }
        const client = new Client(db_config);
        await client.connect();
        await init_db_schema(client);
        return client;
    },

    close_db: async (db_client) => {
        await db_client.end();
    }
}

/**
 * 
 * @param {Client} db_client 
 * @param {string} schema_file 
 */
async function init_db_schema(db_client, schema_file = '../sql/schema.sql') {
    const schema = fs.readFileSync(schema_file);
    await db_client.query(schema);
}