import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('../src/server.ts',import.meta.url),'utf8');
const wp=readFileSync(new URL('../src/wp.ts',import.meta.url),'utf8');
const php=readFileSync(new URL('../../wordpress/ai-wordpress-bridge/ai-wordpress-bridge.php',import.meta.url),'utf8');
test('MCP writes do not include publishing/deleting tools',()=>{
  assert.ok(!server.includes("registerTool('posts_publish'"));
  assert.ok(!server.includes("registerTool('posts_delete'"));
  assert.match(server,/posts_create_draft/);
  assert.match(server,/seo_update/);
});
test('WP client rejects redirects and mandates HTTPS for non-local sites',()=>{
  assert.match(wp,/redirect: 'error'/);
  assert.match(wp,/WP_URL must use HTTPS/);
});
test('Elementor writes are explicitly disabled unless enabled',()=>{
  assert.match(php,/AWB_ENABLE_ELEMENTOR_WRITES/);
  assert.match(server,/ENABLE_ELEMENTOR_WRITES/);
});

test('MCP tool replies have explicit SDK-compatible return typing',()=>{
  assert.match(server,/import type \{CallToolResult\} from '@modelcontextprotocol\/sdk\/types\.js'/);
  assert.match(server,/structuredContent: Record<string, unknown>/);
});
test('OAuth identity is narrowed to a defined nonempty subject',()=>{
  const auth=readFileSync(new URL('../src/auth.ts',import.meta.url),'utf8');
  assert.match(auth,/typeof subject !== 'string'/);
});
