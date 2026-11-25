import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autonomousPublisherPriority,
  autonomousYouTubePriority,
  autonomousDiscoveryTopics,
  buildAutonomousResearchInput,
  isAutonomousYouTubeDiscoveryDue,
} from '../lib/autonomous-policy';
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

void test('YouTube discoveries outrank even the freshest publisher fallback', () => {
  const now = Date.parse('2026-11-25T12:00:00.000Z');
  const publisherPriority = autonomousPublisherPriority('2026-11-25T12:00:00.000Z', 2, now);
  const unmeasuredYouTubePriority = autonomousYouTubePriority({});
  assert.ok(unmeasuredYouTubePriority > publisherPriority);
});

void test('measured YouTube velocity and channel outliers raise discovery priority', () => {
  const baseline = autonomousYouTubePriority({});
  const measured = autonomousYouTubePriority({
    growth: {
      snapshotCount: 3,
      deltaViews: 12000,
      viewsPerHour: 500,
      viewsPerDay: 12000,
      channelBaselineViewsPerDay: 3000,
      channelOutlierRatio: 4,
      measuredAt: 1_800_000_000_000,
      status: 'measured',
    },
  });
  assert.ok(measured > baseline);
});


void test('autonomous YouTube discovery rotates two broader topic seeds alongside the selected niche', () => {
  const preferences = defaults().preferences;
  const topicsA = autonomousDiscoveryTopics(preferences, Date.parse('2026-11-25T00:00:00Z'));
  const topicsB = autonomousDiscoveryTopics(preferences, Date.parse('2026-11-25T18:00:00Z'));
  assert.equal(topicsA.length, 3);
  assert.equal(topicsB.length, 3);
  assert.equal(topicsA[0], topicsB[0]);
  assert.notDeepEqual(topicsA.slice(1), topicsB.slice(1));
});
