import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

void test('external navigation validates web URLs and reports failure visibly', () => {
  const helper = source('lib/external-links.ts');
  assert.ok(helper.includes("value.startsWith('https://')") && helper.includes("value.startsWith('http://')"));
  assert.match(helper, /Alert\.alert/);
  assert.match(helper, /Could not open link/);
});

void test('in-app browser exposes history and refresh controls', () => {
  const browser = source('app/browser.tsx');
  assert.match(browser, /goBack\(\)/);
  assert.match(browser, /goForward\(\)/);
  assert.match(browser, /reload\(\)/);
  assert.match(browser, /canGoBack/);
  assert.match(browser, /canGoForward/);
});

void test('saved research reopens exact Deep Research note IDs', () => {
  const discover = source('app/(tabs)/discover.tsx');
  const archive = source('components/ResearchArchive.tsx');
  assert.match(discover, /pathname: '\/note', params: \{ id: latestDossier\.id \}/);
  assert.match(archive, /pathname: '\/note', params: \{ id: note\.id \}/);
});

void test('notes wait for local-store hydration and expose linked idea metadata', () => {
  const notes = source('app/(tabs)/notes.tsx');
  assert.match(notes, /if \(!ready\)/);
  assert.match(notes, /item\.tags/);
  assert.match(notes, /item\.ideaId/);
  assert.match(source('app/(tabs)/library.tsx'), /if \(!ready\)/);
  assert.match(source('app/research-activity.tsx'), /if \(!ready\)/);
});

