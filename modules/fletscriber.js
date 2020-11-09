const axios = require('axios');
const { ApiClient, extractUserId } = require('twitch');
const { StaticAuthProvider, RefreshableAuthProvider } = require('twitch-auth')
const { PubSubClient } = require('twitch-pubsub-client');
const credentials = require('./credentials.js');
const logger = require('./fletlog.js');

/**
 * Class for interfacing with Twitch PubSub event stream
 */
module.exports = class FletScriber {
    /**
     * @param {object} chat_client tmi.js Client object
     */
    constructor(chat_client) {
        this.chat_client = chat_client;
        this.pubsub_client = new PubSubClient();
        this.subs = {};
    }

    /**
     * Subscribe to a channel's event stream
     * @param {string} channel Channel name
     */
    async subscribe(channel) {
        if(this.subs[channel]) {
            logger.log("Already subscribed to channel");
            return;
        }

        const client_id = credentials.get_client_id();
        const default_token = await credentials.get_default_access_token();

        const res = await axios({
            method: 'get',
            url: `https://api.twitch.tv/helix/users?login=${channel}`,
            headers: {
                'client-id': client_id,
                'Authorization': `Bearer ${default_token}`
            }
        });
        const channel_id = res.data.data[0].id;
        
        try {
            await this.pubsub_client.registerUserListener(
                new ApiClient({authProvider: this._create_auth_provider(client_id, channel)})
            );
        } catch(e) {
            if(e.message != "Invalid token supplied") { throw(e); }
            logger.log(`Invalid access token for ${channel}, attempting to refresh`);
            await credentials.refresh_tokens(channel);
            await this.pubsub_client.registerUserListener(
                new ApiClient({authProvider: this._create_auth_provider(client_id, channel)})
            );
        }

        const redemeption_listener = await this.pubsub_client.onRedemption(channel_id, (message) => {
            const redeem_data = message._data.data.redemption;
            logger.log("redeem event");
            logger.log(redeem_data);
            this._get_channel_name(redeem_data.channel_id)
                .then((channel_name) => {
                    this.chat_client.say(channel_name, `@${redeem_data.user.login} redeemed ${redeem_data.reward.title} PogChamp`)
                        .then((data) => {
                            logger.log(data);
                        })
                        .catch((err) => {
                            logger.error(err);
                        })
                })
                .catch((err) => {
                    logger.log(err);
                });
        });
        this.subs[channel] = [redemeption_listener];
    }

    /**
     * Unsubscribe from a channel's event stream
     * @param {string} channel Channel name
     */
    async unsubscribe(channel) {
        //TODO: I feel like this function is broken lol. Will take another pass if this ever sees proper use

        if(!this.subs[channel]) {
            logger.log(`channel ${channel} already unsubscribed`);
            return;
        }
        for(const listener of this.subs[channel]) {
            logger.log(`Removing listener from ${channel}: ${listener}`);
            await listener.remove();
            listener.remove()
                .then(() => {
                    logger.log(`Double removed listener from ${channel}?`);
                })
                .catch((err) => {
                    logger.log(err);
                });
        }
        delete this.subs[channel];
        logger.log(this.subs);
    }

    /**
     * Get channel's name from ID
     * @private
     * @param {string} channel_id Channel ID
     * @returns {string} Username of channel
     */
    async _get_channel_name(channel_id) {
        const client_id = credentials.get_client_id();
        const default_token = await credentials.get_default_access_token();
        const response = await axios({
            method: 'get',
            url: `https://api.twitch.tv/helix/users?id=${channel_id}`,
            headers: {
                'client-id': client_id,
                'Authorization': `Bearer ${default_token}`
            }
        });
        return `#${response.data.data[0].login}`;
    }

    /**
     * Create an auth provider capable of refreshing tokens to pass to PubSub constructor
     * @param {string} client_id Client ID
     * @param {string} channel Channel name
     * @returns {RefreshableAuthProvider} Auth Provider object that will automatically refresh tokens and update credentials store
     */
    _create_auth_provider(client_id, channel) {
        return new RefreshableAuthProvider(
            new StaticAuthProvider(client_id, credentials.get_access_token(channel)),
            {
                clientSecret: credentials.get_client_secret(),
                refreshToken: credentials.get_refresh_token(channel),
                onRefresh: (new_tokens) => {
                    logger.log(`Pubsub refreshing tokens for ${channel}`);
                    credentials.update_access_tokens(
                        channel,
                        {access_token: new_tokens.accessToken, refresh: new_tokens.refreshToken}
                    );
                }
            }   
        );
    }
}