import { config } from 'dotenv';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type Settings = Record<string, string | undefined>;
const curveOrder = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/** Validate deployment settings without returning credential-bearing values. */
export function checkEnvironment(env: Settings, local = false): string[] {
  const errors: string[] = [];
  const required = ['RPC_URL', 'OPERATOR_PRIVATE_KEY', 'TOKEN_ADDRESS', 'ESCROW_ADDRESS', 'NEXT_PUBLIC_ESCROW_ADDRESS', 'APP_URL'];
  for (const name of required) if (!env[name]?.trim()) errors.push(`${name} is missing.`);
  const key = env.OPERATOR_PRIVATE_KEY;
  if (key && (!/^0x[0-9a-fA-F]{64}$/.test(key) || BigInt(key) === 0n || BigInt(key) >= curveOrder)) errors.push('OPERATOR_PRIVATE_KEY is invalid.');
  for (const name of ['TOKEN_ADDRESS', 'ESCROW_ADDRESS', 'NEXT_PUBLIC_ESCROW_ADDRESS']) {
    const address = env[name];
    if (address && (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/.test(address))) errors.push(`${name} must be a nonzero EVM address.`);
  }
  if (env.ESCROW_ADDRESS && env.NEXT_PUBLIC_ESCROW_ADDRESS && env.ESCROW_ADDRESS.toLowerCase() !== env.NEXT_PUBLIC_ESCROW_ADDRESS.toLowerCase()) errors.push('NEXT_PUBLIC_ESCROW_ADDRESS must equal ESCROW_ADDRESS.');
  for (const name of ['RPC_URL', 'APP_URL']) {
    const value = env[name];
    if (!value) continue;
    try {
      const url = new URL(value);
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (url.protocol !== 'https:' && !(local && loopback && url.protocol === 'http:')) errors.push(`${name} must use HTTPS; --local permits loopback HTTP only.`);
      if (name === 'APP_URL' && (url.username || url.password || url.search || url.hash || url.pathname !== '/')) errors.push('APP_URL must be an origin without credentials, query, fragment or path.');
    } catch { errors.push(`${name} is not a valid URL.`); }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  config({ path: '.env.local', quiet: true });
  const errors = checkEnvironment(process.env, process.argv.includes('--local'));
  if (errors.length) {
    console.error('Deployment preflight failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log('PASS deployment environment shape. Chain ID, operator funding, contract receipts and HTTPS routing still require live verification.');
  }
}
