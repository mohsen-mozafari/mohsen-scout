import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ClipboardCopy, Copy, Play, RefreshCw } from 'lucide-react-native';
import {
  Page,
  Panel,
  Heading,
  Txt,
  Action,
  Field,
  Choices,
  MetricCard,
  BadgeText,
  ErrorBox,
  styles,
} from '@/components/ScoutUI';
import { useScout } from '@/lib/store';
import { runDiagnostics, formatDiagnosticReport, type TestResult } from '@/lib/diagnostics';
import { palette as p } from '@/lib/theme';
import { useLocalSearchParams } from 'expo-router';

type CheckFilter = 'All checks' | 'Failed only';

export default function Diagnostics() {
  const { run } = useLocalSearchParams<{ run?: string }>();
  const language = useScout((state) => state.data.preferences.uiLanguage ?? 'fa');
  const [results, setResults] = useState<TestResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<CheckFilter>('All checks');
  const [search, setSearch] = useState('');
  const [runError, setRunError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [copyError, setCopyError] = useState('');
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const autoRunStarted = useRef(false);
  const executionInFlight = useRef(false);

  const execute = useCallback(async () => {
    if (executionInFlight.current) return;
    executionInFlight.current = true;
    setBusy(true);
    setRunError('');
    setCopyMessage('');
    setCopyError('');
    try {
      const next = await runDiagnostics();
      setResults(next);
      setLastRunAt(Date.now());
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'The mock runner could not complete.');
    } finally {
      executionInFlight.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (run === '1' && !autoRunStarted.current) {
      autoRunStarted.current = true;
      void execute();
    }
  }, [run, execute]);

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  const visibleResults = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return results.filter((result) => {
      if (filter === 'Failed only' && result.passed) return false;
      return !query || (result.name + ' ' + (result.detail ?? '')).toLocaleLowerCase().includes(query);
    });
  }, [results, filter, search]);

  const copyReport = useCallback(async (failuresOnly = false) => {
    setCopyMessage('');
    setCopyError('');
    try {
      await Clipboard.setStringAsync(formatDiagnosticReport(results, failuresOnly));
      setCopyMessage(failuresOnly ? 'Failed checks copied to clipboard.' : 'Full test report copied to clipboard.');
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : 'Clipboard access failed.');
    }
  }, [results]);

  return (
    <Page
      title="Mock regression console"
      eyebrow="APP HEALTH"
      subtitle="Run isolated synthetic checks, inspect failures and copy a reproducible report."
      showBack
    >
      <Panel>
        <View style={[styles.rowBetween, { flexWrap: 'wrap' }]}>
          <BadgeText>LOCAL · NO LIVE API</BadgeText>
          <Txt muted>{busy ? 'Running checks…' : lastRunAt ? 'Last run: ' + new Date(lastRunAt).toLocaleString(language === 'fa' ? 'fa-IR' : 'en-US') : 'Not run in this session'}</Txt>
        </View>
        <Heading>{results.length ? 'Regression test results' : 'Ready to test this build'}</Heading>
        <Txt muted>
          Synthetic responses only. No real API keys, network requests to providers or changes to your saved research are made by these checks.
        </Txt>
        <Action icon={results.length ? RefreshCw : Play} busy={busy} onPress={() => void execute()}>
          {results.length ? 'Rerun all mock tests' : 'Run mock tests'}
        </Action>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <MetricCard label="PASSED" value={passed} tone="mint" hint="Checks completed successfully" />
          <MetricCard label="FAILED" value={failed} tone="amber" hint="Checks requiring attention" />
          <MetricCard label="TOTAL" value={results.length} hint="Registered regression cases" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Action secondary icon={ClipboardCopy} disabled={!results.length || busy} onPress={() => void copyReport(false)}>
              Copy full report
            </Action>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Action secondary icon={Copy} disabled={!failed || busy} onPress={() => void copyReport(true)}>
              Copy failures
            </Action>
          </View>
        </View>
        {copyMessage ? <Txt muted>{copyMessage}</Txt> : null}
        {copyError ? <Txt muted>{copyError}</Txt> : null}
        {runError ? <ErrorBox message={runError} onRetry={() => void execute()} /> : null}
      </Panel>

      {results.length ? (
        <View style={{ gap: 10 }}>
          <Heading>Find a test</Heading>
          <Field
            label="Search test names and failure details"
            value={search}
            onChange={setSearch}
            placeholder="e.g. quota, cursor, backup, schedule"
          />
          <Choices
            label="Show"
            options={['All checks', 'Failed only'] as const}
            selected={[filter]}
            onChange={(values) => setFilter(values[0])}
          />
          <View style={[styles.rowBetween, { flexWrap: 'wrap' }]}>
            <Txt muted>{visibleResults.length} of {results.length} checks shown</Txt>
            <BadgeText>{failed === 0 ? 'NO FAILURES' : failed + ' NEED ATTENTION'}</BadgeText>
          </View>
          <View style={{ gap: 0 }}>
            {visibleResults.map((result, index) => (
              <View key={result.name} style={[styles.rule, { paddingTop: index === 0 ? 0 : 11, paddingBottom: 11 }]}>
                <View style={[styles.row, { alignItems: 'flex-start' }]}>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Text style={[styles.text, { color: result.passed ? p.success : p.danger, fontFamily: 'Inter_700Bold', fontSize: 11 }]}>
                      {result.passed ? 'PASS' : 'FAIL'}
                    </Text>
                    <Text style={styles.text}>{result.name}</Text>
                    {result.detail ? <Text style={styles.muted}>{result.detail}</Text> : null}
                  </View>
                </View>
              </View>
            ))}
          </View>
          {!visibleResults.length ? (
            <Panel>
              <Heading>No matching tests</Heading>
              <Txt muted>{filter === 'Failed only' ? 'There are no failed checks in this run.' : 'Try another search phrase.'}</Txt>
            </Panel>
          ) : null}
        </View>
      ) : (
        <Panel>
          <Heading>What this test suite protects</Heading>
          <Txt muted>API response validation, retry and quota boundaries, result deduplication, empty and malformed samples, local backup integrity, retention rules, note block behavior, scheduler transitions and notification routing.</Txt>
          <Txt muted>Run the suite to see each case separately. You can rerun it at any time and copy either the complete report or only failing cases.</Txt>
        </Panel>
      )}
    </Page>
  );
}
