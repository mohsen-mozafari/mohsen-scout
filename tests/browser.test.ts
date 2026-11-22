import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowedBrowserNavigation, normalizeBrowserAddress } from '../lib/browser';

void test('browser normalizes hostnames and search phrases to HTTPS', () => {
  assert.equal(normalizeBrowserAddress('example.org'), 'https://example.org/');
  assert.equal(normalizeBrowserAddress('Mars sample return mission'), 'https://www.google.com/search?q=Mars%20sample%20return%20mission');
});

void test('browser rejects unsafe schemes, credentials and empty input', () => {
  assert.equal(normalizeBrowserAddress(''), undefined);
  assert.equal(normalizeBrowserAddress('javascript:alert(1)'), undefined);
  assert.equal(normalizeBrowserAddress('file:///etc/passwd'), undefined);
  assert.equal(normalizeBrowserAddress('https://user:pass@example.org'), undefined);
});

void test('browser navigation allows only credential-free HTTP(S) URLs', () => {
  assert.equal(isAllowedBrowserNavigation('https://example.org/path'), true);
  assert.equal(isAllowedBrowserNavigation('http://example.org/path'), true);
  assert.equal(isAllowedBrowserNavigation('intent://example.org'), false);
  assert.equal(isAllowedBrowserNavigation('data:text/html,hello'), false);
  assert.equal(isAllowedBrowserNavigation('https://user@example.org'), false);
});
