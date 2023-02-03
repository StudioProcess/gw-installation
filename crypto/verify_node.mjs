import { createVerify, getCurves, getHashes, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

import files from './files.mjs';

// console.log(getCurves());
// console.log(getHashes());

// Note: named curve info is contained in public key
// const config = { hash: 'sha256' };
const config = { hash: 'sha384' };
// const config = { hash: 'sha512' };

const public_key = readFileSync('./public_key.pem', 'utf8');
const sig = readFileSync('./signature.base64', 'utf8');
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
