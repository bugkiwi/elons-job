import { createHash, createPrivateKey, createPublicKey, createSign } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const args = process.argv.slice(2);

function option(name) {
  const prefix = `${name}=`;
  const argument = args.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : '';
}

function encodeVarint(value) {
  const bytes = [];
  let remaining = BigInt(value);
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining) byte |= 0x80;
    bytes.push(byte);
  } while (remaining);
  return Buffer.from(bytes);
}

function bytesField(fieldNumber, value) {
  const data = Buffer.from(value);
  const tag = (BigInt(fieldNumber) << 3n) | 2n;
  return Buffer.concat([encodeVarint(tag), encodeVarint(data.length), data]);
}

function fail(message) {
  console.error(`CRX 打包失败：${message}`);
  console.error('用法：CRX_PRIVATE_KEY=/path/to/private-key.pem bun run package:crx');
  console.error('或：bun run package:crx -- --key=/path/to/private-key.pem [--output=/path/to/output.crx]');
  process.exit(1);
}

const keyPath = option('--key') || process.env.CRX_PRIVATE_KEY || '';
if (!keyPath) fail('缺少 RSA 私钥。私钥不会自动生成，也不会写入仓库。');

let privateKey;
try {
  privateKey = createPrivateKey(await readFile(resolve(keyPath)));
} catch (error) {
  fail(`无法读取私钥：${error.message}`);
}
if (privateKey.asymmetricKeyType !== 'rsa') fail('CRX3 当前要求 RSA 私钥。');

const output = resolve(root, option('--output') || 'dist/elons-work.crx');
await import('./package.mjs');

const publicKey = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
const crxId = createHash('sha256').update(publicKey).digest().subarray(0, 16);
const signedHeaderData = bytesField(1, crxId);
const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'elons-work-crx-'));
const archivePath = resolve(temporaryRoot, 'payload.zip');

try {
  const zip = spawnSync('zip', ['-q', '-r', archivePath, '.'], { cwd: dist, encoding: 'utf8' });
  if (zip.error || zip.status !== 0) throw zip.error || new Error(zip.stderr || `zip exited with ${zip.status}`);
  const archive = await readFile(archivePath);
  const signingData = Buffer.concat([Buffer.from('CRX3 Signed Data\0', 'ascii'), signedHeaderData, archive]);
  const signature = createSign('RSA-SHA256').update(signingData).sign(privateKey);
  const proof = Buffer.concat([bytesField(1, publicKey), bytesField(2, signature)]);
  const header = Buffer.concat([bytesField(2, proof), bytesField(1000, signedHeaderData)]);
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32LE(header.length);
  const crx = Buffer.concat([Buffer.from('Cr24', 'ascii'), Buffer.from([3, 0, 0, 0]), headerLength, header, archive]);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, crx, { mode: 0o644 });
  console.log(`Packaged CRX3 extension in ${output}`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
