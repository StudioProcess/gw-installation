import { generateKeyPairSync, createSign, getCurves, getHashes, createPrivateKey } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import files from './files.mjs';

// const config = { named_curve: 'prime256v1', hash: 'sha256' };
const config = { named_curve: 'secp384r1', hash: 'sha384' };
// const config = { named_curve: 'secp521r1', hash: 'sha512' };

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
    writeFileSync(`private_key.pem`, pair.privateKey);
    private_key = pair.privateKey;
    console.log("Key pair generated:", pair);
}

const timestamp = new Date().toISOString();
writeFileSync('signature.timestamp', timestamp);
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

writeFileSync(`signature.base64`, sig);