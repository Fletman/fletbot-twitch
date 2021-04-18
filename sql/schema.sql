CREATE SCHEMA IF NOT EXISTS fletbot;

CREATE TABLE IF NOT EXISTS fletbot.cmd_metric (
    channel TEXT, -- name of channel where command was called
    command TEXT, -- id of command being called
    calling_user TEXT, -- username of user that called command
    invoke_time TIMESTAMP, -- timestamp when command was invoked
    latency INTERVAL, -- time in milliseconds between command invocation and result
    valid BOOLEAN, -- whether command was allowed to be executed by caller
    host TEXT, -- local IP of Fletbot server
    PRIMARY KEY (channel, command, invoke_time)
);
CREATE INDEX IF NOT EXISTS idx_cmd_time ON fletbot.cmd_metric(invoke_time);