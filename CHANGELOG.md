# Fletbot Changelog

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