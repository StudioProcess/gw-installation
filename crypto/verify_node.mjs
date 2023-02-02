import { createVerify, getCurves, getHashes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import files from './files.mjs';

// console.log(getCurves());
// console.log(getHashes());

// Note: named curve info is contained in public key
const hash = 'sha256';

const publicKey = readFileSync('./public_key.pem', 'utf8');
const sig = readFileSync('./signature.base64', 'utf8');

// console.log(sig);
// process.exit();
// console.log(publicKey);

const verify = createVerify(hash);

for (let file of files) {
    console.log('verifying', file);
    const buffer = readFileSync(file);
    verify.update(buffer);
}

const verified = verify.verify(publicKey, sig, 'base64');

console.log(verified);
