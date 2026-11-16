import { type ReactNode, useState } from 'react';
import { resolveNodeDirection, resolveTextDirection, translateNode, translateText } from '@/lib/i18n';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Button, Input, Label, TextField, TextArea } from 'heroui-native';
import { Search, CircleAlert, ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { palette as p } from '@/lib/theme';
import { useScout } from '@/lib/store';
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.background },
  content: {
    padding: 18,
    paddingBottom: 28,
    gap: 18,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28, lineHeight: 34, color: p.text, letterSpacing: -0.8 },
  heading: { fontFamily: 'Inter_600SemiBold', fontSize: 16, lineHeight: 22, color: p.text, letterSpacing: -0.2, flexShrink: 1, minWidth: 0 },
  text: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 22, color: p.text, flexShrink: 1, minWidth: 0 },
  muted: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, color: p.muted, flexShrink: 1, minWidth: 0 },
  panel: { paddingHorizontal: 20, paddingVertical: 18, borderRadius: 20, backgroundColor: p.surface, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // eslint-disable-next-line react-native/no-unused-styles -- Exported shared style used by screens and VideoRow; the rule only checks this file.
  rule: { borderBottomColor: p.border, borderBottomWidth: 1, paddingBottom: 18 },
  label: { fontFamily: 'Inter_500Medium', fontSize: 13, color: p.muted },
  // eslint-disable-next-line react-native/no-unused-styles -- Exported shared style used by screens and VideoRow; the rule only checks this file.
  badge: { fontFamily: 'Inter_500Medium', fontSize: 11, color: p.purple },
  input: { fontFamily: 'Inter_400Regular' },
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
export function SourceText({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const content = String(children ?? '');
  const direction = resolveTextDirection(content);
  return <Text style={[muted ? styles.muted : styles.text, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{children}</Text>;
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
  return (
    <KeyboardAvoidingView
      style={[styles.page, { direction: language === 'fa' ? 'rtl' : 'ltr' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { direction: language === 'fa' ? 'rtl' : 'ltr' }]}>
          {title ? <Text style={[styles.title, { writingDirection: language === 'fa' ? 'rtl' : 'ltr', textAlign: language === 'fa' ? 'right' : 'left' }]}>{translateText(title, language)}</Text> : null}
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
        translateNode(children, language)
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
  return (
    <Button
      onPress={onPress}
      variant={secondary ? 'secondary' : 'primary'}
      isDisabled={disabled || busy}
      className="rounded-2xl px-4"
      accessibilityLabel={label}
    >
      {Icon && <Icon size={18} color={secondary ? p.purple : p.white} strokeWidth={1.8} />}
      <Button.Label numberOfLines={2}>{busy ? translateText('Working…', language) : label}</Button.Label>
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
  return (
    <TextField>
      <Label>{translateText(label, language)}</Label>
      {multiline ? (
        <TextArea
          value={value}
          onChangeText={onChange}
          placeholder={placeholder ? translateText(placeholder, language) : undefined}
          style={[styles.input, { writingDirection: language === 'fa' ? 'rtl' : 'ltr' }]}
        />
      ) : (
        <Input
          value={value}
          onChangeText={onChange}
          placeholder={placeholder ? translateText(placeholder, language) : undefined}
          secureTextEntry={secret}
          autoCapitalize={secret ? 'none' : 'sentences'}
          autoCorrect={!secret}
          style={[styles.input, { writingDirection: language === 'fa' ? 'rtl' : 'ltr' }]}
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
  return (
    <View style={{ gap: 10 }}>
      {Boolean(label) && <Text style={[styles.label, { writingDirection: language === 'fa' ? 'rtl' : 'ltr', textAlign: language === 'fa' ? 'right' : 'left' }]}>{translateText(label!, language)}</Text>}
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
            className="rounded-full px-4"
            accessibilityState={{ selected: selected.includes(option) }}
          >
            <Button.Label numberOfLines={2}>{translateText(option, language)}</Button.Label>
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
    <View style={{ alignItems: 'center', paddingVertical: 32, gap: 18 }}>
      <Icon size={36} color={p.purple} strokeWidth={1.8} />
      <Txt muted>{title}</Txt>
      <Action secondary onPress={onPress}>
        {action}
      </Action>
    </View>
  );
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  return (
    <Panel>
      <View style={styles.row}>
        <CircleAlert size={20} color={p.danger} />
        <Text style={[styles.text, { flex: 1, color: p.danger }]}>{translateText(message, language)}</Text>
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
  return (
    <View style={{ gap: 16 }}>
      <Button
        variant="tertiary"
        onPress={() => setExpanded(!expanded)}
        className="h-auto justify-start rounded-none bg-transparent px-0"
      >
        <Button.Label className="flex-1 flex-shrink text-left">{translateText(title, language)}</Button.Label>
        {expanded ? (
          <ChevronUp size={18} color={p.muted} />
        ) : (
          <ChevronDown size={18} color={p.muted} />
        )}
      </Button>
      {expanded && children}
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
