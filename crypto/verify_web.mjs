// const config = { algorithm: 'ECDSA', named_curve: 'P-256', hash: 'SHA-256' };
const config = { algorithm: 'ECDSA', named_curve: 'P-384', hash: 'SHA-384' };
// const config = { algorithm: 'ECDSA', named_curve: 'P-521', hash: 'SHA-512' };

const FOLDER = '../'; // folder to verify

// Fetch String
async function fetch_text(path) {
    const res = await fetch(path);
    return res.text();
}

// Fetch String
async function fetch_json(path) {
    const res = await fetch(path);
    return res.json();
}

// Fetch ArrayBuffer
async function fetch_ab(path) {
    const res = await fetch(path);
    return res.arrayBuffer();
}

// String to ArrayBuffer
// https://developers.google.com/web/updates/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
function str2ab(str) {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0; i < str.length; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
}

// ArrayBuffer to String
function ab2str(buf) {
    const bufView = new Uint8Array(buf);
    const str = String.fromCharCode(...bufView);
    return str;
}

// ArrayBuffer to base64 String
function ab_to_base64(buf) {
    const binary_str = ab2str(buf);
    return btoa(binary_str);
}

// Base64 String to ArrayBuffer
function base64_to_ab(str) {
    const binary_str = atob(str); // base64 to (binary) string
    return str2ab(binary_str);
}

// Decode PEM format
// Returns: { label: String, data: ArrayBuffer }
// Note: Only returns the first PEM data block
// https://en.wikipedia.org/wiki/Privacy-Enhanced_Mail
// https://www.rfc-editor.org/rfc/rfc7468
function decode_pem(pem_str) {    
    let matches = pem_str.matchAll(/-----BEGIN ([^-]*)-----/gd);
    matches = [...matches];
    if (matches.length == 0) {
        throw "PEM header not found";
    }
    const first_match = matches[0];
    const label = first_match[1];
    const header_end = first_match.indices[0][1];
    
    const footer_start = pem_str.indexOf(`-----END ${label}-----`, header_end + 1)
    if (footer_start === -1) {
        throw `PEM footer not found for header with label ${label}`;
    } 
    let data = pem_str.slice(header_end + 1, footer_start - 1 );
    data = data.replaceAll(/\s+/g, ''); // remove all whitespace
    const decoded_buf = base64_to_ab(data);
    return {
        label,
        data: decoded_buf,
    };
}

// Load public key from PEM file
// Returns: Promise<CryptoKey>
async function load_public_key(path) {
    const pem_text = await fetch_text(path);
    return crypto.subtle.importKey(
        'spki',
        decode_pem(pem_text).data,
        { name: config.algorithm, namedCurve: config.named_curve },
        false, // not extractable
        ['verify']
    );
}

// Load private key from PEM file
// Returns: Promise<CryptoKey>
async function load_private_key(path) {
    const pem_text = await fetch_text(path);
    return crypto.subtle.importKey(
        'pkcs8',
        decode_pem(pem_text).data,
        { name: config.algorithm, namedCurve: config.named_curve },
        false, // not extractable
        ['sign']
    );
}

// Join ArrayBuffers
// Returns: ArrayBuffer
function join_buffers(buffers) {
    const total_length = buffers.reduce((acc, buf) => acc + buf.byteLength, 0);
    const out = new Uint8Array(total_length);
    
    let offset = 0;
    for (let buf of buffers) {
        out.set( new Uint8Array(buf), offset);
        offset += buf.byteLength;
    }
    return out.buffer;
}

// Get files to verify (from siginfo.json)
const siginfo = await fetch_json(FOLDER + 'siginfo.json');
const files = siginfo.sitemap.map(f => FOLDER + f);

const public_key = await load_public_key('./public_key.pem');
const sig = await fetch_text(FOLDER + './signature.base64');
console.log('Signature:', sig);

const data_buffers = await Promise.all(files.map(path => {
    console.log('Verifying:', path);
    return fetch_ab(path);
}));
const data = join_buffers(data_buffers);
// console.log(data);

const verified = await crypto.subtle.verify(
    { name: config.algorithm, hash: config.hash },
    public_key,
    base64_to_ab(sig),
    data
);

console.log(verified);