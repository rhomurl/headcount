// Real loopback integration only: ephemeral wallet, Anvil, SQLite and Next.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';

const root = resolve(import.meta.dirname, '../..');
const folder = mkdtempSync(join(tmpdir(), 'headcount-local-flow-'));
const key = `0x${randomBytes(32).toString('hex')}`;
const operator = privateKeyToAccount(key).address;
const sponsor = `0x${randomBytes(20).toString('hex')}`;
const host = `0x${randomBytes(20).toString('hex')}`;
const rpcUrl = 'http://127.0.0.1:18547';
const appUrl = 'http://127.0.0.1:13417';
const children = [];
let sequence = 0;

function launch(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  children.push(child);
  let output = '';
  child.stdout.on('data', bytes => { output += bytes; });
  child.stderr.on('data', bytes => { output += bytes; });
  const done = new Promise((yes, no) => {
    child.once('error', no);
    child.once('exit', code => code === 0 ? yes(output) : no(new Error(`${command} exited ${code}: ${output.replaceAll(key, '[redacted]')}`)));
  });
  // Services are awaited by readiness checks rather than exit.
  done.catch(() => {});
  return { child, done };
}
async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++sequence, method, params }) });
  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}
async function ready(check) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if (await check()) return; } catch { /* service starting */ }
    await new Promise(yes => setTimeout(yes, 500));
  }
  throw new Error('Loopback service did not become ready');
}

try {
  launch(join(root, 'node_modules/.bin/anvil'), ['--host', '127.0.0.1', '--port', '18547', '--chain-id', '84532', '--accounts', '0', '--silent']);
  await ready(async () => await rpc('eth_chainId') === '0x14a34');
  await rpc('anvil_setBalance', [operator, '0x56bc75e2d63100000']);
  const env = { ...process.env, OPERATOR_PRIVATE_KEY: key, RPC_URL: rpcUrl, DB_PATH: join(folder, 'test.db'), APP_URL: appUrl };
  await launch(process.execPath, [join(root, 'contracts/tools/forge.cjs'), 'script', 'script/Deploy.s.sol', '--rpc-url', rpcUrl, '--broadcast'], { cwd: join(root, 'contracts'), env }).done;
  const deployment = JSON.parse(readFileSync(join(root, 'contracts/broadcast/Deploy.s.sol/84532/run-latest.json'), 'utf8'));
  env.TOKEN_ADDRESS = deployment.transactions.find(tx => tx.contractName === 'MockUSDC').contractAddress;
  env.ESCROW_ADDRESS = deployment.transactions.find(tx => tx.contractName === 'HeadcountEscrow').contractAddress;
  env.NEXT_PUBLIC_ESCROW_ADDRESS = env.ESCROW_ADDRESS;
  assert.ok(env.TOKEN_ADDRESS && env.ESCROW_ADDRESS);
  launch(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '13417'], { env });
  await ready(async () => (await fetch(appUrl)).ok);
  await launch('bash', ['scripts/api-test.sh', appUrl, '--allow-testnet-transactions'], { env: { ...env, SPONSOR_WALLET: sponsor, HOST_WALLET: host } }).done;
  const balance = async address => BigInt(await rpc('eth_call', [{ to: env.TOKEN_ADDRESS, data: `0x70a08231${address.slice(2).padStart(64, '0')}` }, 'latest']));
  assert.equal(await balance(host), 1_000_000n);
  assert.equal(await balance(sponsor), 1_000_000n);
  assert.equal(await balance(env.ESCROW_ADDRESS), 0n);
  console.log('PASS loopback real-chain API flow, host payout, sponsor refund, duplicate and expired QR rejection.');
} finally {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  await Promise.all(children.map(child => child.exitCode !== null ? undefined : new Promise(yes => { child.once('exit', yes); setTimeout(() => { child.kill('SIGKILL'); yes(); }, 3000).unref(); })));
  rmSync(folder, { recursive: true, force: true });
}
