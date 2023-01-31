/*
 * Adapted to ES6 from:
 * https://github.com/spite/ccapture.js/blob/master/src/tar.js
 *
 * Added length tracking
 * Tarball.prototype.append takes any ArrayBuffer instead of Uint8Array
 */

let utils = {
  
  lookup: [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
    'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
    'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X',
    'Y', 'Z', 'a', 'b', 'c', 'd', 'e', 'f',
    'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n',
    'o', 'p', 'q', 'r', 's', 't', 'u', 'v',
    'w', 'x', 'y', 'z', '0', '1', '2', '3',
    '4', '5', '6', '7', '8', '9', '+', '/'
  ],
  
  clean(length) {
    var i, buffer = new Uint8Array(length);
    for (i = 0; i < length; i += 1) {
      buffer[i] = 0;
    }
    return buffer;
  },
  
  extend(orig, length, addLength, multipleOf) {
    var newSize = length + addLength,
      buffer = utils.clean((parseInt(newSize / multipleOf) + 1) * multipleOf);

    buffer.set(orig);

    return buffer;
  },

  pad(num, bytes, base) {
    num = num.toString(base || 8);
    return "000000000000".substr(num.length + 12 - bytes) + num;
  },

  stringToUint8(input, out, offset) {
    var i, length;

    out = out || utils.clean(input.length);

    offset = offset || 0;
    for (i = 0, length = input.length; i < length; i += 1) {
      out[offset] = input.charCodeAt(i);
      offset += 1;
    }

    return out;
  },

  uint8ToBase64(uint8) {
    var i,
      extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
      output = "",
      temp, length;

    function tripletToBase64 (num) {
      return utils.lookup[num >> 18 & 0x3F] + utils.lookup[num >> 12 & 0x3F] + utils.lookup[num >> 6 & 0x3F] + utils.lookup[num & 0x3F];
    }

    // go through the array every three bytes, we'll deal with trailing stuff later
    for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
      temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
      output += tripletToBase64(temp);
    }

    // this prevents an ERR_INVALID_URL in Chrome (Firefox okay)
    switch (output.length % 4) {
    case 1:
      output += '=';
      break;
    case 2:
      output += '==';
      break;
    default:
      break;
    }

    return output;
  }

};



let header = {
  
  structure: [
    {
      'field': 'fileName',
      'length': 100
    },
    {
      'field': 'fileMode',
      'length': 8
    },
    {
      'field': 'uid',
      'length': 8
    },
    {
      'field': 'gid',
      'length': 8
    },
    {
      'field': 'fileSize',
      'length': 12
    },
    {
      'field': 'mtime',
      'length': 12
    },
    {
      'field': 'checksum',
      'length': 8
    },
    {
      'field': 'type',
      'length': 1
    },
    {
      'field': 'linkName',
      'length': 100
    },
    {
      'field': 'ustar',
      'length': 8
    },
    {
      'field': 'owner',
      'length': 32
    },
    {
      'field': 'group',
      'length': 32
    },
    {
      'field': 'majorNumber',
      'length': 8
    },
    {
      'field': 'minorNumber',
      'length': 8
    },
    {
      'field': 'filenamePrefix',
      'length': 155
    },
    {
      'field': 'padding',
      'length': 12
    }
  ],
  
  format(data, cb) {
    var buffer = utils.clean(512),
      offset = 0;

    header.structure.forEach(function (value) {
      var str = data[value.field] || "",
        i, length;

      for (i = 0, length = str.length; i < length; i += 1) {
        buffer[offset] = str.charCodeAt(i);
        offset += 1;
      }

      offset += value.length - i; // space it out with nulls
    });

    if (typeof cb === 'function') {
      return cb(buffer, offset);
    }
    return buffer;
  }
  
};


const recordSize = 512;

export default class Tarball {
  
  constructor(recordsPerBlock = 20) {
    this.written = 0;
    this.blockSize = recordsPerBlock * recordSize;
    this.out = utils.clean(this.blockSize);
    this.blocks = [];
    this.length = 0;
  }
  
  clear() {
    this.written = 0;
    this.out = utils.clean(this.blockSize);
  }
  
  append(filepath, input, opts = {}) {
    var data,
      checksum,
      mode,
      mtime,
      uid,
      gid,
      headerArr;

    if (typeof input === 'string') {
      input = utils.stringToUint8(input);
    } else if (input instanceof ArrayBuffer) {
      input = new Uint8Array(input);
    } else {
      throw 'Invalid input type. You gave me: ' + input.constructor.toString().match(/function\s*([$A-Za-z_][0-9A-Za-z_]*)\s*\(/)[1];
    }

    mode = opts.mode || parseInt('777', 8) & 0xfff;
    mtime = opts.mtime || Math.floor(+new Date() / 1000);
    uid = opts.uid || 0;
    gid = opts.gid || 0;

    data = {
      fileName: filepath,
      fileMode: utils.pad(mode, 7),
      uid: utils.pad(uid, 7),
      gid: utils.pad(gid, 7),
      fileSize: utils.pad(input.length, 11),
      mtime: utils.pad(mtime, 11),
      checksum: '        ',
      type: '0', // just a file
      ustar: 'ustar  ',
      owner: opts.owner || '',
      group: opts.group || ''
    };

    // calculate the checksum
    checksum = 0;
    Object.keys(data).forEach(function (key) {
      var i, value = data[key], length;

      for (i = 0, length = value.length; i < length; i += 1) {
        checksum += value.charCodeAt(i);
      }
    });

    data.checksum = utils.pad(checksum, 6) + "\u0000 ";

    headerArr = header.format(data);

    var headerLength = Math.ceil( headerArr.length / recordSize ) * recordSize; 
    var inputLength = Math.ceil( input.length / recordSize ) * recordSize;
    
    this.length += inputLength + headerLength;
    this.blocks.push( { header: headerArr, input, headerLength, inputLength } );
  }
  
  save() {
    var buffers = [];
    var chunks = [];
    var length = 0;
    var max = Math.pow( 2, 20 );

    var chunk = [];
    this.blocks.forEach( function( b ) {
      if( length + b.headerLength + b.inputLength > max ) {
        chunks.push( { blocks: chunk, length: length } );
        chunk = [];
        length = 0;
      }
      chunk.push( b );
      length += b.headerLength + b.inputLength;
    } );
    chunks.push( { blocks: chunk, length: length } );

    chunks.forEach( function( c ) {
      var buffer = new Uint8Array( c.length );
      var written = 0;
      c.blocks.forEach( function( b ) {
        buffer.set( b.header, written );
        written += b.headerLength;
        buffer.set( b.input, written );
        written += b.inputLength;
      } );
      buffers.push( buffer );
    } );

    buffers.push( new Uint8Array( 2 * recordSize ) );

    return new Blob( buffers, { type: 'octet/stream' } );
  }

}
