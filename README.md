# Fletbot
## Setup
### Requirements
* [node.js](https://nodejs.org/en/) (12+)
* [npm](https://www.npmjs.com/)
### Auth
- Chatbots require a valid OAuth tokens to authenticate against Twitch
- Token can be generated [here](https://twitchapps.com/tmi/)
- Additionally, a client ID and client secret are required which are generated [when the application is registered](https://dev.twitch.tv/dashboard/apps/create)
- Save these 3 fields to a file called `resources/auth.json`. JSON file should be an object structured as:  
```{"client_id": <Client ID>, "api_secret": <Client Secret>, "oauth_token": <OAuth Token>}```

## Usage
### Running
- Run Fletbot with the following command:
 ```npm run fletbot channels=<comma-separated list of channels> metrics=<metrics datasource: console|postgres> backup=<backup datasource: file|postgres>```
  - ex.
   ```npm run fletbot channels=fletman795,fletbot795 metrics=postgres backup=file```
### Joining Channels
- Once active, Fletbot can join/leave any channel through a whispered command:
  - `!fletjoin <channel name>` to have Fletbot join a specified channel
  - `!fletleave <channel name>` to have Fletbot leave specified channel
  - NOTE: this command can only be performed by a Fletbot owner

### Commands
- `!flethelp`: List available Fletbot commands | `!flethelp <command>`: Get a description for the specified Fletbot command
  - Example: `!flethelp !fletpet`
- `!fletsetroles <command> <list of roles>`: Set the roles that can use specified command as a space-delimited list
  - Valid roles are broadcaster, moderator, vip, subscriber, all, default
  - Special roles "all" and "default" cannot be specified alongside other roles
  - Example: `!fletsetroles !fletclip vip moderator`
- `!fletgetroles <command>`: Get the list of roles that can use the specified command
  - Example: `!fletgetroles !fso`
- `!fcooldown <command> <cooldown time>`:  When cooldown time is not provided, returns the current cooldown setting for a specified command. When cooldown time is provided, sets cooldown time (in seconds) for given command
  - Example: `!fcooldown !sip`
  - Example: `!fcooldown !sip 5`
- `!fletage <hours> <ban | timeout>`: For channels where security measures are enabled: set the minimum required account age (in hours) for users in chat. Accounts below the threshold are either banned or timed out until their age meets the threshold depending on which flag is specified
  - Age threshold defaults to 0 hours (disabled)
  - Mod action defaults to timeout when flag is omitted
  - Example: `!fletage 24 ban`
- `!fcancel <username> <true | false>`: Allow/deny a specified user access to Fletbot commands
  - Example: `!fcancel mrguybrush true`
- `!fletbot`: Ping Fletbot
  - Example: `!fletbot`
- `!fletpet`: Show Fletbot some affection
  - Example: `!fletpet`
- `!fletinc`: #sponsored ad read
  - Example: `!fletinc`
- `!otd`: Part of every pro streamer's balanced diet
  - Example: `!otd`
- `!fso <username>`: Shoutout a specified user (requires moderator role)
  - Example: `!fso @fletbot795`
- `!fletso <active | inactive> <fso>`: Enable/disable automatic shoutouts when being raided.
  - If optional 'fso' flag is provided, '!fso' shoutout is used instead of channel's '!so' shoutout command
  - Example: `!fletso active fso`
- `!sipprofile <set | list | delete> <profile name>`: Create, list, or delete profiles that can be used to track multiple sip counters simultaneously
  - 'set' flag will change the active profile, creating a new one of if it doesn't exist. A channel can have a max of 10 profiles
    - Example: `!sipprofile set halo`
  - 'delete' flag will delete a specified profile. If the deleted profile was the active profile, the default profile becomes the active one
    - Example: `!sipprofile delete halo`
  - 'list' flag will list all of a channel's profiles, as well as the currently active profile
    - Example: `!sipprofile list`
- `!sip`: Increment sip counter
  - Example: `!sip`
- `!setsips <number>`: Set sip count to specified number
  - Example: `!setsips 50`
- `!getsips`: Get current sip count
  - Example: `!getsips`
- `!fletscrew <off | normal | max>`: Set anti-pyramid mode
  - 'off' flag disables pyramid countermeasures
  - 'normal' flag sets Fletbot to interrupt pyramids
  - 'max' flag will set Fletbot to time out pyramid makers. (requires moderator role for Fletbot)
  - Example: `!fletscrew max`
- `!fletpfp <username>`: Get a user's profile picture
  - Example: `!fletpfp @fletbot795`
- `!fletmote <username> <emote code>`: Get a channel's SUB emote as an image
  - NOTE: Only works for sub emotes, not bit emotes
  - Example: `!fletmote ti8ick ti8ickTibStalk`
- `!fletclip <channel name> <clip name>`: Search given channel for a clip whose title most closely resembles the provided clip name
  - Example: `!fletclip @ti8ick called out`
  - If the given title is '*', this will return a random clip from the channel's top 100 clips
    - Example: `!fletclip @ti8ick *`
  - This command can also be used in longform by providing at least one of two flags: `--title` and `--game`.
    - When `--title` is provided by itself, it will behave similarly to the above functionality
    - When `--game` is provided by itself, a random clip from the specified channel will be retrieved featuring the specified game
    - When both flags are provided, clips will be filtered by both title and game
    - Example: `!fletclip @ti8ick --title called out`
    - Example: `!fletclip @ti8ick --game dragon age: origins`
    - Example: `!fletclip @ti8ick --game mass effect --title nobody is safe`
- `!fletyt <query>`: Search YouTube for a video using the provided query
  - Example: `!fletyt Boston Dynamics`
- `!fletify <query>`: Search Spotify for a track or podcast using the provided query
  - Example: `!fletify My Heart Will Go On`
  - NOTE: In order to search for podcast episodes, query must end with `episode <number>` format
    - Note that other variations of "episode" are also accepted:
        - episode
        - ep
        - ep.
- `!flettimer <value> <unit> <message>`: Set a new timer, or check remaining time on an existing timer
  - An optional message can be included to send when the timer has expired
  - Valid time units are millisecond, second, minute, hour
  - Example: `!flettimer 10 seconds Dragon's Dogma 2 has released`
- `!fletchat <prompt>`: Send a prompt to OpenAI chat
  - Multi-message conversations are not currently supported
  - Example `!fletchat What is Dragon's Dogma 2?`
  - Note that OpenAI charges for API usage, so use this command responsibly
- `!fletlog`: View changelog and preview some fancy new (potential) features coming soon™
  - Example: `!fletlog`

### Bot Protection
Channels can opt in/out from Fletbot's bot account protection system. Bot usernames are periodically pulled from a maintaned list and banned from every channel where the protection is active.
- Opt in: Whisper `!fletprotect <channel name>`
- Opt out: Whisper `!fletunprotect <channel name>`
- Note: opt in/out commands are currently only available to bot owners