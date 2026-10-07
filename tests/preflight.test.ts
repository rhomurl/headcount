import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkEnvironment } from '../scripts/preflight';

function valid() {
  return {
    RPC_URL: 'https://sepolia.base.org',
    OPERATOR_PRIVATE_KEY: `0x${randomBytes(32).toString('hex')}`,
    TOKEN_ADDRESS: `0x${'12'.repeat(20)}`,
    ESCROW_ADDRESS: `0x${'34'.repeat(20)}`,
    NEXT_PUBLIC_ESCROW_ADDRESS: `0x${'34'.repeat(20)}`,
    APP_URL: 'https://headcount.example.com',
  };
}

describe('deployment environment preflight', () => {
  it('accepts complete testnet deployment settings without returning secrets', () => {
    expect(checkEnvironment(valid())).toEqual([]);
  });
  it('reports required missing field names', () => {
    expect(checkEnvironment({})).toContain('OPERATOR_PRIVATE_KEY is missing.');
    expect(checkEnvironment({})).toContain('ESCROW_ADDRESS is missing.');
  });
  it('rejects invalid signing keys and zero contract addresses without echoing values', () => {
    const settings = { ...valid(), OPERATOR_PRIVATE_KEY: 'private-secret-value', TOKEN_ADDRESS: `0x${'0'.repeat(40)}` };
    const errors = checkEnvironment(settings);
    expect(errors).toContain('OPERATOR_PRIVATE_KEY is invalid.');
    expect(errors).toContain('TOKEN_ADDRESS must be a nonzero EVM address.');
    expect(JSON.stringify(errors)).not.toContain(settings.OPERATOR_PRIVATE_KEY);
  });
  it('requires identical public and server escrow addresses', () => {
    expect(checkEnvironment({ ...valid(), NEXT_PUBLIC_ESCROW_ADDRESS: `0x${'56'.repeat(20)}` })).toContain('NEXT_PUBLIC_ESCROW_ADDRESS must equal ESCROW_ADDRESS.');
  });
  it('requires HTTPS and keeps credential-bearing RPC details out of errors', () => {
    const errors = checkEnvironment({ ...valid(), RPC_URL: 'http://provider.invalid/private-token?key=private-token', APP_URL: 'http://headcount.example.com' });
    expect(errors).toContain('RPC_URL must use HTTPS; --local permits loopback HTTP only.');
    expect(errors).toContain('APP_URL must use HTTPS; --local permits loopback HTTP only.');
    expect(JSON.stringify(errors)).not.toContain('private-token');
  });
  it('permits loopback HTTP only with explicit local mode', () => {
    const settings = { ...valid(), RPC_URL: 'http://127.0.0.1:18547', APP_URL: 'http://localhost:3100' };
    expect(checkEnvironment(settings, true)).toEqual([]);
    expect(checkEnvironment({ ...settings, APP_URL: 'http://external.invalid' }, true)).toContain('APP_URL must use HTTPS; --local permits loopback HTTP only.');
  });
});
