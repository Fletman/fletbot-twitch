const axios = require('axios');
const fs = require('fs');

// client creds: client_id for API and oauth token for chat
const credentials = JSON.parse(fs.readFileSync('./resources/auth.json', { encoding: 'utf8' }));
let default_token;

/**
 * functions to manage both credentials for Fletbot as well as RBAC for users invoking Fletbot commands
 */
module.exports = {
    /**
     * @returns {string} Fletbot's client ID
     */
    get_client_id: () => {
        return credentials.client_id;
    },

    /**
     * @returns {string} Fletbot's client secret
     */
    get_client_secret: () => {
        return credentials.api_secret;
    },

    /**
     * @returns {string} Fletbot's Twitch user OAuth token
     */
    get_oauth_token: () => {
        return credentials.oauth_token;
    },

    /**
     * Fetch API OAuth token if not already cached
     * @returns {Promise<string>} API OAuth token
     */
    get_default_access_token: async () => {
        if(default_token) {
            return default_token;
        }
        const response = await axios({
            method: 'post',
            url: "https://id.twitch.tv/oauth2/token" +
                `?client_id=${credentials.client_id}` +
                `&client_secret=${credentials.api_secret}` +
                `&grant_type=client_credentials`
        });
        default_token = response.data.access_token;
        return default_token;
    },

    /**
     * Update access and refresh OAuth tokens for a PubSub integration with a specified channel
     * @param {string} channel Channel name
     * @param {object} tokens Object containing access_token and refresh_token String values
     */
    update_access_tokens: (channel, tokens) => {
        credentials.permits[channel] = {
            access: tokens.access_token,
            refresh: tokens.refresh_token
        };
        fs.writeFileSync('./resources/auth.json', JSON.stringify(credentials));
    },

    /**
     * Delete access and refresh tokens for specified channel
     * @param {string} channel Channel name
     */
    remove_tokens: (channel) => {
        delete credentials.permits[channel];
        fs.writeFileSync('./resources/auth.json', JSON.stringify(credentials));
    },

    /**
     * @returns {string[]} List of users permitted to use PubSub events
     */
    get_validated_channels: () => {
        return Object.keys(credentials.permits);
    },

    /**
     * @param {string} channel Channel name
     * @returns {string} API access token of specified channel
     */
    get_access_token: (channel) => {
        return credentials.permits[channel].access;
    },

    /**
     * @param {string} channel Channel name
     * @returns {string} API refresh token of specified channel
     */
    get_refresh_token: (channel) => {
        return credentials.permits[channel].refresh;
    },

    /**
     * Update access and refresh API tokens for specified channel
     * @param {string} channel Channel name
     * @returns {string} Updated access token
     */
    refresh_tokens: async (channel) => {
        const response = await axios({
            method: 'post',
            url: "https://id.twitch.tv/oauth2/token" +
                "?grant_type=refresh_token" +
                `&refresh_token=${encodeURI(credentials.permits[channel].refresh)}` +
                `&client_id=${credentials.client_id}` +
                `&client_secret=${credentials.api_secret}`
        });
        this.update_access_tokens(channel, response.data);
        return this.get_access_token(channel);
    },

    /**
     * @returns {string} Google API key
     */
    get_google_key: () => {
        return credentials.google_key;
    },

    /**
     * Check whether a given user is channel broadcaster
     * @param {object} user_context tmi.js chat context object
     * @returns {boolean} whether user is channel broadcaster
     */
    is_broadcaster: (user_context) => {
        return user_context.badges && user_context.badges.broadcaster;
    },

    /**
     * Check whether a given user has moderator-level privileges
     * @param {object} user_context tmi.js chat context object
     * @returns {boolean} whether user has moderator privileges
     */
    is_moderator: (user_context) => {
        return user_context.badges &&
            (user_context.badges.broadcaster || user_context.badges.moderator)
    },

    /**
     * Check whether a given user is a VIP
     * @param {object} user_context tmi.js chat context object
     * @returns {boolean} whether user is a VIP
     */
    is_vip: (user_context) => {
        return user_context.badges && user_context.badges.vip;
    },

    /**
     * Check whether a given user is a channel subscriber
     * @param {object} user_context tmi.js chat context object
     * @returns {boolean} whether user is a subscriber
     */
    is_subscriber: (user_context) => {
        return user_context.badges && user_context.badges.subscriber;
    },
}
