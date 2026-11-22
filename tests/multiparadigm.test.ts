import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMultiParadigmAnalysis, type MultiParadigmInput } from '../lib/multiparadigm';

const sample = (): MultiParadigmInput => ({
  topic: 'JWST exoplanet atmosphere',
  news: [
    { title: 'JWST detects molecules in exoplanet atmosphere', summary: 'The telescope measured an atmosphere spectrum.', sourceName: 'NASA', sourceId: 'nasa', publishedAt: '2026-11-15T10:00:00.000Z' },
    { title: 'European team reviews exoplanet atmosphere observations', summary: 'Independent researchers discuss spectrum uncertainty.', sourceName: 'ESA', sourceId: 'esa-science', publishedAt: '2026-11-10T10:00:00.000Z' },
    { title: 'JWST exoplanet atmosphere analysis updated', summary: 'A new paper compares the measurement method.', sourceName: 'Science Daily', sourceId: 'science-daily', publishedAt: '2026-11-05T10:00:00.000Z' },
    { title: 'JWST spectroscopy and atmospheric molecules', summary: 'Researchers report spectral observations.', sourceName: 'NASA', sourceId: 'nasa', publishedAt: '2026-10-25T10:00:00.000Z' },
  ],
  videos: [
    { id: 'v1', title: 'JWST exoplanet atmosphere explained', channel: 'Science A', publishedAt: '2026-11-12T10:00:00.000Z' },
    { id: 'v2', title: 'What JWST found in an exoplanet atmosphere', channel: 'Science B', publishedAt: '2026-11-08T10:00:00.000Z' },
    { id: 'v3', title: 'Exoplanet atmosphere spectroscopy explained', channel: 'Science C', publishedAt: '2026-11-01T10:00:00.000Z' },
  ],
  wikiObservations: [
    { month: '2026-06', views: 100 }, { month: '2026-07', views: 110 },
    { month: '2026-08', views: 105 }, { month: '2026-09', views: 130 },
    { month: '2026-10', views: 145 }, { month: '2026-11', views: 150 },
  ],
  trend: { direction: 'rising', observations: 6, changePercent: 25, anomaly: null },
  independentPublisherFamilies: 3, undatedPublisherItems: 0, stalePublisherItems: 0,
  entities: [
    { id: 'jwst', name: 'JWST', mentionCount: 5, sourceIds: ['nasa', 'esa-science'] },
    { id: 'nasa', name: 'NASA', mentionCount: 4, sourceIds: ['nasa'] },
    { id: 'exoplanet', name: 'Exoplanet', mentionCount: 3, sourceIds: ['nasa', 'esa-science'] },
  ],
  relations: [
    { fromEntityId: 'jwst', toEntityId: 'nasa', evidenceCount: 3 },
    { fromEntityId: 'jwst', toEntityId: 'exoplanet', evidenceCount: 2 },
  ],
  gaps: ['The original spectrum and uncertainty interval need checking.'],
  contradictions: [], now: Date.parse('2026-11-22T12:00:00.000Z'), language: 'en',
});

void test('returns eight independent reasoning lenses, not a single composite score', () => {
  const result = buildMultiParadigmAnalysis(sample());
  assert.equal(result.version, 1);
  assert.equal(result.lenses.length, 8);
  assert.equal(result.readiness, 'well-supported');
  assert.deepEqual(result.lenses.map((item) => item.id), ['evidence', 'semantic', 'temporal', 'network', 'adversarial', 'causal', 'creative', 'decision']);
  assert.ok(result.lenses.every((item) => item.findings.length > 0));
  assert.ok(result.centralEntities.includes('JWST'));
  assert.ok(result.creativeDirections.length >= 4);
});

void test('empty evidence stays exploratory and never fabricates causal support', () => {
  const input = sample();
  input.news = []; input.videos = []; input.wikiObservations = []; input.entities = []; input.relations = [];
  input.independentPublisherFamilies = 0;
  input.trend = { direction: 'insufficient-data', observations: 0, changePercent: null, anomaly: null };
  input.gaps = ['No primary source was supplied.'];
  const result = buildMultiParadigmAnalysis(input);
  assert.equal(result.readiness, 'exploratory');
  assert.equal(result.lenses.find((item) => item.id === 'evidence')?.status, 'limited');
  assert.equal(result.lenses.find((item) => item.id === 'causal')?.status, 'hypothesis');
  assert.ok(result.synthesis.includes('not enough evidence'));
  assert.ok(result.nextActions.some((item) => item.toLowerCase().includes('primary')));
});

void test('potential contradictions trigger adversarial review and an explicit resolution action', () => {
  const input = sample();
  input.contradictions = ['Similar source headlines contain different numeric claims.'];
  const result = buildMultiParadigmAnalysis(input);
  assert.equal(result.lenses.find((item) => item.id === 'adversarial')?.status, 'warning');
  assert.ok(result.nextActions.some((item) => item.includes('measurement method')));
  assert.equal(result.readiness, 'developing');
});

void test('reports more than one day in the future are excluded from current temporal counts', () => {
  const input = sample();
  input.news = [
    { ...input.news[0], publishedAt: '2026-11-25T12:00:00.000Z' },
    { ...input.news[1], publishedAt: '2026-10-01T12:00:00.000Z' },
  ];
  input.wikiObservations = [];
  input.trend = { direction: 'insufficient-data', observations: 0, changePercent: null, anomaly: null };
  const result = buildMultiParadigmAnalysis(input);
  assert.ok(result.lenses.find((item) => item.id === 'temporal')?.findings.some((item) => item.includes('0 publisher reports')));
  assert.equal(result.lenses.find((item) => item.id === 'temporal')?.status, 'limited');
});

void test('large batches keep generated findings bounded', () => {
  const input = sample();
  input.news = Array.from({ length: 2500 }, (_, index) => ({
    title: 'JWST exoplanet research report ' + index,
    summary: 'Atmosphere spectral observation and measurement ' + index,
    sourceName: 'Publisher ' + (index % 20), sourceId: 'publisher-' + (index % 20),
    publishedAt: new Date(input.now - index * 3600000).toISOString(),
  }));
  const result = buildMultiParadigmAnalysis(input);
  assert.equal(result.lenses.length, 8);
  assert.ok(result.lenses.every((item) => item.findings.length <= 5));
  assert.ok(result.creativeDirections.length <= 5);
});
