import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { Skeleton } from 'heroui-native';
import { Page, Heading, Txt, Action, styles } from '@/components/ScoutUI';
import { runDiagnostics, type TestResult } from '@/lib/diagnostics';
import { palette as p } from '@/lib/theme';
export default function Diagnostics() {
  const { run } = useLocalSearchParams<{ run?: string }>();
  const [results, setResults] = useState<TestResult[]>([]);
  const [busy, setBusy] = useState(false);
  const execute = async () => {
    setBusy(true);
    try {
      setResults(await runDiagnostics());
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (run === '1') {
      void runDiagnostics().then(setResults);
    }
  }, [run]);
  const passed = results.filter((r) => r.passed).length;
  return (
    <Page title="Mock regression checks">
      <Link href="/settings" style={styles.badge}>
        Back to Settings
      </Link>
      <Txt muted>
        Isolated synthetic API responses. No live service calls, real keys, or changes to your
        research data.
      </Txt>
      <Action busy={busy} onPress={() => void execute()}>
        Run mock tests
      </Action>
      {results.length > 0 && (
        <Heading>
          {passed} passed · {results.length - passed} failed · {results.length} tests
        </Heading>
      )}
      {results.length === 0 && run === '1' && <Skeleton className="h-20 rounded-xl" />}
      {results.map((r) => (
        <View key={r.name} style={[styles.rule, { gap: 4 }]}>
          <Text style={[styles.text, { color: r.passed ? p.success : p.danger }]}>
            {r.passed ? 'PASS' : 'FAIL'} · {r.name}
          </Text>
          {r.detail && <Txt>{r.detail}</Txt>}
        </View>
      ))}
    </Page>
  );
}
