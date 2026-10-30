import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../public/assets/Neo.glb', import.meta.url));
const output = fileURLToPath(new URL('../public/assets/Neo-optimized.glb', import.meta.url));
const io = new NodeIO();
const document = await io.read(source);
// Keep PNG for the existing loader; preserve geometry, skinning, and animation.
// Process sequentially to limit memory used by the optimization itself.
for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const resized = await sharp(image)
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    texture.setImage(resized).setMimeType('image/png');
}
await io.write(output, document);
const before = (await stat(source)).size;
const after = (await stat(output)).size;
console.log(`Model optimized: ${(before / 1048576).toFixed(1)} MiB → ${(after / 1048576).toFixed(1)} MiB`);
