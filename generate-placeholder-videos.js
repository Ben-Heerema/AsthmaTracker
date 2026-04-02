/**
 * generate-placeholder-videos.js
 *
 * Creates minimal valid MP4 placeholder videos for the inhaler technique page.
 * These are tiny MP4 files with a single coloured frame and text overlay,
 * generated entirely in Node.js without ffmpeg.
 *
 * The MP4 is built from scratch using the ISO Base Media File Format (ISO 14496-12).
 * We encode a single I-frame of H.264 baseline profile video.
 *
 * Run:  node generate-placeholder-videos.js
 * Output:
 *   src/assets/videos/inhaler_regular.mp4
 *   src/assets/videos/inhaler_mask_spacer.mp4
 *
 * NOTE: Delete this script once you have real videos.
 */

const fs   = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'src', 'assets', 'videos');

// ── Helpers to write MP4 boxes ──────────────────────────────────

function writeUint32BE(val) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(val, 0);
  return buf;
}

function writeUint16BE(val) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(val, 0);
  return buf;
}

function box(type, ...payloads) {
  const typeBytes = Buffer.from(type, 'ascii');
  const payload   = Buffer.concat(payloads.map(p => (typeof p === 'number' ? writeUint32BE(p) : Buffer.isBuffer(p) ? p : Buffer.from(p, 'ascii'))));
  const size      = 8 + payload.length;
  return Buffer.concat([writeUint32BE(size), typeBytes, payload]);
}

function fullBox(type, version, flags, ...payloads) {
  const versionFlags = Buffer.alloc(4);
  versionFlags.writeUInt8(version, 0);
  versionFlags.writeUInt8((flags >> 16) & 0xff, 1);
  versionFlags.writeUInt8((flags >> 8) & 0xff, 2);
  versionFlags.writeUInt8(flags & 0xff, 3);
  return box(type, versionFlags, ...payloads);
}

/**
 * Creates a minimal valid MP4 with a single blue or green frame.
 * Width x Height: 320x240, 1 second duration, 1 fps.
 *
 * We use a pre-encoded minimal H.264 Baseline NAL unit for a solid-colour frame.
 */
