import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
test('read-only tool names are present',()=>{
 for(const name of ['site_info','posts_search','posts_get','seo_get','elementor_outline']) assert.ok(src.includes(`registerTool('${name}'`));
});
test('no editing tools or POST WordPress API in staging source',()=>{
 for(const name of ['posts_create_draft','posts_update_draft','seo_update','elementor_update_text_experimental']) assert.equal(src.includes(`registerTool('${name}'`),false);
});
