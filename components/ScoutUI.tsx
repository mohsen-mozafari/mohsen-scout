import { type ReactNode, useState } from 'react';
import { resolveNodeDirection, resolveTextDirection, translateNode, translateText } from '@/lib/i18n';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Button, Input, TextField, TextArea } from 'heroui-native';
import { Search, CircleAlert, ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { palette as p } from '@/lib/theme';
import { useScout } from '@/lib/store';
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.background },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 16,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    lineHeight: 33,
    color: p.text,
    letterSpacing: -0.65,
  },
  heading: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    lineHeight: 22,
    color: p.text,
    letterSpacing: -0.25,
    flexShrink: 1,
    minWidth: 0,
  },
  text: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: p.text,
    flexShrink: 1,
    minWidth: 0,
  },
  muted: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: p.muted,
    flexShrink: 1,
    minWidth: 0,
  },
  panel: {
    paddingHorizontal: 17,
    paddingVertical: 17,
    borderRadius: 26,
    backgroundColor: p.surface,
    borderColor: p.border,
    borderWidth: 1,
    gap: 14,
    shadowColor: p.violet,
    shadowOpacity: 0.11,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
  listCard: {
    padding: 14,
    borderRadius: 23,
    backgroundColor: 'rgba(25, 22, 43, 0.82)',
    borderColor: p.border,
    borderWidth: 1,
    shadowColor: p.violet,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  fold: {
    gap: 10,
    padding: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.025)',
    borderColor: p.border,
    borderWidth: 1,
  },
  foldContent: { gap: 12, paddingHorizontal: 4, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // eslint-disable-next-line react-native/no-unused-styles -- Exported shared style used by screens and VideoRow; the rule only checks this file.
  rule: { borderBottomColor: p.border, borderBottomWidth: 1, paddingBottom: 18 },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
    color: p.muted,
  },
  // eslint-disable-next-line react-native/no-unused-styles -- Exported shared style used by screens and VideoRow; the rule only checks this file.
  badge: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16, color: p.purple },
  actionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 19 },
  choiceLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  foldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 20 },
  input: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: p.text,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: p.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 48,
  },
});
export function Txt({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const content = translateNode(children, language);
  const direction = resolveNodeDirection(content);
  return <Text style={[muted ? styles.muted : styles.text, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{content}</Text>;
}
export function Heading({ children }: { children: ReactNode }) {
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const content = translateNode(children, language);
  const direction = resolveNodeDirection(content);
  return <Text style={[styles.heading, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{content}</Text>;
}
export function SourceText({ children, muted = false, numberOfLines }: { children: ReactNode; muted?: boolean; numberOfLines?: number }) {
  const direction = resolveNodeDirection(children);
  return <Text numberOfLines={numberOfLines} style={[muted ? styles.muted : styles.text, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{children}</Text>;
}
export function SourceHeading({ children }: { children: ReactNode }) {
  const direction = resolveNodeDirection(children);
  return <Text style={[styles.heading, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{children}</Text>;
}
export function SourceTitle({ children }: { children: ReactNode }) {
  const direction = resolveNodeDirection(children);
  return <Text style={[styles.title, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{children}</Text>;
}
export function BadgeText({ children }: { children: string }) {
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const content = translateText(children, language);
  const direction = resolveTextDirection(content);
  return <Text style={[styles.badge, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{content}</Text>;
}
export function Page({
  children,
  title,
  scroll = true,
}: {
  children: ReactNode;
  title?: string;
  scroll?: boolean;
}) {
  const error = useScout((s) => s.error);
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const pageTitle = title ? translateText(title, language) : '';
  const pageTitleDirection = resolveTextDirection(pageTitle);
  return (
    <KeyboardAvoidingView
      style={[styles.page, { direction: language === 'fa' ? 'rtl' : 'ltr' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { direction: language === 'fa' ? 'rtl' : 'ltr' }]}>
          {title ? <Text style={[styles.title, { writingDirection: pageTitleDirection, textAlign: pageTitleDirection === 'rtl' ? 'right' : 'left' }]}>{pageTitle}</Text> : null}
          {Boolean(error) && (
            <ErrorBox
              message={error}
              onRetry={() =>
                useScout.getState().ready
                  ? useScout.getState().clearError()
                  : void useScout.getState().boot()
              }
            />
          )}
          {translateNode(children, language)}
        </ScrollView>
      ) : (
        <>
          {Boolean(error) && (
            <ErrorBox
              message={error}
              onRetry={() =>
                useScout.getState().ready
                  ? useScout.getState().clearError()
                  : void useScout.getState().boot()
              }
            />
          )}
          {translateNode(children, language)}
        </>
      )}
    </KeyboardAvoidingView>
  );
}
export function Panel({ children }: { children: ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}
export function Action({
  children,
  onPress,
  secondary = false,
  disabled = false,
  busy = false,
  icon: Icon,
}: {
  children: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  icon?: LucideIcon;
}) {
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const label = translateText(children, language);
  const displayLabel = busy ? translateText('Working…', language) : label;
  const labelDirection = resolveTextDirection(displayLabel);
  return (
    <Button
      onPress={onPress}
      variant={secondary ? 'secondary' : 'primary'}
      isDisabled={disabled || busy}
      className="min-h-12 rounded-2xl px-4 py-3"
      accessibilityLabel={label}
    >
      {Icon && <Icon size={18} color={secondary ? p.purple : p.white} strokeWidth={1.8} />}
      <Button.Label numberOfLines={2} style={[styles.actionLabel, { writingDirection: labelDirection, textAlign: labelDirection === 'rtl' ? 'right' : 'left' }]}>{displayLabel}</Button.Label>
    </Button>
  );
}
export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  secret = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secret?: boolean;
}) {
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const translatedLabel = translateText(label, language);
  const translatedPlaceholder = placeholder ? translateText(placeholder, language) : undefined;
  const directionSeed = value.trim() || translatedPlaceholder?.trim() || translatedLabel;
  const direction = directionSeed.trim()
    ? resolveTextDirection(directionSeed)
    : language === 'fa' ? 'rtl' : 'ltr';
  return (
    <TextField>
      <Text style={[styles.label, { writingDirection: resolveTextDirection(translatedLabel), textAlign: resolveTextDirection(translatedLabel) === 'rtl' ? 'right' : 'left' }]}>{translatedLabel}</Text>
      {multiline ? (
        <TextArea
          value={value}
          onChangeText={onChange}
          placeholder={translatedPlaceholder}
          style={[styles.input, { minHeight: 112, paddingTop: 12, textAlignVertical: 'top', writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}
        />
      ) : (
        <Input
          value={value}
          onChangeText={onChange}
          placeholder={translatedPlaceholder}
          secureTextEntry={secret}
          autoCapitalize={secret ? 'none' : 'sentences'}
          autoCorrect={!secret}
          style={[styles.input, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}
        />
      )}
    </TextField>
  );
}
export function Choices<T extends string>({
  label,
  options,
  selected,
  onChange,
  multiple = false,
}: {
  label?: string;
  options: readonly T[];
  selected: readonly T[];
  onChange: (values: T[]) => void;
  multiple?: boolean;
}) {
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const translatedLabel = label ? translateText(label, language) : '';
  const labelDirection = resolveTextDirection(translatedLabel);
  return (
    <View style={{ gap: 10 }}>
      {Boolean(label) && <Text style={[styles.label, { writingDirection: labelDirection, textAlign: labelDirection === 'rtl' ? 'right' : 'left' }]}>{translatedLabel}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => (
          <Button
            key={option}
            onPress={() => {
              void Haptics.selectionAsync();
              onChange(
                multiple
                  ? selected.includes(option)
                    ? selected.filter((s) => s !== option)
                    : [...selected, option]
                  : [option],
              );
            }}
            variant={selected.includes(option) ? 'primary' : 'secondary'}
            size="sm"
            className="min-h-10 rounded-full px-4 py-2"
            accessibilityState={{ selected: selected.includes(option) }}
          >
            <Button.Label numberOfLines={2} style={[styles.choiceLabel, { writingDirection: resolveTextDirection(translateText(option, language)), textAlign: resolveTextDirection(translateText(option, language)) === 'rtl' ? 'right' : 'left' }]}>{translateText(option, language)}</Button.Label>
          </Button>
        ))}
      </View>
    </View>
  );
}
export function Empty({
  title,
  action,
  onPress,
  icon: Icon = Search,
}: {
  title: string;
  action: string;
  onPress: () => void;
  icon?: LucideIcon;
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16, gap: 16 }}>
      <View style={{ padding: 14, borderRadius: 22, backgroundColor: 'rgba(150, 121, 255, 0.12)', borderWidth: 1, borderColor: p.border }}>
        <Icon size={32} color={p.purple} strokeWidth={1.8} />
      </View>
      <Txt muted>{title}</Txt>
      <Action secondary onPress={onPress}>
        {action}
      </Action>
    </View>
  );
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const translatedMessage = translateText(message, language);
  const messageDirection = resolveTextDirection(translatedMessage);
  return (
    <Panel>
      <View style={styles.row}>
        <CircleAlert size={20} color={p.danger} />
        <Text style={[styles.text, { flex: 1, color: p.danger, writingDirection: messageDirection, textAlign: messageDirection === 'rtl' ? 'right' : 'left' }]}>{translatedMessage}</Text>
      </View>
      <Action secondary onPress={onRetry}>
        Retry / dismiss
      </Action>
    </Panel>
  );
}
export function Fold({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  const [expanded, setExpanded] = useState(open);
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const translatedTitle = translateText(title, language);
  const titleDirection = resolveTextDirection(translatedTitle);
  return (
    <View style={styles.fold}>
      <Button
        variant="tertiary"
        onPress={() => setExpanded(!expanded)}
        className="min-h-11 h-auto w-full justify-between rounded-2xl bg-transparent px-3 py-2"
        accessibilityState={{ expanded }}
      >
        <Button.Label className="flex-1 flex-shrink" style={[styles.foldLabel, { writingDirection: titleDirection, textAlign: titleDirection === 'rtl' ? 'right' : 'left' }]}>{translatedTitle}</Button.Label>
        {expanded ? (
          <ChevronUp size={18} color={p.purple} />
        ) : (
          <ChevronDown size={18} color={p.muted} />
        )}
      </Button>
      {expanded ? <View style={styles.foldContent}>{children}</View> : null}
    </View>
  );
}
export function useOperation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const run = async (work: () => Promise<void>, success = '') => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
      setMessage(success);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, message, run, clear: () => setError('') };
}
