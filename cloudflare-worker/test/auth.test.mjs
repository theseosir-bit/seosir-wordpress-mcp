import test from 'node:test';
import assert from 'node:assert/strict';
import {isAuthorized, configError} from '../src/auth.ts';

const token='a'.repeat(64);
const env={ STAGING_BEARER_TOKEN:token, APP_MODE:'staging-readonly', WP_URL:'https://seosir.ir', WP_USERNAME:'mcp-editor', WP_APPLICATION_PASSWORD:'b'.repeat(24), DB:{prepare() {}} };
const req=(value)=>new Request('https://example.test/mcp',{headers:{Authorization:value}});

test('accepts only exact staging bearer token',()=>{
  assert.equal(isAuthorized(req(`Bearer ${token}`),env),true);
  assert.equal(isAuthorized(req(`Bearer ${'b'.repeat(64)}`),env),false);
  assert.equal(isAuthorized(req(`Basic ${token}`),env),false);
  assert.equal(isAuthorized(req(''),env),false);
});
test('rejects wrong env and missing D1',()=>{
  assert.equal(configError(env),null);
  assert.notEqual(configError({...env, APP_MODE:'production'}),null);
  assert.notEqual(configError({...env, STAGING_BEARER_TOKEN:'short'}),null);
  assert.notEqual(configError({...env,DB:undefined}),null);
});