void test('public-attention comparisons support a bounded dynamic topic list', () => {
  const demand = source('app/search-demand.tsx');
  assert.match(demand, /topics\.map\(\(topic, index\)/);
  assert.match(demand, /topics\.length >= 8/);
  assert.doesNotMatch(demand, /slice\(0, 3\)/);
  assert.match(demand, /PUBLIC ATTENTION/);
});

void test('standard and advanced YouTube discovery share one research workspace', () => {
  const standard = source('app/youtube.tsx');
  const advanced = source('app/trend-intelligence.tsx');
  const detail = source('app/detail.tsx');
  assert.match(standard, /AdvancedDiscoveryPanel/);
  assert.match(standard, /title="Advanced YouTube Discovery Mix"/);
  assert.match(advanced, /export function AdvancedDiscoveryPanel/);
  assert.doesNotMatch(advanced, /import \{[^}]*\bPage\b/);
  assert.match(advanced, /router\.replace\(/);
  assert.match(advanced, /pathname: '\/youtube'/);
  assert.match(detail, /mode: 'advanced'/);
  assert.match(advanced, /does not claim to measure the whole platform/i);
});

void test('Cosmic News separates signal overview from publisher-feed controls', () => {
  const news = source('app/cosmic-news.tsx');
  assert.match(news, /Publisher feed/);
  assert.match(news, /public-attention signals/);
  assert.match(news, /SPACE RADAR · OFFICIAL SIGNALS/);
});

void test('shared controls expose labels, expanded state and RTL-aware direction', () => {
  const ui = source('components/ScoutUI.tsx');
  assert.match(ui, /accessibilityLabel=\{summary \? translatedTitle/);
  assert.match(ui, /accessibilityHint=\{translateText\(expanded \?/);
  assert.match(ui, /accessibilityLabel=\{translatedLabel\}/);
  assert.match(ui, /accessibilityLabel=\{title\}/);
  assert.match(ui, /writingDirection: direction/);
});

void test('detail page folds optional AI review and idea-management actions', () => {
  const detail = source('app/detail.tsx');
  assert.match(detail, /<Fold title="Second opinion and AI review"/);
  assert.match(detail, /<Fold title="Idea management and retention"/);
});

void test('browser, unified research and accessibility copy has Persian translations', () => {
  const i18n = source('lib/i18n.ts');
  for (const phrase of ['Web Browser', 'Open a website or search the web', 'Open in external browser', 'Advanced YouTube Discovery Mix', 'Publisher feed', 'Collapse section']) {
    assert.ok(i18n.includes(JSON.stringify(phrase) + ':'));
  }
});

void test('settings use task-based sections and diagnostics are explicitly synthetic', () => {
  const settings = source('app/settings.tsx');
  const diagnostics = source('app/diagnostics.tsx');
  assert.match(settings, /Profile, language and discovery/);
  assert.match(settings, /Connections & AI providers/);
  assert.match(settings, /Automation & quota management/);
  assert.match(settings, /Backup, privacy and diagnostics/);
  assert.match(diagnostics, /MOCK \/ SYNTHETIC/);
  assert.match(diagnostics, /not end-to-end provider tests/);
});

void test('publisher and research-source links do not silently swallow open failures', () => {
  for (const path of ['app/cosmic-news.tsx', 'app/deep-research.tsx', 'app/detail.tsx', 'app/research-activity.tsx', 'app/youtube.tsx', 'app/trend-intelligence.tsx', 'app/(tabs)/library.tsx', 'app/note.tsx', 'components/VideoRow.tsx']) {
    assert.doesNotMatch(source(path), /Linking\.openURL\([^\n]*\.catch\(\(\) => \{\}\)/);
    assert.doesNotMatch(source(path), /Linking\.openURL/);
  }
});

void test('idea detail exposes one save action for each save operation', () => {
  const detail = source('app/detail.tsx');
  assert.equal((detail.match(/onPress=\{saveVideoIdea\}/g) ?? []).length, 1);
});

void test('shared video rows use the validated external-link handler', () => {
  const videoRow = source('components/VideoRow.tsx');
  assert.match(videoRow, /openExternalUrl\(/);
  assert.doesNotMatch(videoRow, /Linking\.openURL/);
});

void test('release metadata and workflow agree on version 1.30.0', () => {
  const config = source('app.config.ts');
  const workflow = source('.github/workflows/android-apk-v1.24.0-full-audit.yml');
  const changelog = source('CHANGELOG_1.30.0.md');
  assert.ok(config.includes("version: '1.30.0'"));
  assert.ok(config.includes('versionCode: 51'));
  assert.ok(workflow.includes("versionCode='51'"));
  assert.ok(workflow.includes("versionName='1.30.0'"));
  assert.ok(workflow.includes('1.30.0'));
  assert.ok(workflow.includes('android-apk-v1.24.0-full-audit.yml'));
  assert.match(changelog, /Research-engine integration|research-engine integration/);
});


void test('dashboard removes redundant panels while retaining best-idea, second-opinion and session-health areas', () => {
  const home = source('app/(tabs)/index.tsx');
  assert.doesNotMatch(home, /Research at a glance|Unified research workspace|خلاصه وضعیت پژوهش|فضای پژوهش یکپارچه/);
  assert.match(home, /FEATURED IDEA|ایدهٔ برتر/);
  assert.match(home, /showFeaturedIdea=\{false\}/);
  assert.match(home, /ResearchOverviewChart/);
  assert.match(home, /EngineAIReview/);
  assert.match(home, /SESSION HEALTH|سلامت نشست/);
  assert.match(home, /selectDashboardFeaturedIdeas/);
});

void test('dashboard heavy local analysis runs only after expansion and user interactions settle', () => {
  const home = source('app/(tabs)/index.tsx');
  assert.match(home, /if \(analysisExpanded && latestReportId\)/);
  assert.match(home, /setTimeout\(/);
  assert.match(home, /clearTimeout\(timer\)/);
  assert.match(home, /onExpandedChange=\{setAnalysisExpanded\}/);
});

void test('research archive virtualizes rows and subscribes only to displayed data domains', () => {
  const archive = source('components/ResearchArchive.tsx');
  assert.match(archive, /<FlatList/);
  assert.doesNotMatch(archive, /<ScrollView/);
  assert.match(archive, /initialNumToRender=\{8\}/);
  assert.match(archive, /windowSize=\{5\}/);
  assert.match(archive, /state\.data\.reports/);
  assert.match(archive, /state\.data\.ideas/);
  assert.match(archive, /state\.data\.links/);
  assert.match(archive, /state\.data\.notes/);
  assert.doesNotMatch(archive, /const data = useScout\(/);
});

void test('application uses pure-black AMOLED canvas without changing accent palette', () => {
  const theme = source('lib/theme.ts');
  const config = source('app.config.ts');
  assert.match(theme, /background: '#000000'/);
  assert.match(theme, /nav: '#000000'/);
  assert.match(theme, /accent: '#76B9FF'/);
  assert.match(config, /backgroundColor: '#000000'/);
  assert.match(config, /\['expo-splash-screen', \{ backgroundColor: '#000000' \}\]/);
});

void test('three-section workspace and page headers respect Android status-bar safe area', () => {
  const workspace = source('app/(tabs)/workspace.tsx');
  const ui = source('components/ScoutUI.tsx');
  const archive = source('components/ResearchArchive.tsx');
  const library = source('app/(tabs)/library.tsx');
  const notes = source('app/(tabs)/notes.tsx');
  assert.match(workspace, /StatusBar\.currentHeight/);
  assert.match(workspace, /paddingTop: safeTop \+ 8/);
  assert.match(ui, /StatusBar\.currentHeight/);
  assert.match(archive, /<AppHeader safeArea=\{false\}/);
  assert.match(library, /safeAreaTop=\{false\}/);
  assert.match(notes, /safeAreaTop=\{false\}/);
});


void test('library and notes screens avoid broad subscriptions and repeated linear lookups', () => {
  const library = source('app/(tabs)/library.tsx');
  const notes = source('app/(tabs)/notes.tsx');
  const backup = source('lib/backup.ts');
  assert.match(library, /(?:s|state)\.data\.links/);
  assert.match(library, /(?:s|state)\.data\.videos/);
  assert.doesNotMatch(library, /const data = useScout\(/);
  assert.match(library, /new Map\(videos\.map/);
  assert.match(library, /videosById\.get\(item\.id\)/);
  assert.match(library, /useMemo\(\(\) => links/);
  assert.match(library, /personalLinks\(\{ links \}\)/);
  assert.match(backup, /personalLinks\(data: Pick<LocalData, 'links'>\)/);
  assert.match(notes, /useMemo\(\(\) => notes/);
  assert.match(notes, /new Set\(ideas\.map/);
  assert.match(notes, /ideaIds\.has\(item\.ideaId\)/);
});


void test('legacy fixed-interval background task is retired and configured scheduler is sole schedule owner', () => {
  const root = source('app/_layout.tsx');
  const legacy = source('lib/autonomous-background-task.ts');
  const scheduler = source('lib/scheduler.ts');
  assert.match(root, /unregisterLegacyAutonomousResearchBackgroundTask/);
  assert.doesNotMatch(root, /registerAutonomousResearchBackgroundTask/);
  assert.doesNotMatch(legacy, /TaskManager\.defineTask|TaskManager\.registerTaskAsync/);
  assert.match(legacy, /unregisterTaskAsync/);
  assert.match(scheduler, /prefs\.schedule === 'Manual'/);
  assert.match(scheduler, /prefs\.paused/);
  assert.match(scheduler, /unregisterTaskAsync/);
});

void test('publisher, YouTube, web and Wikimedia collection run concurrently and adaptive searches are batched', () => {
  const store = source('lib/store.ts');
  const deepResearch = source('app/deep-research.tsx');
  assert.match(store, /Promise\.all\(\[youtubeTaskPromise, feedTask\(\), webTask\(\), wikiTask\(\)\]\)/);
  assert.match(store, /if \(youtubeTaskPromise\) await youtubeTaskPromise/);
  assert.match(store, /youtubeSignals,/);
  assert.match(store, /mapWithConcurrency\(initialPreferences\.webResearchEnabled \? batch : \[\], 2,/);
  assert.match(store, /runResearchAgentSerialized\(/);
  assert.match(store, /internalEngineFindings,\s+evidence:/);
  assert.doesNotMatch(store, /youtubeSignals: finalSignals/);
  assert.match(deepResearch, /mapWithConcurrency\(plan\.queries, 2,/);
});

void test('autonomous queue is versioned and persists claims through serialized queue updates', () => {
  const queue = source('lib/autonomous-queue.ts');
  assert.match(queue, /AUTONOMOUS_QUEUE_VERSION = 2/);
  assert.match(queue, /LEGACY_KEY/);
  assert.match(queue, /updateAutonomousQueue/);
  assert.match(queue, /claimNextAutonomousJob/);
  assert.match(queue, /serializeQueue/);
});

void test('pending recovery is versioned and bounded and saves durable completion markers', () => {
  const pending = source('lib/pending-research.ts');
  const store = source('lib/store.ts');
  assert.match(pending, /MAX_PENDING_RESEARCH_TASKS = 250/);
  assert.match(pending, /version: 2/);
  assert.match(store, /stage: 'ideas-saved'/);
  assert.match(store, /analyzedReportIds/);
});
