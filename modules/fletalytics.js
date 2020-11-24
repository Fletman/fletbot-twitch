"use strict";

const axios = require('axios');
const unescape = require('unescape');
const { Worker } = require('worker_threads');
const clip_search = require('./clip_search.js');
const credentials = require('./credentials.js');
const logger = require('./fletlog.js');
const Fletscriber = require('./fletscriber.js');

/**
 * Class for handling all interactions with external APIs.
 * ex. Twitch auth and data API, Google data API
 */
module.exports = class Fletalytics {
    /**
     * @param {object} chat_client tmi.js Client object
     */
    constructor(chat_client) {
        this.fletscriber = new Fletscriber(chat_client);
        this.so_channels = {};
    }

    /**
     * Retrieve a link to a Twitch authorization page to provide Fletbot permissions to access event stream for channel
     * @param {string} channel Channel name
     * @returns {string} Link to authorization page
     */
    get_permit_link(channel) {
        // TODO: if this ever actually sees proper use, add option to specify permission scopes
        return "https://id.twitch.tv/oauth2/authorize" +
            `?client_id=${credentials.get_client_id()}` +
            "&redirect_uri=http://localhost" +
            "&response_type=code" +
            "&scope=channel:read:redemptions" +
            "&force_verify=true" +
            `&state=${channel}#${Date.now().toString(36)}`;
    }

    /**
     * Generate API access tokens to allow access to channel's event stream, store to credentials
     * @param {string} channel Channel name
     * @param {string} code Code used to genereate OAuth token, provided from authorization page
     */
    async add_permit(channel, code) {
        const access_code = code.split('&')[0];
        const response = await axios({
            method: 'post',
            url: "https://id.twitch.tv/oauth2/token" +
                `?client_id=${credentials.get_client_id()}` +
                `&client_secret=${credentials.get_client_secret()}` +
                `&code=${access_code}` +
                "&grant_type=authorization_code" +
                "&redirect_uri=http://localhost"
        });
        credentials.update_access_tokens(channel, response.data);
    }

    /**
     * Remove permission to access a channel's event stream
     * @param {string} channel Channel name
     */
    async remove_permit(channel) {
        await this.fletscriber.unsubscribe(channel);
        credentials.remove_tokens(channel);
    }

    /**
     * Retrieve a link to a user's (300px x 300px) Twitch profile picture
     * @param {string} username Username
     * @returns {Promise<string?>} Link to profile picture, or null if specified user does not exist
     */
    async get_pfp(username) {
        let channel_id;
        if(!username) {
            return "Invalid username provided"
        } else if(username.startsWith("#") || username.startsWith("@")) {
            channel_id = username.slice(1);
        } else {
            channel_id = username;
        }
        const channel_data = await this._get_user(channel_id);
        return (channel_data ? channel_data.profile_image_url : null);
    }

    /**
     * Set up listener for specified channel's event stream
     * @param {string} channel Channel name
     * @returns {Promise<string>} Result message
     */
    async listen(channel) {
        if(!credentials.get_validated_channels().includes(channel)) {
            return "Fletbot is not permitted to view events on this channel";
        }
        await this.fletscriber.subscribe(channel);
        return "Fletevents are now active";
    }

    /**
     * Stop listening to specified channel's event stream
     * @param {string} channel Channel name
     * @returns {Promise<string>} Result message
     */
    async unlisten(channel) {
        await this.fletscriber.unsubscribe(channel);
        return "Fletevents are now inactive";
    }

    /**
     * Perform a YouTube search, returning a link to the video matching search criteria
     * @param {string} search Search query to provide to YouTube
     * @returns {Promise<string>} YouTube video link
     */
    async get_yt_link(search) {
        logger.log(`Calling YouTube search for "${search}"`);
        const uri = "https://www.googleapis.com/youtube/v3/search" +
            `?key=${credentials.get_google_key()}` +
            "&type=video&part=snippet&maxResults=1" +
            `&q=${encodeURIComponent(search)}`;
        const response = await axios({
            method: 'get',
            url: uri
        });
        const title = response.data.items[0].snippet.title;
        const video_id = response.data.items[0].id.videoId;

        return {
            title: unescape(title),
            url: `https://www.youtube.com/watch?v=${video_id}`
        };
    }

    /**
     * Search a channel for a clip most closely resembling given title
     * @param {string} channel Channel name
     * @param {string} clip_title Title of clip to search for
     * @param {boolean} [threading=true] Whether to spawn a worker thread to search or perform search in main thread
     * @returns {Promise<string>} Clip link
     */
    async get_clip_link(channel, clip_title, threading = true) {
        logger.log(`Search for clip [${clip_title}] under ${channel}, threading: ${threading}`);

        const client_id = credentials.get_client_id();
        const default_token = await credentials.get_default_access_token();

        const channel_name = (channel.startsWith("@") ? channel.slice(1) : channel);
        const res = await axios({
            method: 'get',
            url: `https://api.twitch.tv/helix/users?login=${channel_name}`,
            headers: {
                'client-id': client_id,
                'Authorization': `Bearer ${default_token}`
            }
        });
        const channel_id = res.data.data[0].id;

        if(threading) {
            const worker = new Worker('./workers/clip_searcher.js');
            const search_promise = new Promise((resolve, reject) => {
                worker.on('message', (message) => {
                    logger.log(message);
                    worker.terminate();
                    resolve(message);
                });
                worker.on('error', (err) => {
                    reject(err);
                });
                worker.on('exit', (exit_code) => {
                    if(exit_code != 0) {
                        reject(`Worker exited with code ${exit_code}`);
                    }
                })
            });

            worker.postMessage({
                client_id: client_id,
                token: default_token,
                channel: channel_id,
                clip_title: clip_title
            });

            const clip = await search_promise;
            worker.terminate();
            return clip;
        } else {
            return await clip_search(
                client_id,
                default_token,
                channel_id,
                clip_title
            );
        }
    }

    /**
     * Add channel to list of channels to auto-so for
     * @param {string} channel Channel name
     * @param {boolean} active Whether shoutouts should be active for specified channel
     */
    set_shoutout_channel(channel, active) {
        if(active) {
            this.so_channels[channel] = true;
        } else {
            delete this.so_channels[channel];
        }
        logger.log(`Shoutout update for ${channel}`, this.so_channels);
    }

    /**
     * "Shoutout" a specified user
     * @param {string} channel Channel name
     * @param {string} username Username
     * @param {number} [delay=3000] Time in milliseconds to wait before returning shoutout
     * @returns {Promise<string?>} String for user's shoutout
     */
    async shoutout(channel, username, delay = 3000) {
        // TODO: might update this if a need arises for a custom SO message. For now, just use channel's SO command
        if(this.so_channels[channel]) {
            await new Promise((resolve, reject) => {
                setTimeout(() => resolve(), delay);
            })
            return `!so @${username}`;
        }
    }

    /**
     * Get Twitch user data
     * @private
     * @param {string} username Username
     * @returns {Promise<object?>} User data object
     */
    async _get_user(username) {
        const default_token = await credentials.get_default_access_token();
        const response = await axios({
            method: 'get',
            url: `https://api.twitch.tv/helix/users?login=${username}`,
            headers: {
                'client-id': credentials.get_client_id(),
                'Authorization': `Bearer ${default_token}`
            }
        });
        return response.data.data[0];
    }
}
