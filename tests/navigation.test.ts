import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSettingsRoute, SETTINGS_ROUTE } from '../lib/routes';

void test('Settings has one canonical, directly reachable route from every tab context', () => {
  assert.equal(SETTINGS_ROUTE, '/settings');
  assert.equal(isSettingsRoute('/settings'), true);
  assert.equal(isSettingsRoute('/(tabs)/settings'), true);
  assert.equal(isSettingsRoute('/settings/'), true);
  assert.equal(isSettingsRoute('/youtube'), false);
});
