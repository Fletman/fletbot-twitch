"use strict";

const { parentPort } = require('worker_threads');
const axios = require('axios');
const fs = require('fs');
const credentials = require('../modules/credentials.js');

parentPort.on('message', (params) => {
    fs.readFile(params.mod_data_file, 'utf8', (error, str_data) => {
        if(error) {
            throw (error);
        }
        const mod_data = JSON.parse(str_data);
        credentials.get_google_access_token()
            .then((access_token) => {
                // TODO: once API for banning terms is exposed, update this to include blocking terms as part of ban wave
                const user_doc_requests = mod_data.user_ban_docs.map((doc_data) => fetch_doc(access_token, doc_data));
                Promise.all(user_doc_requests)
                    .then((doc_lines) => {
                        parentPort.postMessage({
                            user_ban_list: [...new Set(doc_lines.flat())]
                        });
                    }).catch((err) => {
                        throw (err);
                    })
            })

    });
});

/**
 * 
 * @param {Object} g_doc Google Document object
 * @returns {Array<string>} list of lines in doc
 */
function get_doc_lines(g_doc) {
    const doc_lines = [];
    const doc_elements = g_doc.body.content;
    for(const value of doc_elements) {
        if('paragraph' in value) {
            for(const p_elem of value.paragraph.elements) {
                if(p_elem.textRun) {
                    const raw_text = p_elem.textRun.content.trim();
                    if(raw_text.length > 0) {
                        doc_lines.push(raw_text);
                    }
                }
            }
        }
    }
    return doc_lines;
}

/**
 * 
 * @param {Object} g_sheet Google Spreadsheet objects
 * @returns {Array<string>} list of strings from sheet cells
 */
function get_sheet_lines(g_sheet) {
    const cell_list = [];
    const sheet = g_sheet.sheets[0];
    const rows = sheet.data[0].rowData;
    for(const row of rows) {
        if(row.values && row.values[0] && row.values[0].effectiveValue) {
            cell_list.push(row.values[0].effectiveValue.stringValue);
        }
    }
    return cell_list;
}

async function fetch_doc(access_token, doc_data) {
    let uri;
    let parse_func;
    switch (doc_data.ban_doc_type) {
        case "doc":
            uri = `https://docs.googleapis.com/v1/documents/${doc_data.ban_doc_id}?key=${credentials.get_google_key()}`;
            parse_func = get_doc_lines;
            break;
        case "sheet":
            uri = `https://sheets.googleapis.com/v4/spreadsheets/${doc_data.ban_doc_id}?key=${credentials.get_google_key()}&ranges=${doc_data.data_range}&includeGridData=true`;
            parse_func = get_sheet_lines;
            break;
        default:
            throw (`Unrecognized doc type ${doc_data.ban_doc_type}`);
    }
    const response = await axios({
        url: uri,
        method: 'get',
        headers: {
            'Authorization': `Bearer ${access_token}`
        }
    });
    return parse_func(response.data);
}
