import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSettingsRoute, SETTINGS_ROUTE } from '../lib/routes';

void test('the global Settings control targets the hidden tabs Settings route', () => {
  assert.equal(SETTINGS_ROUTE, '/(tabs)/settings');
  assert.equal(isSettingsRoute('/(tabs)/settings'), true);
  assert.equal(isSettingsRoute('/settings'), true);
  assert.equal(isSettingsRoute('/youtube'), false);
});
