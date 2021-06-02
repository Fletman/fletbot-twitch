"use strict";

const fs = require('fs');
const path_resolve = require('path').resolve;

const sip_file = './data/sips.json';
if(fs.existsSync(sip_file)) {
    console.log(`Converting sip file at ${sip_file}`);
    const sip_map = JSON.parse(fs.readFileSync(sip_file));
    for(const channel in sip_map) {
        sip_map[channel] = {
            active_profile: 'default',
            profiles: {
                'default': sip_map[channel]
            }
        }
        console.log(`Updated channel ${channel}`);
    }
    fs.writeFileSync(sip_file, JSON.stringify(sip_map));
    console.log(`Updated file saved to ${path_resolve(sip_file)}`);
} else {
    logger.log(`No file found at ${path_resolve(sip_file)}`);
}