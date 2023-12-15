"use strict";

const axios = require('axios');
const unescape = require('unescape');
const { Worker } = require('worker_threads');
const { Readable } = require('stream');
const clip_searcher = require('./clip_search.js');
const credentials = require('./credentials.js');
const logger = require('./fletlog.js');
const Fletscriber = require('./fletscriber.js');

const second_ms = 1000;
const minute_ms = second_ms * 60;
const hour_ms = minute_ms * 60;
const day_ms = hour_ms * 24;
const month_ms = day_ms * 30;
const year_ms = month_ms * 12; // this and month aren't totally accurate but considering I'm rounding eh it's good enough

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
        const channel_data = await this.get_user(channel_id);
        return (channel_data ? channel_data.profile_image_url : null);
    }

    /**
     * Retrieve link to a channel's emote image
     * @param {string} channel Channel name
     * @param {string} emote_code Emote code
     * @returns {string?} URL to emote image, or null if no image could be found for code
     */
    async get_emote(channel, emote_code) {
        const channel_name = (channel.startsWith("@") ? channel.slice(1) : channel);
        const channel_data = await this.get_user(channel_name);
        if(!channel_data) {
            return null;
        }
        try {
            const response = await axios({
                method: 'get',
                url: `https://api.twitchemotes.com/api/v4/channels/${channel_data.id}`
            });
            let emote_obj
            if(response.data.emotes) {
                emote_obj = response.data.emotes.find((emote) => emote.code.toLowerCase() === emote_code)
            }
            if(!emote_obj) {
                return null;
            }
            return `https://static-cdn.jtvnw.net/emoticons/v2/${emote_obj.id}/default/light/3.0`;
        } catch (e) {
            if(e.response.data.error === 'Channel not found') {
                return `${channel_data.display_name} has not registered their emotes`;
            }
        }
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
     * @returns {Promise<Object?>} Object containing YouTube video info: title (string), url (string) or returns null if no video could be found
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
        if(response.data.items.length > 0) {
            const title = response.data.items[0].snippet.title;
            const video_id = response.data.items[0].id.videoId;
            return {
                title: unescape(title),
                url: `https://www.youtube.com/watch?v=${video_id}`
            };
        }
        return null;
    }

    /**
     * Perform a Spotify search, returning a link to the track matching the search criteria
     * @param {string} search Search query to provide to Spotify
     * @returns {Promise<Object>} Object containing Spotify track info: artist (string), name (string), link (string)
     */
    async get_spotify_track(search) {
        const episode_regex = /.+\s+((episode|ep\.?)\s*\d+(\.(\d+))?)$/gm; // query is considered a podcast episode search if it ends with "episode <number>" format
        const search_type = episode_regex.test(search) ? 'episode' : 'track';
        logger.log(`Calling Spotify search for "${search}" using type: ${search_type}`);

        const url = `https://api.spotify.com/v1/search?type=${search_type}&limit=1&q=${search}`;
        const search_f = async () => {
            const list_response = await axios({
                method: 'get',
                url,
                headers: { 'Authorization': `Bearer ${credentials.get_spotify_access_token()}` }
            });
            switch(search_type) {
                case 'track':
                    const lr = list_response.data.tracks.items[0];
                    return {
                        artist: lr.artists[0].name,
                        name: lr.name,
                        link: lr.external_urls.spotify
                    };
                case 'episode':
                    const ep_response = await axios({
                        method: 'get',
                        url: list_response.data[`${search_type}s`].items[0].href,
                        headers: { 'Authorization': `Bearer ${credentials.get_spotify_access_token()}` }
                    });
                    const er = ep_response.data;
                    return {
                        artist: er.show.publisher,
                        name: `${er.show.name}: ${er.name}`,
                        link: er.external_urls.spotify
                    }
                default:
                    throw(`Unknown search type ${search_type}`);
            }
        };

        try {
            return await search_f();
        } catch(e) {
            if(e.response && e.response.status === 401) {
                await credentials.refresh_spotify_token();
                return await search_f();
            } else {
                throw(e);
            }
        }
    }

    /**
     * Search a channel for a clip most closely resembling given title
     * @param {string} channel Channel name
     * @param {string} clip_args String form of args to use in search
     * @param {boolean} [threading=true] Whether to spawn a worker thread to search or perform search in main thread
     * @returns {Promise<string>} Clip link
     */
    async get_clip_link(channel, clip_args, threading = true) {
        const args = this._parse_arg_str(clip_args);
        let clip_title = args['title'];
        const clip_game = args['game'];

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
        if(res.data.data.length == 0) { return null; }
        const channel_id = res.data.data[0].id;

        let search_params;

        if((!clip_title && !clip_game) || (clip_title && !clip_game)) { // search for clip via title only. If no longform args provided, assume full arg is title
            clip_title = clip_title || clip_args;
            search_params = {
                search_type: 'title',
                title: clip_title
            };
        }  else if(!clip_title && clip_game) { // clip game provided without title, pull random clip from game
            const game = await this.get_game(clip_game);
            if(!game) { return null; }
            search_params = {
                search_type: 'game',
                game: game
            };
        } else { // filter clips by both title and game
            const game = await this.get_game(clip_game);
            if(!game) { return null; }
            search_params = {
                search_type: 'full',
                title: clip_title,
                game: game
            };
        }

        logger.log(`Clip search in channel ${channel}`, search_params);

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
                });
            });

            worker.postMessage({
                client_id: client_id,
                token: default_token,
                channel: channel_id,
                search_params: search_params
            });

            const clip = await search_promise;
            worker.terminate();
            return clip;
        } else {
            return clip_title === '*' ?
                await clip_searcher.random_clip(
                    client_id,
                    default_token,
                    channel_id,
                    search_params.game
                ) :
                await clip_searcher.clip_search(
                    client_id,
                    default_token,
                    channel_id,
                    search_params
                );
        }
    }

    /**
     * Send a prompt to OpenAI chat, returning the AI response
     * @param {string} username Name of user prompting AI
     * @param {string} prompt Prompt to send
     * @param {number?} tokens Optional, max tokens for prompt. Defaults to 100 when unspecified
     * @param {number?} character_limit Optional limit on the number of characters in the AI response. Defaults to 400. Ignored when set to 0
     */
    async ai_prompt(username, prompt, tokens = 100, character_limit = 400) {
        const response = await axios({
            method: 'post',
            url: 'https://api.openai.com/v1/chat/completions',
            responseType: 'stream',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${credentials.get_openai_key()}`
            },
            data: {
                model: 'gpt-4-1106-preview',
                top_p: 1,
                max_tokens: tokens,
                stream: true,
                messages: [{
                    name: username,
                    role: "user",
                    content: character_limit > 0 ? `${prompt} in under ${character_limit} characters` : prompt
                }]
            }
        });
        const stream = response.data;
        const output_buffer = await this.parse_sse_stream(stream);
        const fluff_strs = [
            'As an AI language model, ',
            "I'm sorry, but as an AI language model, "
        ];
        let output_str = output_buffer.join('').replaceAll("\n", " | ");
        for(const fluff of fluff_strs) {
            if(output_str.startsWith(fluff)) {
                output_str = output_str.substring(fluff.length);
                break;
            }
        }
        return output_str;
    }

    /**
     * "Shoutout" a user, returning a string containing link to user's channel and their last played game
     * @param {string} username Username
     * @returns {Promise<string>} String for user's shoutout
     */
    async shoutout(username) {
        const channel_name = (username.startsWith("@") ? username.slice(1) : username);
        const channel_data = await this._get_channel(channel_name);
        let so_msg;
        if(!channel_data) {
            so_msg = `couldn't find anything for channel "${channel_name}"`;
        } else if(channel_data.channel.game_name) {
            so_msg = `check out ${channel_data.channel.broadcaster_name} over at https://www.twitch.tv/${channel_name} !`;
            so_msg += ` They ${channel_data.stream ? "are live 🔴 RIGHT NOW 🔴 streaming " + channel_data.channel.game_name : "were last streaming " + channel_data.channel.game_name}`;
            if(channel_data.channel.title) {
                so_msg += `, doing "${channel_data.channel.title}"`;
            }
            if(!channel_data.stream && channel_data.vod) {
                so_msg += `, last active ${this._time_diff(channel_data.vod.created_at)}`;
            }
        } else if(channel_data.channel.title) {
            so_msg = `check out ${channel_data.channel.broadcaster_name} over at https://www.twitch.tv/${channel_name} ! Not sure what they're playing but `;
            so_msg += channel_data.live ? `they're live 🔴 RIGHT NOW 🔴 doing "${channel_data.channel.title}"` : `their last stream was "${channel_data.channel.title}"`;
            if(!channel_data.stream && channel_data.vod) {
                so_msg += `, last active ${this._time_diff(channel_data.vod.created_at)}`;
            }
        } else {
            so_msg = `it doesn't look like ${channel_data.channel.broadcaster_name} streams, but check them out anyway over at https://twitch.tv/${channel_name} !`;
        }
        return `/me Bleep bloop ${so_msg}`;
    }

    /**
     * Automatically shoutout a specified user, either using channel's shoutout command or Fletbot shoutout
     * @param {string} username Username
     * @param {Object} so_type Type of shoutout to perform. If so_type.fso is set to true, uses builtin shoutout, otherwise uses !so command
     * @param {number} [delay=3000] Time in milliseconds to wait before returning shoutout
     * @returns {Promise<string?>} String for user's shoutout
     */
    async auto_shoutout(username, so_type, delay = 3000) {
        await new Promise((resolve, reject) => {
            setTimeout(() => resolve(), delay);
        });
        if(so_type.fso) {
            return await this.shoutout(username);
        } else {
            return `!so @${username}`;
        }
    }

    /**
     * Get Twitch user data
     * @private
     * @param {string} username Username
     * @returns {Promise<object?>} User data object
     */
    async get_user(username) {
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

    /**
     * Get Twitch channel data
     * @private
     * @param {string} channel Channel name
     * @returns {Promise<object?>} Channel data object
     */
    async _get_channel(channel) {
        const user_data = await this.get_user(channel);
        if(!user_data || !user_data.id) {
            return null;
        }
        const default_token = await credentials.get_default_access_token();
        const channel_req = axios({
            method: 'get',
            url: `https://api.twitch.tv/helix/channels?broadcaster_id=${user_data.id}`,
            headers: {
                'client-id': credentials.get_client_id(),
                'Authorization': `Bearer ${default_token}`
            }
        });
        const stream_req = axios({
            method: 'get',
            url: `https://api.twitch.tv/helix/streams?user_id=${user_data.id}`,
            headers: {
                'client-id': credentials.get_client_id(),
                'Authorization': `Bearer ${default_token}`
            }
        });
        const vod_req = axios({
            method: 'get',
            url: `https://api.twitch.tv/helix/videos?user_id=${user_data.id}`,
            headers: {
                'client-id': credentials.get_client_id(),
                'Authorization': `Bearer ${default_token}`
            }
        });
        const channel_data = await channel_req;
        const streams_data = await stream_req;
        const vod_data = await vod_req;
        return {
            channel: channel_data.data.data[0],
            stream: streams_data.data.data.length === 0 ? null : streams_data.data.data[0],
            vod: vod_data.data.data.length === 0 ? null : vod_data.data.data[0]
        };
    }

    /**
     * Get Twitch game data
     * @param {string} game // Game name
     * @returns {Promise<object?>} Game data object
     */
    async get_game(game) {
        const default_token = await credentials.get_default_access_token();
        const response = await axios({
            method: 'get',
                url: `https://api.twitch.tv/helix/games?name=${game}`,
                headers: {
                    'client-id': credentials.get_client_id(),
                    'Authorization': `Bearer ${default_token}`
                }
        });
        return response.data.data[0];
    }

    /**
     * Generate a string of difference between current and time and provided timestamp
     * @param {string} timestamp_str String of timestamp of date to find difference from current time
     * @returns {string} Time difference
     */
    _time_diff(timestamp_str, offset = 0) {
        const date_diff = Date.now() - Date.parse(timestamp_str);
        const diff = {
            divide: null,
            str: null
        };
        if(date_diff < minute_ms) {
            diff.divide = second_ms;
            diff.str = "second";
        } else if(date_diff < hour_ms) {
            diff.divide = minute_ms;
            diff.str = "minute";
        } else if(date_diff < day_ms) {
            diff.divide = hour_ms;
            diff.str = "hour";
        } else if(date_diff < month_ms) {
            diff.divide = day_ms;
            diff.str = "day";
        } else if(date_diff < year_ms) {
            diff.divide = month_ms;
            diff.str = "month";
        } else {
            diff.divide = year_ms;
            diff.str = "year";
        }
        const divided_diff = Math.floor(date_diff / diff.divide);
        return `${divided_diff} ${diff.str}${divided_diff > 1 ? "s" : ""} ago`;
    }

    /**
     * Parse string into arg map
     * @private
     * @param {string} arg_str Argument string to parse
     * @returns {Object} Map of args and values
     */
    _parse_arg_str(arg_str) {
        const args = {};
        let index = -1;
        do {
            index = arg_str.indexOf('--', index+1);
            if(index === -1) { break; }
            const arg_name_index_end = arg_str.indexOf(' ', index) !== -1 ? arg_str.indexOf(' ', index) : arg_str.length;
            const arg_val_index_end = arg_str.indexOf('--', arg_name_index_end+1) !== -1 ? arg_str.indexOf('--', arg_name_index_end+1) : arg_str.length;
            const arg_name = arg_str.substring(index+2, arg_name_index_end);
            const arg_val = arg_str.substring(arg_name_index_end+1, arg_val_index_end).trim();
            if(arg_val.length > 0) {
                args[arg_name] = arg_val;
            }
        } while(index !== -1);
        return args;
    }

    /**
     * Parse a data stream into a string
     * @param {Readable} stream Input stream to parse
     * @returns {Promise<string>} String concatenation of stream data
     */
    parse_stream(stream) {
        return new Promise((resolve, reject) => {
            const buffer = [];
            stream.on('data', (data) => {
                const line = new Buffer.from(data).toString();
                buffer.push(line);
            });
            stream.on('end', () => resolve(buffer.join('')));
            stream.on('error', (err) => reject(err));
        });
    }

    /**
     * Parse an SSE stream into an array of strings
     * @param {Readable} stream Input stream to parse
     * @returns {Promise<string[]>} Array of string messages read from stream
     */
    parse_sse_stream(stream) {
        return new Promise((resolve, reject) => {
            const buffer = [];
            stream.on('data', (data) => {
                const data_lines = new Buffer
                    .from(data)
                    .toString()
                    .split('\n')
                    .filter((s) => s.length > 0);
                for(const line of data_lines) {
                    if(line.startsWith('data:') && line !== 'data: [DONE]') {
                        try {
                            const message = JSON.parse(line.substring('data: '.length));
                            buffer.push(message.choices[0].delta.content);
                        } catch(e) {
                            // TODO: for now, ignore error and continue attempting to parse
                        }
                    }
                }
            });
            stream.on('end', () => resolve(buffer.filter((s) => s)));
            stream.on('error', (err) => reject(err));
        });
    }
}