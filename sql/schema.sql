CREATE SCHEMA IF NOT EXISTS fletbot;

CREATE TABLE IF NOT EXISTS fletbot.cmd_metric (
    channel TEXT, -- name of channel where command was called
    command TEXT, -- id of command being called
    calling_user TEXT, -- username of user that called command
    invoke_time TIMESTAMP, -- timestamp when command was invoked
    latency INTEGER, -- number of milliseconds between command invocation and result
    valid BOOLEAN, -- whether command was allowed to be executed by caller
    host TEXT, -- hostname of Fletbot server
    PRIMARY KEY (channel, command, invoke_time)
);
CREATE INDEX IF NOT EXISTS idx_cmd_time ON fletbot.cmd_metric(invoke_time);

CREATE TABLE IF NOT EXISTS fletbot.pyramid (
    channel TEXT, -- name of channel where pyramid was blocked
    pyramid_user TEXT, -- name of user making pyramid
    phrase TEXT, -- phrase used for pyramid
    pyramid_time TIMESTAMP, -- timestamp when pyramid was detected
    host TEXT, -- hostname of Fletbot server
    PRIMARY KEY (channel, pyramid_time)
);
CREATE INDEX IF NOT EXISTS idx_pyramid_time ON fletbot.pyramid(pyramid_time);

CREATE TABLE IF NOT EXISTS fletbot.ai_prompts (
    user TEXT, -- name of user invoking AI prompt
    channel TEXT, -- name of channel where AI prompt was invoked
    invoke_time TIMESTAMP, -- time at which AI prompt was invoked
    processing_time INTEGER, -- time in ms to process prompt
    prompt TEXT, -- prompt text
    response TEXT, -- AI response to prompt
    PRIMARY KEY (user, channel, invoke_time)
);
CREATE INDEX IF NOT EXISTS idx_prompt_time ON fletbot.ai_prompts(invoke_time);

CREATE TABLE IF NOT EXISTS fletbot.data_store (
    data_name TEXT, -- Name of backed up data field
    data_version INTEGER, -- version of data
    json_data JSON, -- JSON dump of data
    backup_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (data_name, data_version)
);
CREATE INDEX IF NOT EXISTS idx_fletbot_data ON fletbot.data_store(data_name);