#!/usr/bin/env node

// Test to verfiy files signed by ./sign_node.mjs 
// Uses Node's crypto API
// 
// Usage:
// ./verify_node.mjs [<folder to verify>]

import { createVerify, getCurves, getHashes, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// console.log(getCurves());
// console.log(getHashes());

// Note: named curve info is contained in public key
// const config = { hash: 'sha256' };
const config = { hash: 'sha384' };
// const config = { hash: 'sha512' };


// Get list of files to verify (from siginfo.json)
let folder = process.argv[2];
if (folder) {
    if (!path.isAbsolute(folder)) {
        folder = path.join(process.cwd(), process.argv[2]); // relative to working dir
    }
} else {
    folder = path.join(path.dirname(process.argv[1]), '../'); // default to ../ relative to this script
}
process.chdir(path.dirname(process.argv[1])); // set working dir to script dir

console.log('Verifying folder:', folder);
const siginfo_path = path.join(folder, './siginfo.json');
let siginfo;
try {
    siginfo = readFileSync(siginfo_path);
    siginfo = JSON.parse(siginfo);
} catch {
    console.log('Cannot load siginfo:', siginfo_path);
}
const files = siginfo.sitemap.map(f => path.join(folder, f));


const public_key = readFileSync('./public_key.pem', 'utf8');
const sig = readFileSync(path.join(folder, './signature.base64'), 'utf8');
console.log('Signature:', sig);

const verify = createVerify(config.hash);

for (let file of files) {
    console.log('Verifying:', file);
    const buffer = readFileSync(file);
    verify.update(buffer);
}

const key_object = createPublicKey(public_key);
key_object.dsaEncoding = 'ieee-p1363';
const verified = verify.verify(key_object, sig, 'base64');

console.log(verified);
