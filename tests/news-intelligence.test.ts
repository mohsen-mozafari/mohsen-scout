import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPublisherIntelligence } from '../lib/news-intelligence';
import type { SpaceNewsItem } from '../lib/space';

const now = Date.parse('2026-11-22T12:00:00Z');
const item = (
  id: string,
  sourceId: SpaceNewsItem['sourceId'],
  sourceName: string,
  title: string,
  publishedAt: string | null,
  url = 'https://' + sourceId + '.example/' + id,
): SpaceNewsItem => ({
  id,
  sourceId,
  sourceName,
  title,
  summary: 'Independent publisher report with source context.',
  url,
  publishedAt,
});

void test('publisher intelligence deduplicates URLs and preserves independent publisher coverage', async () => {
  const input = [
    item('a', 'nasa', 'NASA', 'JWST methane spectroscopy results', '2026-11-21T10:00:00Z'),
    item('b', 'esa-science', 'ESA', 'Separate ESA methane measurement report', '2026-11-21T10:00:00Z'),
    item('a-copy', 'nasa', 'NASA', 'JWST methane spectroscopy results', '2026-11-21T10:00:00Z', 'https://nasa.example/a'),
  ];
  const result = await buildPublisherIntelligence(input, now);
  assert.equal(result.inputCount, 3);
  assert.equal(result.uniqueCount, 2);
  assert.equal(result.duplicatesMerged, 1);
  assert.ok(result.clusters.some((cluster) => cluster.publishers.length === 2));
  assert.ok(!result.clusters.some((cluster) => /independent publisher|publisher report|source context/.test(cluster.title)));
});

void test('publisher momentum compares equivalent current and previous windows', async () => {
  const input = [
    item('a', 'nasa', 'NASA', 'JWST methane discovery', '2026-11-21T10:00:00Z'),
    item('b', 'esa-science', 'ESA', 'JWST methane observation', '2026-11-20T10:00:00Z'),
    item('c', 'space-com', 'Space.com', 'JWST methane analysis', '2026-11-10T10:00:00Z'),
  ];
  const result = await buildPublisherIntelligence(input, now, 7);
  const cluster = result.clusters.find((entry) => entry.title === 'methane');
  assert.ok(cluster);
  assert.equal(cluster.currentWindowCount, 2);
  assert.equal(cluster.previousWindowCount, 1);
  assert.equal(cluster.momentum, 'rising');
  assert.equal(cluster.momentumDelta, 1);
});

void test('Persian text normalization groups Arabic and Persian letter variants', async () => {
  const input = [
    item('fa-1', 'nasa', 'NASA', 'کشف جو سیاره فراخورشیدی', '2026-11-21T10:00:00Z'),
    item('fa-2', 'esa-science', 'ESA', 'كشف جو سیاره فراخورشیدی', '2026-11-20T10:00:00Z'),
  ];
  const result = await buildPublisherIntelligence(input, now);
  assert.ok(result.clusters.some((cluster) => cluster.title.includes('فراخورشیدی')));
});

void test('undated and future-dated publisher records are never counted as fresh momentum', async () => {
  const input = [
    item('undated', 'nasa', 'NASA', 'JWST methane research', null),
    item('future', 'esa-science', 'ESA', 'JWST methane new observation', '2026-11-23T10:00:00Z'),
  ];
  const result = await buildPublisherIntelligence(input, now);
  assert.equal(result.undatedCount, 2);
  assert.equal(result.clusters.find((cluster) => cluster.title === 'methane')?.currentWindowCount, 0);
});

void test('publisher intelligence never changes the supplied records and labels its score as feed coverage', async () => {
  const input = [item('a', 'nasa', 'NASA', 'JWST methane spectroscopy', '2026-11-21T10:00:00Z')];
  const before = JSON.stringify(input);
  const result = await buildPublisherIntelligence(input, now);
  assert.equal(JSON.stringify(input), before);
  assert.ok(result.clusters.every((cluster) => typeof cluster.publisherCoverageScore === 'number'));
  assert.ok(result.clusters.every((cluster) => cluster.reason.includes('publisher report')));
  assert.ok(result.limitations.some((line) => line.includes('not YouTube demand')));
});


void test('large publisher samples keep exact window counts and only the latest three traceable records', async () => {
  const descriptions = [
    'calibration alignment reference', 'thermal profile detector',
    'infrared atmospheric signature', 'observatory detection limits',
    'absorption transition molecule', 'stellar irradiation chemistry',
    'planetary atmosphere abundance', 'wavelength resolution baseline',
    'photometric followup uncertainty', 'transit observation model',
    'molecular line broadening', 'signal extraction residual',
    'detector background calibration', 'laboratory spectral profile',
    'isotope abundance estimate', 'cloud opacity retrieval',
    'orbital phase variation', 'instrument sensitivity test',
    'statistical confidence interval', 'spectral response comparison',
  ];
  const input = Array.from({ length: 160 }, (_, index) => {
    const day = index % 14;
    const sourceId = index % 3 === 0 ? 'nasa' : index % 3 === 1 ? 'esa-science' : 'space-com';
    const sourceName = sourceId === 'nasa' ? 'NASA' : sourceId === 'esa-science' ? 'ESA' : 'Space.com';
    return item(
      'bulk-' + index,
      sourceId,
      sourceName,
      'Methane spectroscopy ' + descriptions[index % descriptions.length] + ' JWST observation report ' + index,
      new Date(now - day * 86400000).toISOString(),
    );
  });
  const result = await buildPublisherIntelligence(input, now, 7);
  const methane = result.clusters.find((cluster) => cluster.title === 'methane');
  assert.ok(methane);
  assert.equal(result.uniqueCount, input.length);
  assert.equal(methane.articleCount, input.length);
  assert.equal(methane.currentWindowCount + methane.previousWindowCount, input.length);
  assert.equal(methane.evidence.length, 3);
  const evidenceDates = methane.evidence.map((entry) => Date.parse(entry.publishedAt ?? ''));
  assert.deepEqual(evidenceDates, [...evidenceDates].sort((left, right) => right - left));
  assert.equal(new Set(methane.publishers).size, 3);
});
