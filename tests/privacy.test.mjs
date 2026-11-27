import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanImage, cleanImage } from '../src/core.js';
import { concat, jseg, u16be, u32be, pchunk, PNG_SIG, wchunk, u32le } from './fixtures.mjs';

/** Big-endian TIFF: IFD0 with Make, DateTime and a GPS pointer; GPS IFD with one entry. */
function phoneTiff() {
  return concat(
    'MM', [0, 42], u32be(8),
    u16be(3),
    u16be(0x010f), u16be(2), u32be(6), u32be(50), // Make -> "Apple\0" at 50
    u16be(0x0132), u16be(2), u32be(4), u32be(0x32303236), // DateTime (short, inline)
    u16be(0x8825), u16be(4), u32be(1), u32be(56), // GPS IFD at 56
    u32be(0),
    'Apple', [0],
    u16be(1), u16be(0x0001), u16be(2), u32be(2), [0x4e, 0, 0, 0], u32be(0), // GPSLatitudeRef "N"
  );
}

const jpeg = () => concat([0xff, 0xd8], jseg(0xe1, concat('Exif', [0, 0], phoneTiff())), jseg(0xda, [1, 1, 0, 0, 63, 0]), [1, 2, 3], [0xff, 0xd9]);
const png = () => concat(PNG_SIG, pchunk('IHDR', new Array(13).fill(0)), pchunk('eXIf', phoneTiff()), pchunk('IDAT', [1]), pchunk('IEND', []));
const webp = () => {
  const body = concat('WEBP', wchunk('VP8X', [0x08, 0, 0, 0, 0, 0, 0, 0, 0, 0]), wchunk('VP8 ', [1, 2]), wchunk('EXIF', concat('Exif', [0, 0], phoneTiff())));
  return concat('RIFF', u32le(body.length), body);
};

for (const [name, make] of [['JPEG', jpeg], ['PNG', png], ['WebP', webp]]) {
  test(`${name}: finds GPS, camera and date, then they are gone`, () => {
    assert.deepEqual(scanImage(make()).privacy, ['Camera / phone model', 'Date and time', 'GPS location']);
    assert.deepEqual(scanImage(cleanImage(make()).bytes).privacy, []);
  });
}

test('an empty GPS folder does not count as a location', () => {
  const tiff = phoneTiff();
  tiff[57] = 0; // GPS IFD entry count -> 0
  const b = concat([0xff, 0xd8], jseg(0xe1, concat('Exif', [0, 0], tiff)), [0xff, 0xd9]);
  assert.ok(!scanImage(b).privacy.includes('GPS location'));
});