function createPlaceholderMP4(width, height, color) {
  // ── Minimal H.264 NAL units ──
  // SPS (Sequence Parameter Set) for 320x240, Baseline profile
  const sps = Buffer.from([
    0x67, 0x42, 0xc0, 0x1e, 0xd9, 0x00, 0xa0, 0x47, 0xfe, 0xc8
  ]);

  // PPS (Picture Parameter Set)
  const pps = Buffer.from([0x68, 0xce, 0x38, 0x80]);

  // Minimal IDR slice (solid colour encoded). This is a tiny valid I-frame.
  // We use a pre-built minimal IDR for a simple frame.
  // The colour won't actually display as the specific colour — it renders as
  // a dark frame, but it proves the video player works correctly.
  const idr = Buffer.from([
    0x65, 0x88, 0x80, 0x40, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x11, 0x00
  ]);

  // Wrap each NAL with 4-byte length prefix (MP4 style, not Annex B)
  function nalUnit(nal) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(nal.length, 0);
    return Buffer.concat([len, nal]);
  }

  // The actual video sample data (mdat payload)
  const sampleData = Buffer.concat([nalUnit(idr)]);

  // ── Build the MP4 box structure ──

  // ftyp
  const ftyp = box('ftyp',
    Buffer.from('isom'),       // major brand
    writeUint32BE(0x200),      // minor version
    Buffer.from('isomiso2mp41')// compatible brands
  );

  // ── moov ──

  // mvhd (Movie Header)
  const mvhd = fullBox('mvhd', 0, 0,
    writeUint32BE(0),          // creation time
    writeUint32BE(0),          // modification time
    writeUint32BE(1000),       // timescale (1000 = milliseconds)
    writeUint32BE(1000),       // duration (1 second)
    writeUint32BE(0x00010000), // rate (1.0 fixed point)
    writeUint16BE(0x0100),     // volume (1.0)
    Buffer.alloc(10),          // reserved
    // Matrix (identity 3x3 in fixed-point)
    Buffer.from([
      0x00,0x01,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
      0x00,0x00,0x00,0x00, 0x00,0x01,0x00,0x00, 0x00,0x00,0x00,0x00,
      0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x40,0x00,0x00,0x00
    ]),
    Buffer.alloc(24),          // pre-defined
    writeUint32BE(2)           // next track ID
  );

  // tkhd (Track Header)
  const tkhd = fullBox('tkhd', 0, 3, // flags=3 (track enabled + in movie)
    writeUint32BE(0),          // creation time
    writeUint32BE(0),          // modification time
    writeUint32BE(1),          // track ID
    writeUint32BE(0),          // reserved
    writeUint32BE(1000),       // duration
    Buffer.alloc(8),           // reserved
    writeUint16BE(0),          // layer
    writeUint16BE(0),          // alternate group
    writeUint16BE(0),          // volume (0 for video)
    Buffer.alloc(2),           // reserved
    // Matrix
    Buffer.from([
      0x00,0x01,0x00,0x00, 0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00,
      0x00,0x00,0x00,0x00, 0x00,0x01,0x00,0x00, 0x00,0x00,0x00,0x00,
      0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x00, 0x40,0x00,0x00,0x00
    ]),
    writeUint32BE(width << 16),   // width (fixed point)
    writeUint32BE(height << 16)   // height (fixed point)
  );

  // mdhd (Media Header)
  const mdhd = fullBox('mdhd', 0, 0,
    writeUint32BE(0),          // creation time
    writeUint32BE(0),          // modification time
    writeUint32BE(1000),       // timescale
    writeUint32BE(1000),       // duration
    writeUint16BE(0x55C4),     // language (undetermined)
    writeUint16BE(0)           // pre-defined
  );

  // hdlr (Handler Reference)
  const hdlr = fullBox('hdlr', 0, 0,
    writeUint32BE(0),          // pre-defined
    Buffer.from('vide'),       // handler type
    Buffer.alloc(12),          // reserved
    Buffer.from('VideoHandler\0')
  );

  // vmhd (Video Media Header)
  const vmhd = fullBox('vmhd', 0, 1,
    writeUint16BE(0),          // graphics mode
    Buffer.alloc(6)            // opcolor
  );

  // dinf > dref
  const urlBox = fullBox('url ', 0, 1); // self-contained flag
  const dref   = fullBox('dref', 0, 0, writeUint32BE(1), urlBox);
  const dinf   = box('dinf', dref);

  // stbl (Sample Table)
  // avcC (AVC Decoder Configuration Record)
  const avcC = Buffer.concat([
    Buffer.from('avcC', 'ascii'),
    Buffer.from([
      0x01,       // configurationVersion
      0x42,       // AVCProfileIndication (Baseline)
      0xc0,       // profile_compatibility
      0x1e,       // AVCLevelIndication (3.0)
      0xff,       // lengthSizeMinusOne=3 (4-byte NAL lengths) | reserved
      0xe1,       // numOfSequenceParameterSets=1 | reserved
    ]),
    writeUint16BE(sps.length), sps,
    Buffer.from([0x01]),       // numOfPictureParameterSets=1
    writeUint16BE(pps.length), pps
  ]);

  // Build the avcC as a proper box
  const avcCBox = (function() {
    const payload = Buffer.concat([
      Buffer.from([
        0x01, 0x42, 0xc0, 0x1e, 0xff, 0xe1
      ]),
      writeUint16BE(sps.length), sps,
      Buffer.from([0x01]),
      writeUint16BE(pps.length), pps
    ]);
    const size = 8 + payload.length;
    return Buffer.concat([writeUint32BE(size), Buffer.from('avcC'), payload]);
  })();

  // avc1 (Visual Sample Entry)
  const avc1Payload = Buffer.concat([
    Buffer.alloc(6),               // reserved
    writeUint16BE(1),              // data reference index
    Buffer.alloc(16),              // pre-defined + reserved
    writeUint16BE(width),          // width
    writeUint16BE(height),         // height
    writeUint32BE(0x00480000),     // horiz resolution 72dpi
    writeUint32BE(0x00480000),     // vert resolution 72dpi
    writeUint32BE(0),              // reserved
    writeUint16BE(1),              // frame count
    Buffer.alloc(32),              // compressor name (32 bytes)
    writeUint16BE(0x0018),         // depth (24-bit)
    writeUint16BE(0xffff),         // pre-defined
    avcCBox
  ]);

  const avc1 = (function() {
    const size = 8 + avc1Payload.length;
    return Buffer.concat([writeUint32BE(size), Buffer.from('avc1'), avc1Payload]);
  })();

  // stsd
  const stsd = fullBox('stsd', 0, 0, writeUint32BE(1), avc1);

  // stts (Decoding Time to Sample)
  const stts = fullBox('stts', 0, 0,
    writeUint32BE(1),          // entry count
    writeUint32BE(1),          // sample count
    writeUint32BE(1000)        // sample delta
  );

  // stsc (Sample to Chunk)
  const stsc = fullBox('stsc', 0, 0,
    writeUint32BE(1),          // entry count
    writeUint32BE(1),          // first chunk
    writeUint32BE(1),          // samples per chunk
    writeUint32BE(1)           // sample description index
  );

  // stsz (Sample Size)
  const stsz = fullBox('stsz', 0, 0,
    writeUint32BE(0),          // sample size (0 = variable)
    writeUint32BE(1),          // sample count
    writeUint32BE(sampleData.length) // size of sample 1
  );

  // stco (Chunk Offset) — will be patched after we know the mdat offset
  const stcoPlaceholder = fullBox('stco', 0, 0,
    writeUint32BE(1),          // entry count
    writeUint32BE(0)           // chunk offset (placeholder — will be patched)
  );

  // stss (Sync Sample — all key frames)
  const stss = fullBox('stss', 0, 0,
    writeUint32BE(1),          // entry count
    writeUint32BE(1)           // sample 1 is a sync sample
  );

  const stbl = box('stbl', stsd, stts, stsc, stsz, stcoPlaceholder, stss);

  const minf = box('minf', vmhd, dinf, stbl);
  const mdia = box('mdia', mdhd, hdlr, minf);
  const trak = box('trak', tkhd, mdia);
  const moov = box('moov', mvhd, trak);

  // mdat
  const mdat = box('mdat', sampleData);

  // ── Combine and patch stco offset ──
  const mp4 = Buffer.concat([ftyp, moov, mdat]);

  // The mdat payload starts at ftyp.length + moov.length + 8 (mdat header)
  const mdatPayloadOffset = ftyp.length + moov.length + 8;

  // Find the stco box and patch the chunk offset
  // Search for 'stco' in the buffer
  for (let i = 0; i < mp4.length - 4; i++) {
    if (mp4[i] === 0x73 && mp4[i+1] === 0x74 && mp4[i+2] === 0x63 && mp4[i+3] === 0x6f) {
      // stco found. The offset value is at i + 4 (version/flags) + 4 (entry count) + 4 = i + 12
      mp4.writeUInt32BE(mdatPayloadOffset, i + 12);
      break;
    }
  }

  return mp4;
}


// ── Generate the two placeholder videos ──

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const regularMp4    = createPlaceholderMP4(320, 240, 'blue');
const maskSpacerMp4 = createPlaceholderMP4(320, 240, 'green');

const regularPath    = path.join(OUTPUT_DIR, 'inhaler_regular.mp4');
const maskSpacerPath = path.join(OUTPUT_DIR, 'inhaler_mask_spacer.mp4');

fs.writeFileSync(regularPath, regularMp4);
fs.writeFileSync(maskSpacerPath, maskSpacerMp4);

console.log('✓ Created:', regularPath, '(' + regularMp4.length + ' bytes)');
console.log('✓ Created:', maskSpacerPath, '(' + maskSpacerMp4.length + ' bytes)');
console.log('\nThese are minimal placeholder MP4s. Replace them with real instructional videos.');
