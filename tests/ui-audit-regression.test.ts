import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('external navigation validates web URLs and reports failure visibly', () => {
  const helper = source('lib/external-links.ts');
  assert.match(helper, /https\?:/);
  assert.match(helper, /Alert\.alert/);
  assert.match(helper, /Could not open link/);
});

test('in-app browser exposes history and refresh controls', () => {
  const browser = source('app/browser.tsx');
  assert.match(browser, /goBack\(\)/);
  assert.match(browser, /goForward\(\)/);
  assert.match(browser, /reload\(\)/);
  assert.match(browser, /canGoBack/);
  assert.match(browser, /canGoForward/);
});

test('saved research reopens exact Deep Research note IDs', () => {
  const discover = source('app/(tabs)/discover.tsx');
  const archive = source('components/ResearchArchive.tsx');
  assert.match(discover, /pathname: '\/note', params: \{ id: latestDossier\.id \}/);
  assert.match(archive, /pathname: '\/note', params: \{ id: note\.id \}/);
});

test('notes wait for local-store hydration and expose linked idea metadata', () => {
  const notes = source('app/(tabs)/notes.tsx');
  assert.match(notes, /if \(!ready\)/);
  assert.match(notes, /item\.tags/);
  assert.match(notes, /item\.ideaId/);
  assert.match(source('app/(tabs)/library.tsx'), /if \(!ready\)/);
  assert.match(source('app/research-activity.tsx'), /if \(!ready\)/);
});

test('public-attention comparisons support a bounded dynamic topic list', () => {
  const demand = source('app/search-demand.tsx');
  assert.match(demand, /topics\.map\(\(topic, index\)/);
  assert.match(demand, /topics\.length >= 8/);
  assert.doesNotMatch(demand, /slice\(0, 3\)/);
  assert.match(demand, /PUBLIC ATTENTION/);
});

test('YouTube research distinguishes standard sample from advanced Discovery Mix', () => {
  const standard = source('app/youtube.tsx');
  const advanced = source('app/trend-intelligence.tsx');
  assert.match(standard, /multi-lane Discovery Mix/);
  assert.match(advanced, /Advanced YouTube Discovery Mix/);
  assert.match(advanced, /not continuous trend monitoring/i);
});

test('settings use task-based sections and diagnostics are explicitly synthetic', () => {
  const settings = source('app/settings.tsx');
  const diagnostics = source('app/diagnostics.tsx');
  assert.match(settings, /Profile, language and discovery/);
  assert.match(settings, /Connections & AI providers/);
  assert.match(settings, /Automation & quota management/);
  assert.match(settings, /Backup, privacy and diagnostics/);
  assert.match(diagnostics, /MOCK \/ SYNTHETIC/);
  assert.match(diagnostics, /not end-to-end provider tests/);
});

test('publisher and research-source links do not silently swallow open failures', () => {
  for (const path of ['app/cosmic-news.tsx', 'app/deep-research.tsx', 'app/detail.tsx', 'app/research-activity.tsx', 'app/youtube.tsx', 'app/trend-intelligence.tsx']) {
    assert.doesNotMatch(source(path), /Linking\.openURL\([^\n]*\.catch\(\(\) => \{\}\)/);
  }
});
