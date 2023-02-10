#!/usr/bin/env node

// Sign files using ECDSA
// Can be verified using the verification tool ./verify/index.html
// 
// Usage:
// ./sign_node.js [<folder to sign>]

import { generateKeyPairSync, createSign, getCurves, getHashes, createPrivateKey } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// const config = { named_curve: 'prime256v1', hash: 'sha256' };
const config = { named_curve: 'secp384r1', hash: 'sha384' };
// const config = { named_curve: 'secp521r1', hash: 'sha512' };


// Get list of files to sign (from siginfo.json)
let folder = process.argv[2];
if (folder) {
    if (!path.isAbsolute(folder)) {
        folder = path.join(process.cwd(), process.argv[2]); // relative to working dir
    }
} else {
    folder = path.join(path.dirname(process.argv[1]), '../'); // default to ../ relative to this script
}
process.chdir(path.dirname(process.argv[1])); // set working dir to script dir

console.log('Signing folder:', folder);

const siginfo_path = path.join(folder, './siginfo.json');
let siginfo;
try {
    siginfo = readFileSync(siginfo_path);
    siginfo = JSON.parse(siginfo);
} catch {
    console.log('Cannot load siginfo:', siginfo_path);
}
const files = siginfo.sitemap.map(f => path.join(folder, f));


// load private key
// if file not found, generated new key pair
let private_key;
try {
    private_key = readFileSync('private_key.pem', 'utf8');
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
    writeFileSync(`public_key.pem`, pair.publicKey);
    writeFileSync(`../verify/public_key.pem`, pair.publicKey); // also copy pyblic key to verify folder
    writeFileSync(`private_key.pem`, pair.privateKey);
    private_key = pair.privateKey;
    console.log("Key pair generated:", pair);
}

const timestamp = new Date().toISOString();
writeFileSync(path.join(folder, 'signature.timestamp'), timestamp);
console.log('Timestamp:', timestamp);

const sign = createSign(config.hash);

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

writeFileSync(path.join(folder, 'signature.base64'), sig);