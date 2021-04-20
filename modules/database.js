const fs = require('fs');
const { Client } = require('pg');
const path_resolve = require('path').resolve;
const logger = require('./fletlog.js');

module.exports = {
    get_db: async (config_file = './resources/db_config.json') => {
        let db_config;
        if(fs.existsSync(config_file)) {
            logger.log(`Loading database config from file ${path_resolve(config_file)}`);
            db_config = JSON.parse(fs.readFileSync(config_file));
        } else {
            logger.log("No database config file found. Using config defaults");
            db_config = {};
        }
        const client = new Client(db_config);
        client.on('error', (err) => {
            logger.log(err);
            setTimeout(5000, () => {
                client.connect()
                    .then(() => {
                        logger.log("Successfully reconnected");
                    }).catch((err) => {
                        logger.error(err);
                    });
            })
        });
        await client.connect();
        logger.log("Successfully connected to DB");
        await init_db_schema(client);
        logger.log("Initializsed DB schema");
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
async function init_db_schema(db_client, schema_file = './sql/schema.sql') {
    const schema = fs.readFileSync(schema_file, { encoding: 'utf8' });
    await db_client.query(schema);
}
