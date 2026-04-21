// Run with: node generate-icon.js
// Generates icon.png for the VS Code extension marketplace.
const zlib = require('zlib');
const fs   = require('fs');

const W = 128, H = 128;
const pixels = new Uint8Array(W * H * 4);

function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 4;
    pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = a;
}

// ── Background: dark navy with rounded corners ──────────────────────────────
const RADIUS = 20;
for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
        const inTopLeft     = x < RADIUS     && y < RADIUS     && dist(x, y, RADIUS,   RADIUS)   > RADIUS;
        const inTopRight    = x >= W - RADIUS && y < RADIUS     && dist(x, y, W-RADIUS, RADIUS)   > RADIUS;
        const inBottomLeft  = x < RADIUS     && y >= H - RADIUS && dist(x, y, RADIUS,   H-RADIUS) > RADIUS;
        const inBottomRight = x >= W - RADIUS && y >= H - RADIUS && dist(x, y, W-RADIUS, H-RADIUS) > RADIUS;

        if (inTopLeft || inTopRight || inBottomLeft || inBottomRight) {
            setPixel(x, y, 0, 0, 0, 0); // transparent corner
        } else {
            setPixel(x, y, 22, 22, 40, 255); // #16162A dark navy
        }
    }
}

function dist(x, y, cx, cy) {
    return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
}

// ── Lightning bolt polygon ──────────────────────────────────────────────────
// Defined as (x, y) points at 128×128 scale
const BOLT = [
    [72, 10],
    [44, 10],
    [34, 66],
    [56, 66],
    [36, 118],
    [92, 56],
    [68, 56],
];

function pointInPolygon(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
        if (pointInPolygon(x, y, BOLT)) {
            setPixel(x, y, 255, 204, 0, 255); // golden yellow
        }
    }
}

// ── PNG encoding ────────────────────────────────────────────────────────────
function crc32(buf) {
    let crc = 0xffffffff;
    for (const b of buf) {
        crc ^= b;
        for (let k = 0; k < 8; k++) {
            crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const lenBuf  = Buffer.alloc(4);  lenBuf.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type);
    const crcVal  = crc32(Buffer.concat([typeBuf, data]));
    const crcBuf  = Buffer.alloc(4);  crcBuf.writeUInt32BE(crcVal);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// IHDR chunk
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8]  = 8; // bit depth
ihdr[9]  = 6; // colour type: RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

// Raw scanlines (filter byte 0 = None before each row)
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    for (let x = 0; x < W; x++) {
        const src = (y * W + x) * 4;
        const dst = y * (1 + W * 4) + 1 + x * 4;
        raw[dst]     = pixels[src];
        raw[dst + 1] = pixels[src + 1];
        raw[dst + 2] = pixels[src + 2];
        raw[dst + 3] = pixels[src + 3];
    }
}

const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
]);

fs.writeFileSync('icon.png', png);
console.log('icon.png created (128x128)');
