import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAutonomousResearchInput, isAutonomousYouTubeDiscoveryDue } from '../lib/autonomous-policy';
import { defaults } from '../lib/types';

void test('automatic research can start from the selected niche without any previous manual search', () => {
  const preferences = defaults().preferences;
  preferences.lastInput = undefined;
  preferences.selectedSpaceNiche = 'exoplanets';
  preferences.region = 'Germany';
  preferences.languages = ['en', 'de'];
  const input = buildAutonomousResearchInput(preferences);
  assert.equal(input.topic, 'exoplanet discoveries');
  assert.equal(input.region, 'Germany');
  assert.deepEqual(input.languages, ['en', 'de']);
  assert.equal(input.days, 7);
  assert.equal(input.maxResults, 25);
});

void test('custom niche is used as the autonomous seed when no saved input exists', () => {
  const preferences = defaults().preferences;
  preferences.lastInput = undefined;
  preferences.selectedSpaceNiche = 'custom';
  preferences.customSpaceNiche = 'nearby star systems and exoplanets';
  assert.equal(buildAutonomousResearchInput(preferences).topic, 'nearby star systems and exoplanets');
});

void test('automatic YouTube discovery is rate-limited but becomes due again after its interval', () => {
  const now = 1_800_000_000_000;
  assert.equal(isAutonomousYouTubeDiscoveryDue(0, now), true);
  assert.equal(isAutonomousYouTubeDiscoveryDue(now - 60_000, now), false);
  assert.equal(isAutonomousYouTubeDiscoveryDue(now - 6 * 60 * 60 * 1000, now), true);
  assert.equal(isAutonomousYouTubeDiscoveryDue(Number.NaN, now), true);
});
