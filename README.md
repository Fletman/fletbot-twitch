# Fletbot
## Setup
### Requirements
* [node.js](https://nodejs.org/en/) (12+)
* [npm](https://www.npmjs.com/)
### Auth
- Chatbots require a valid OAuth tokens to authenticate against Twitch
- Token can be generated [here](https://twitchapps.com/tmi/)

## Usage
### Running
- Run Fletbot with the following command:
 ```npm run fletbot <list of channels to connect to>```
  - ex.
   ```npm run fletbot fletman795 fletbot795```
### Joing Channels
- Once active, Fletbot can join/leave any channel through a whispered command:
  - `!fletjoin <channel name>` to have Fletbot join a specified channel
  - `!fletleave <channel name>` to have Fletbot leave specified channel
  - NOTE: this command can only be performed by a Fletbot owner

### Commands
- `!flethelp`: List available Fletbot commands | `!flethelp <command>`: Get a description for the specified Fletbot command
- `!fletbot`: Ping Fletbot
- `!fletpet`: Show Fletbot some affection
- `!fletinc`: #sponsored ad read
- `!sip`: Increment sip counter
- `!setsips <number>`: Set sip count to specified number
- `!getsips`: Get current sip count
- `!fletscrew <off | normal | max>`: Set anti-pyramid mode
  - 'off' flag disables pyramid countermeasures
  - 'normal' flag sets Fletbot to interrupt pyramids
  - 'max' flag will set Fletbot to time out pyramid makers. (requires moderator role for Fletbot)
- `!fletpfp <username>`: Get a user's profile picture
- `!fletclip <clip name>`: Search current channel for a clip whose title most closely resembles the provided clip name
- `!fletyt <query>`: Search YouTube for a video using the provided query
- `!fletevents <active | inactive>`: enable/disable fletevents such as reactions to channel rewards redemptions or bit cheers
  - Requires permissions to be given prior to use. See !fletpermit for details
- `!fletpermit`: Retrieve a link to a Twitch authorization page to give Fletbot permission to view events on caller's channel
- `!fletunpermit`: Remove Fletbot's permissions to view events of a channel
- `!fletalytics`: View changelog and preview some fancy new (potential) features coming soon™
