import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { isSettingsRoute, SETTINGS_ROUTE } from '../lib/routes';

void test('Settings is a root route, not a bottom tab, and remains reachable from the header', () => {
  const root = process.cwd();
  const tabsLayout = readFileSync(resolve(root, 'app/(tabs)/_layout.tsx'), 'utf8');
  const rootLayout = readFileSync(resolve(root, 'app/_layout.tsx'), 'utf8');
  const dashboard = readFileSync(resolve(root, 'app/(tabs)/index.tsx'), 'utf8');
  const sharedUi = readFileSync(resolve(root, 'components/ScoutUI.tsx'), 'utf8');
  const trendIntelligence = readFileSync(resolve(root, 'app/trend-intelligence.tsx'), 'utf8');
  const workspace = readFileSync(resolve(root, 'app/(tabs)/workspace.tsx'), 'utf8');
  const researchArchive = readFileSync(resolve(root, 'components/ResearchArchive.tsx'), 'utf8');

  assert.equal(SETTINGS_ROUTE, '/settings');
  assert.equal(isSettingsRoute('/settings'), true);
  assert.equal(isSettingsRoute('/settings/'), true);
  assert.equal(isSettingsRoute('/(tabs)/settings'), false);
  assert.equal(isSettingsRoute('/youtube'), false);

  assert.equal(existsSync(resolve(root, 'app/settings.tsx')), true);
  assert.equal(existsSync(resolve(root, 'app/(tabs)/settings.tsx')), false);
  assert.match(rootLayout, /<Stack\.Screen name="settings"/);
  assert.doesNotMatch(tabsLayout, /<Tabs\.Screen\s+name="settings"/);
  assert.doesNotMatch(dashboard, /SETTINGS_ROUTE|router\.(?:push|navigate)\(['"]\/settings/);
  assert.match(sharedUi, /router\.navigate\(SETTINGS_ROUTE\)/);
  assert.match(trendIntelligence, /router\.push\(SETTINGS_ROUTE\)/);
  assert.doesNotMatch(trendIntelligence, /\(tabs\)\/settings/);
  assert.match(workspace, /accessibilityRole="tab"/);
  assert.match(workspace, /<ResearchArchive \/>/);
  assert.match(researchArchive, /params: \{ topic: report\.input\.topic, report: report\.id \}/);
  assert.match(researchArchive, /deep-research/);
});
