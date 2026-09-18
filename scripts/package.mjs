import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const destination = resolve(root, 'dist');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const entry of ['manifest.json', 'src', 'assets']) await cp(resolve(root, entry), resolve(destination, entry), { recursive: true });
console.log(`Packaged extension in ${destination}`);
