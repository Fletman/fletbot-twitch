CREATE TABLE IF NOT EXISTS cmd_metric (
    channel TEXT, -- name of channel where command was called
    command TEXT, -- id of command being called
    calling_user TEXT, -- username of user that called command
    invoke_time TIMESTAMP, -- timestamp when command was invoked
    latency INTERVAL, -- time between command invocation and result
    valid BOOLEAN, -- whether command was allowed to be executed by caller
    PRIMARY KEY (channel, command, invoke_time)
);
CREATE INDEX IF NOT EXISTS idx_cmd_time ON cmd_metric(invoke_time);
CREATE INDEX IF NOT EXISTS idx_cmd_channel ON cmd_metric(channel);
CREATE INDEX IF NOT EXISTS idx_cmd_id ON cmd_metric(command);