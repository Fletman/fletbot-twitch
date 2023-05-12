# Fletbot Changelog

## May 11 2023

### Features

#### Fletchat
- Added !fletchat command for integration with OpenAI: `gpt-3.5-turbo`
- Example: `!fletchat What is Dragon's Dogma 2?`

#### Flettimer
- Added !flettimer command for creating a message on a timer
- Example `!flettimer 10 seconds Dragon's Dogma 2 has released`

## January 23 2023

### Features

#### Spotify
- Added !fletify command for retrieving tracks and podcasts from Spotify
  - Example: `!fletify My Heart Will Go On`
  - By default, queries will be used against Spotify tracks & songs. To search for podcasts, queries must end with `episode <number>` format
    - Example: `!fletify On The Wrong Page episode 1`
    - Note that other variations of "episode" are also accepted:
      - episode
      - ep
      - ep.

## September 10 2022

### Features

#### Fletclip
- Updated !fletclip command with functionality to filter clips by game
- Added `--title` and `--game` flags to !fletclip command for specifying filters
  - When `--title` is provided by itself, it will behave similarly to the above functionality
  - When `--game` is provided by itself, a random clip from the specified channel will be retrieved featuring the specified game
  - When both flags are provided, clips will be filtered by both title and game
- Example: `!fletclip @ti8ick --game mass effect --title nobody is safe`

## July 22 2022

### Features

#### Fletlog
- Added !fletlog command to point to changelog

#### Sip Profile
- !sipprofile now supports all other sip commands (!sip, !setsips, !getsips) as actions to manage other profiles without needing to switch back and forth.
  - Examples:
    - `!sipprofile setsips other_profile 34` can be used to set the sip counter of `other_profile` even when that profile is not the current active profile
    - `!sipprofile getsips this_profile` can be used to check the sip count of `this_profile` without setting that profile active first

### Changed
- Deprecated !fletpermit and !fletunpermit commands
- Deprecated !fletevents command