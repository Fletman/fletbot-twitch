const fs = require('fs');
const { Client } = require('pg');

module.exports = {
    get_db: async () => {
        const client = new Client();
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