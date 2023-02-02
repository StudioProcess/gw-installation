import { generateKeyPairSync, createSign, getCurves, getHashes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import files from './files.mjs';

const named_curve = 'prime256v1';
const hash = 'sha256';

const pair = generateKeyPairSync('ec', {
    namedCurve: named_curve,
    publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
    },
    privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
    },
});

console.log(pair);
// console.log(files);

const sign = createSign(hash);

for (let file of files) {
    console.log('signing', file);
    const buffer = readFileSync(file);
    sign.update(buffer);
}

const sig = sign.sign(pair.privateKey, 'base64');
console.log(sig);

writeFileSync(`public_key.pem`, pair.publicKey);
writeFileSync(`private_key.pem`, pair.privateKey);
writeFileSync(`signature.base64`, sig);