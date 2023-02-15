#!/usr/bin/env node

// Update sitemap in ./siginfo.json

import * as fs from 'node:fs';
import * as path from 'node:path';

const EXCLUDE_START = [ '.git/', '.nova/', 'dist/', 'node_modules/', 'sign/', 'verify/', 'signature.base64', '.eslintrc.json', '.gitignore', '.htaccess' ];
const EXCLUDE_END = [ '.DS_Store' ];

function is_excluded(path) {
    return EXCLUDE_START.some(x => path.startsWith(x))
        || EXCLUDE_END.some(x => path.endsWith(x));
}

function walk(dir) {
    let entries = fs.readdirSync(dir, {withFileTypes: true});
    
    // add paths
    for (let e of entries) {
        e.path = path.join(dir, e.name);
    }
    
    // remove excluded
    entries = entries.filter(x => !is_excluded(x.path));
    
    const out = [];
    
    // files first
    for (let e of entries.filter(x => x.isFile())) {
        out.push(e.path);
    }
    
    // folders last
    for (let e of entries.filter(x => x.isDirectory())) {
        out.push(...walk(e.path));
    }
    
    return out;
}

const files = walk('./');
const siginfo = JSON.parse( fs.readFileSync('./siginfo.json') );
siginfo.sitemap = files;
fs.writeFileSync( './siginfo.json', JSON.stringify(siginfo, null, 4) );
console.log('Updated sitemap:', files.length, 'files');
