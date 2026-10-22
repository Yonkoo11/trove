import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const f of ['money.mjs', 'defaults.mjs']) {
  test(`site/lib/${f} is byte-identical to src/${f}`, () => {
    assert.ok(readFileSync(new URL(`../site/lib/${f}`, import.meta.url)).equals(readFileSync(new URL(`../src/${f}`, import.meta.url))));
  });
}
