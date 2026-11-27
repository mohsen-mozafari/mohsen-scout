import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBrowserFailureMessage, isAllowedBrowserNavigation, normalizeBrowserAddress } from '../lib/browser';

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

void test('browser translates mobile-data disconnection into an actionable diagnostic', () => {
  const message = getBrowserFailureMessage('net::ERR_INTERNET_DISCONNECTED', -2);
  assert.match(message, /mobile data|internet connection/i);
  assert.match(message, /data saver|network permission|VPN|DNS/i);
});

void test('browser distinguishes DNS, timeout, connection and certificate failures', () => {
  assert.match(getBrowserFailureMessage('net::ERR_NAME_NOT_RESOLVED', -2), /DNS|domain name/i);
  assert.match(getBrowserFailureMessage('net::ERR_CONNECTION_TIMED_OUT', -7), /timed out|timeout/i);
  assert.match(getBrowserFailureMessage('net::ERR_CONNECTION_REFUSED', -6), /connection/i);
  assert.match(getBrowserFailureMessage('net::ERR_CERT_AUTHORITY_INVALID', -11), /certificate|SSL/i);
});

void test('browser keeps useful diagnostics for unknown WebView failures', () => {
  assert.match(getBrowserFailureMessage('unexpected network failure', -99), /unexpected network failure/i);
  assert.match(getBrowserFailureMessage('', -99), /-99/);
});
