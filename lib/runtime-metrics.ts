import { useEffect, useState } from 'react';

export type RuntimeModule = 'YouTube' | 'Sources' | 'Wikimedia' | 'Engine' | 'AI';
/** `skipped` is additive: an optional feature that was intentionally not run is not a failure. */
export type RuntimeOutcome = 'success' | 'partial' | 'error' | 'skipped';

type ModuleMetrics = {
  attempted: number;
  succeeded: number;
  partial: number;
  failed: number;
  skipped: number;
  lastStartedAt: number;
  lastCompletedAt: number;
  lastError: string;
};

export type RuntimeMetrics = {
  modules: Record<RuntimeModule, ModuleMetrics>;
  attempted: number;
  succeeded: number;
  partial: number;
  failed: number;
  skipped: number;
  lastStartedAt: number;
  lastCompletedAt: number;
  lastSuccessAt: number;
  lastError: string;
};

const emptyModule = (): ModuleMetrics => ({
  attempted: 0,
  succeeded: 0,
  partial: 0,
  failed: 0,
  skipped: 0,
  lastStartedAt: 0,
  lastCompletedAt: 0,
  lastError: '',
});

const createEmpty = (): RuntimeMetrics => ({
  modules: {
    YouTube: emptyModule(),
    Sources: emptyModule(),
    Wikimedia: emptyModule(),
    Engine: emptyModule(),
    AI: emptyModule(),
  },
  attempted: 0,
  succeeded: 0,
  partial: 0,
  failed: 0,
  skipped: 0,
  lastStartedAt: 0,
  lastCompletedAt: 0,
  lastSuccessAt: 0,
  lastError: '',
});

let snapshot = createEmpty();
const listeners = new Set<() => void>();

function publish(next: RuntimeMetrics) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function getRuntimeMetrics(): RuntimeMetrics {
  return snapshot;
}

export function subscribeRuntimeMetrics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Turn raw provider/storage errors into a clear reason and next action. */
export function runtimeErrorHint(message: string, language: 'fa' | 'en' = 'en'): string {
  const value = message.toLowerCase();
  const isFa = language === 'fa';
  if (/quota|rate.?limit|429|daily limit|exhausted/.test(value)) {
    return isFa
      ? 'سهمیهٔ روزانه یا نرخ مجاز این سرویس تمام شده است؛ سهمیه را در تنظیمات بررسی کن و پس از بازنشانی دوباره اجرا کن.'
      : 'The provider quota or request rate limit was reached. Check the quota in Settings and retry after it resets.';
  }
  if (/401|403|unauthori[sz]ed|forbidden|api.?key|credential|invalid key/.test(value)) {
    return isFa
      ? 'کلید API نامعتبر، حذف‌شده یا فاقد مجوز است؛ کلید را در تنظیمات بررسی و دوباره آزمایش کن.'
      : 'The API key is missing, invalid or lacks permission. Review the key in Settings and test it again.';
  }
  if (/sqlite_full|disk is full|no space|storage|database|sqlite/.test(value)) {
    return isFa
      ? 'ذخیره‌سازی محلی کامل نشد؛ فضای خالی دستگاه را بررسی کن و دوباره ذخیره را انجام بده.'
      : 'Local storage could not complete the save. Free device space, then retry the operation.';
  }
  if (/network|fetch|timeout|timed out|connection|dns|socket|internet|offline/.test(value)) {
    return isFa
      ? 'ارتباط شبکه برقرار نشد یا پاسخ به‌موقع نرسید؛ اینترنت را بررسی کن و دوباره تلاش کن.'
      : 'The network request could not connect or timed out. Check the connection and retry.';
  }
  return isFa
    ? 'این بخش نتوانست کار را کامل کند؛ تنظیمات، اتصال و ورودی تحقیق را بررسی و سپس دوباره اجرا کن.'
    : 'This module could not complete the operation. Check its settings, connection and research input, then retry.';
}

/** Lightweight in-memory counters; they are never presented as lifetime/project-wide telemetry. */
export function recordRuntimeStart(module: RuntimeModule, at = Date.now()): void {
  const current = snapshot.modules[module];
  publish({
    ...snapshot,
    modules: {
      ...snapshot.modules,
      [module]: { ...current, attempted: current.attempted + 1, lastStartedAt: at },
    },
    attempted: snapshot.attempted + 1,
    lastStartedAt: at,
  });
}

export function recordRuntimeFinish(
  module: RuntimeModule,
  outcome: RuntimeOutcome,
  error = '',
  at = Date.now(),
): void {
  const current = snapshot.modules[module];
  const nextModule = {
    ...current,
    succeeded: current.succeeded + (outcome === 'success' ? 1 : 0),
    partial: current.partial + (outcome === 'partial' ? 1 : 0),
    failed: current.failed + (outcome === 'error' ? 1 : 0),
    skipped: current.skipped + (outcome === 'skipped' ? 1 : 0),
    lastCompletedAt: at,
    lastError: outcome === 'error' ? error.slice(0, 240) : current.lastError,
  };
  publish({
    ...snapshot,
    modules: { ...snapshot.modules, [module]: nextModule },
    succeeded: snapshot.succeeded + (outcome === 'success' ? 1 : 0),
    partial: snapshot.partial + (outcome === 'partial' ? 1 : 0),
    failed: snapshot.failed + (outcome === 'error' ? 1 : 0),
    skipped: snapshot.skipped + (outcome === 'skipped' ? 1 : 0),
    lastCompletedAt: at,
    lastSuccessAt: outcome === 'success' ? at : snapshot.lastSuccessAt,
    lastError: outcome === 'error' ? error.slice(0, 240) : snapshot.lastError,
  });
}

export function useRuntimeMetrics(): RuntimeMetrics {
  const [value, setValue] = useState(snapshot);
  useEffect(() => {
    const sync = () => setValue(snapshot);
    const unsubscribe = subscribeRuntimeMetrics(sync);
    sync();
    return unsubscribe;
  }, []);
  return value;
}
