#!/usr/bin/env node

// Sign files using ECDSA
// Can be verified using the verification tool ./verify/index.html
// 
// Usage:
// ./sign_node.mjs [options] [<folder to sign>]
//
// Options:
// -u, --update            Update sitemap
// -i, --ignore <pattern>  Comma separated ignore pattern for sitemap update

import { generateKeyPairSync, createSign, getCurves, getHashes, createPrivateKey } from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

// const config = { named_curve: 'prime256v1', hash: 'sha256' };
const config = { named_curve: 'secp384r1', hash: 'sha384' };
// const config = { named_curve: 'secp521r1', hash: 'sha512' };

const SIGINFO     = 'siginfo.json';
const PRIVATE_KEY = 'private_key.pem';
const PUBLIC_KEY  = 'public_key.pem';
const SIGNATURE   = 'signature.base64';
const TIMESTAMP   = 'signature.timestamp';


function parse_args(argv = process.argv) {
    argv = argv.slice(2); // remove node binary and script
    const flags = {};
    const args = [];
    let next_flag;
    for (const arg of argv) {
        if (next_flag) {
            flags[next_flag] = arg;
            next_flag = undefined;
        } else if (arg.startsWith('-i') || arg.startsWith('--ignore')) {
            next_flag = arg;
        }  else if (arg.startsWith('-') || arg.startsWith('--')) {
            flags[arg] = true;
        } else {
            args.push(arg);
        }
    }
    return { flags, args };
}


// Get folder to sign
const args = parse_args();
let folder = args.args[0];
if (folder) {
    if (!path.isAbsolute(folder)) {
        folder = path.join(process.cwd(), folder); // relative to working dir
    }
} else {
    folder = path.join(path.dirname(process.argv[1]), '../'); // default to ../ relative to this script
}
process.chdir(path.dirname(process.argv[1])); // set working dir to script dir
console.log('Signing folder:', folder);


// Get list of files to sign (from siginfo.json)
const siginfo_path = path.join(folder, SIGINFO);
let siginfo;
let new_siginfo = false;
try {
    siginfo = readFileSync(siginfo_path);
    siginfo = JSON.parse(siginfo);
} catch {
    console.log('Cannot load siginfo. Creating', siginfo_path);
    siginfo = {
        "version": 1,
        "sitemap": [
            SIGINFO,
            TIMESTAMP,
        ],
        "metadata": {
            "title": "New Project",
            "author": "Process Studio",
            "image_url": null
        },
        "timestamp_url": TIMESTAMP,
        "signature_url": SIGNATURE,
    };
    new_siginfo = true;
    writeFileSync(siginfo_path, JSON.stringify(siginfo, null, 4));
}


// Update siginfo (when flag is used or new siginfo was generated)
if (args.flags['-u'] || args.flags['--update'] || new_siginfo) {
    console.log('Updating sitemap');
    const ignore_flag = args.flags['-i'] || args.flags['--ignore'];
    let ignore = [];
    if (ignore_flag) {
        ignore = ignore_flag.split(/[,]+/);
        console.log('Ignoring:', ignore.join(', '));
    }
    let files = await glob('**/*', { cwd: folder, dot: true, ignore: ['**/.DS_Store', siginfo.signature_url, ...ignore] });
    files = files.filter(f => statSync(path.join(folder, f)).isFile()); // only folders
    files.reverse();
    if (new_siginfo) { // update sitemap
        siginfo.sitemap = Array.from( new Set([...siginfo.sitemap, ...files]) );
    } else { // overwrite sitemap
        siginfo.sitemap = files;
    }
    writeFileSync(siginfo_path, JSON.stringify(siginfo, null, 4));
}

// sitemap to full file paths
const files = siginfo.sitemap.map(f => path.join(folder, f));


// load private key
// if file not found, generated new key pair
let private_key;
try {
    private_key = readFileSync(PRIVATE_KEY, 'utf8');
} catch {
    const pair = generateKeyPairSync('ec', {
        namedCurve: config.named_curve,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
        },
    });
    writeFileSync(PUBLIC_KEY, pair.publicKey);
    writeFileSync(`../verify/${PUBLIC_KEY}`, pair.publicKey); // also copy pyblic key to verify folder
    writeFileSync(PRIVATE_KEY, pair.privateKey);
    private_key = pair.privateKey;
    console.log('Key pair generated:', pair);
}

const timestamp = new Date().toISOString();
writeFileSync(path.join(folder, siginfo.timestamp_url), timestamp);
console.log('Timestamp:', timestamp);

const sign = createSign(config.hash);

console.log('Files to sign:', files.length);
let length = 0;
for (let file of files) {
    console.log('Signing:', file);
    const buffer = readFileSync(file);
    length += buffer.length;
    sign.update(buffer);
}
console.log('Signed bytes:', length);

const key_object = createPrivateKey(private_key);
key_object.dsaEncoding = 'ieee-p1363'; // This signature format is required for Web Cryptography API
const sig = sign.sign(key_object, 'base64');
console.log('Signature:');
console.log(sig);

writeFileSync(path.join(folder, siginfo.signature_url), sig);