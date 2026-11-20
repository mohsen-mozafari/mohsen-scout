import { type ReactNode, useState } from 'react';
import {
  resolveNodeDirection,
  resolveTextDirection,
  translateNode,
  translateText,
} from '@/lib/i18n';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Search,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette as p } from '@/lib/theme';
import { useScout } from '@/lib/store';

type Tone = 'violet' | 'cyan' | 'mint' | 'amber';

const toneColors: Record<Tone, { fill: string; soft: string; line: string }> = {
  violet: { fill: p.accent, soft: p.accentSoft, line: p.accentLine },
  cyan: { fill: p.cyan, soft: p.cyanSoft, line: p.cyanLine },
  mint: { fill: p.success, soft: p.successSoft, line: p.successLine },
  amber: { fill: p.warning, soft: p.warningSoft, line: p.warningLine },
};

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.background },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 30,
    gap: 13,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  brandBar: {
    minHeight: 52,
    paddingHorizontal: 18,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: p.surfaceAlt,
    borderWidth: 1,
    borderColor: p.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    color: p.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 1.05,
  },
  brandSubtitle: {
    color: p.muted,
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
    letterSpacing: 1.1,
    marginTop: 2,
  },
  intro: { gap: 7, paddingTop: 6, paddingBottom: 4 },
  eyebrow: {
    color: p.muted,
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1.2,
    lineHeight: 15,
  },
  title: {
    color: p.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 27,
    lineHeight: 33,
    letterSpacing: -0.55,
  },
  introText: {
    color: p.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 20,
  },
  heading: {
    color: p.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
    flexShrink: 1,
    minWidth: 0,
  },
  text: {
    color: p.text,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    flexShrink: 1,
    minWidth: 0,
  },
  muted: {
    color: p.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
    flexShrink: 1,
    minWidth: 0,
  },
  badge: {
    color: p.accent,
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 0.7,
  },
  panel: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: p.surface,
    borderColor: p.border,
    borderWidth: 1,
    gap: 12,
  },
  heroPanel: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(99, 160, 255, 0.48)',
    gap: 13,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  // eslint-disable-next-line react-native/no-unused-styles -- Shared list surface consumed by collection screens.
  listCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: p.surface,
    borderColor: p.border,
    borderWidth: 1,
    gap: 10,
  },
  softCard: {
    padding: 13,
    borderRadius: 13,
    backgroundColor: p.surfaceAlt,
    borderColor: p.borderSoft,
    borderWidth: 1,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  // eslint-disable-next-line react-native/no-unused-styles -- Shared dashboard layout style.
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  // eslint-disable-next-line react-native/no-unused-styles -- Shared list and diagnostics separator.
  rule: { borderBottomColor: p.border, borderBottomWidth: 1, paddingBottom: 12 },
  label: {
    color: p.muted,
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 0.9,
  },
  action: {
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  actionPrimary: {
    backgroundColor: p.accentStrong,
    borderWidth: 1,
    borderColor: p.accentStrong,
  },
  actionSecondary: {
    backgroundColor: p.surfaceAlt,
    borderWidth: 1,
    borderColor: p.border,
  },
  actionDanger: {
    backgroundColor: p.dangerSoft,
    borderWidth: 1,
    borderColor: p.dangerLine,
  },
  actionPressed: { opacity: 0.82 },
  actionDisabled: { opacity: 0.42 },
  actionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 18, flexShrink: 1, minWidth: 0 },
  choice: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: p.border,
    backgroundColor: p.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  choiceSelected: { backgroundColor: 'rgba(99, 160, 255, 0.24)', borderColor: p.accent },
  choicePressed: { opacity: 0.75 },
  choiceLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, lineHeight: 16 },
  errorAction: {
    minHeight: 34,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: p.dangerLine,
  },
  errorActionText: { color: p.danger, fontFamily: 'Inter_700Bold', fontSize: 11 },
  foldTrigger: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  foldIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  foldLabel: { color: p.text, fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 20 },
  fold: {
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderColor: p.borderSoft,
    borderBottomWidth: 1,
    paddingHorizontal: 0,
    paddingVertical: 3,
    gap: 8,
  },
  foldContent: { paddingHorizontal: 0, paddingBottom: 10, gap: 12 },
  fieldBox: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: p.input,
    borderColor: p.border,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  inputText: {
    minHeight: 44,
    paddingVertical: 10,
    color: p.text,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'center',
  },
  multilineText: { minHeight: 112, textAlignVertical: 'top', paddingTop: 12 },
  metricValue: { color: p.text, fontFamily: 'Inter_700Bold', fontSize: 22, lineHeight: 27 },
  metricLabel: {
    color: p.muted,
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    lineHeight: 14,
    letterSpacing: 0.65,
  },
  metricCard: {
    flex: 1,
    minWidth: 88,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
  },
  shortcutCard: {
    width: '100%',
    minHeight: 68,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shortcutIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 18,
    gap: 12,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: p.surfaceAlt,
    borderWidth: 1,
    borderColor: p.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: p.dangerLine,
    backgroundColor: p.dangerSoft,
    padding: 13,
    gap: 10,
  },
});

export function AppHeader({ showBack = false }: { showBack?: boolean }) {
  const pathname = usePathname();
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const canGoBack = showBack && router.canGoBack();
  const settingsLabel = translateText('Settings', language);
  const onSettings = pathname.endsWith('/settings');
  return (
    <View style={styles.brandBar}>
      <View style={styles.brandLockup}>
        {canGoBack ? (
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            style={({ pressed }) => [{
              width: 34,
              height: 34,
              borderRadius: 12,
              backgroundColor: p.surfaceAlt,
              borderWidth: 1,
              borderColor: p.border,
              alignItems: 'center',
              justifyContent: 'center',
            }, pressed ? { opacity: 0.7 } : null]}
          >
            <ArrowLeft size={17} color={p.text} />
          </Pressable>
        ) : null}
        <View style={styles.brandLockup}>
          <View style={styles.brandMark}>
            <Compass size={19} color={p.accent} strokeWidth={1.9} />
          </View>
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={styles.brandName}>MOHSEN SCOUT</Text>
            {!canGoBack ? <Text numberOfLines={1} style={styles.brandSubtitle}>SPACE INTELLIGENCE STUDIO</Text> : null}
          </View>
        </View>
      </View>
      <Pressable
        onPress={() => { if (!onSettings) router.push('/(tabs)/settings'); }}
        disabled={onSettings}
        accessibilityRole="button"
        accessibilityLabel={settingsLabel}
        accessibilityState={{ disabled: onSettings }}
        style={({ pressed }) => [{
          minHeight: 38,
          paddingHorizontal: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: p.border,
          backgroundColor: onSettings ? p.accentSoft : p.surfaceAlt,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          opacity: pressed ? 0.72 : 1,
        }]}
      >
        <SettingsIcon size={16} color={onSettings ? p.accent : p.text} />
        <Text style={{ color: onSettings ? p.accent : p.text, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>{settingsLabel}</Text>
      </Pressable>
    </View>
  );
}

function PageHeading({
  title,
  eyebrow,
  subtitle,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
}) {
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const translatedTitle = translateText(title, language);
  const translatedEyebrow = eyebrow ? translateText(eyebrow, language) : 'WORKSPACE';
  const translatedSubtitle = subtitle ? translateText(subtitle, language) : '';
  const direction = resolveTextDirection(translatedTitle);
  return (
    <View style={styles.intro}>
      <Text style={[styles.eyebrow, { writingDirection: resolveTextDirection(translatedEyebrow) }]}>
        {translatedEyebrow}
      </Text>
      <Text style={[styles.title, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>
        {translatedTitle}
      </Text>
      {translatedSubtitle ? (
        <Text style={[styles.introText, { writingDirection: resolveTextDirection(translatedSubtitle), textAlign: direction === 'rtl' ? 'right' : 'left' }]}>
          {translatedSubtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function ScreenIntro({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
}) {
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const translatedTitle = translateText(title, language);
  const translatedEyebrow = translateText(eyebrow, language);
  const translatedSubtitle = subtitle ? translateText(subtitle, language) : '';
  const direction = resolveTextDirection(translatedTitle);
  return (
    <View style={styles.intro}>
      {Icon ? (
        <View style={[styles.shortcutIcon, { backgroundColor: p.purpleSoft, borderWidth: 1, borderColor: p.purpleLine }]}>
          <Icon color={p.purple} size={19} strokeWidth={1.9} />
        </View>
      ) : null}
      <Text style={[styles.eyebrow, { writingDirection: resolveTextDirection(translatedEyebrow) }]}>{translatedEyebrow}</Text>
      <Text style={[styles.title, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{translatedTitle}</Text>
      {translatedSubtitle ? (
        <Text style={[styles.introText, { writingDirection: resolveTextDirection(translatedSubtitle), textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{translatedSubtitle}</Text>
      ) : null}
    </View>
  );
}

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

function PageError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const translatedMessage = translateText(message, language);
  const direction = resolveTextDirection(translatedMessage);
  return (
    <View style={styles.errorBox}>
      <View style={styles.row}>
        <AlertCircle size={19} color={p.danger} />
        <Text style={[styles.text, { flex: 1, color: p.danger, writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{translatedMessage}</Text>
      </View>
      <Pressable onPress={onRetry} accessibilityRole="button" style={styles.errorAction}>
        <Text style={styles.errorActionText}>Retry / dismiss</Text>
      </Pressable>
    </View>
  );
}

export function Page({
  children,
  title,
  eyebrow,
  subtitle,
  scroll = true,
  showBack = false,
}: {
  children: ReactNode;
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  scroll?: boolean;
  showBack?: boolean;
}) {
  const error = useScout((s) => s.error);
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const insets = useSafeAreaInsets();
  const content = (
    <>
      <AppHeader showBack={showBack} />
      {title ? <PageHeading title={title} eyebrow={eyebrow} subtitle={subtitle} /> : null}
      {error ? (
        <PageError
          message={error}
          onRetry={() =>
            useScout.getState().ready
              ? useScout.getState().clearError()
              : void useScout.getState().boot()
          }
        />
      ) : null}
      {translateNode(children, language)}
    </>
  );
  return (
    <KeyboardAvoidingView
      style={[styles.page, { direction: language === 'fa' ? 'rtl' : 'ltr', paddingTop: Math.max(6, insets.top) }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { direction: language === 'fa' ? 'rtl' : 'ltr' }]}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <AppHeader showBack={showBack} />
          {error ? (
            <PageError
              message={error}
              onRetry={() =>
                useScout.getState().ready
                  ? useScout.getState().clearError()
                  : void useScout.getState().boot()
              }
            />
          ) : null}
          {translateNode(children, language)}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

export function Panel({
  children,
  variant = 'default',
}: {
  children: ReactNode;
  variant?: 'default' | 'hero' | 'soft';
}) {
  if (variant === 'hero') {
    return (
      <LinearGradient
        colors={['#18376A', '#16445C', '#152B4A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroPanel}
      >
        {children}
      </LinearGradient>
    );
  }
  return <View style={variant === 'soft' ? styles.softCard : styles.panel}>{children}</View>;
}

export function Action({
  children,
  onPress,
  secondary = false,
  disabled = false,
  busy = false,
  icon: Icon,
  danger = false,
}: {
  children: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  icon?: LucideIcon;
  danger?: boolean;
}) {
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const label = translateText(children, language);
  const direction = resolveTextDirection(label);
  const foreground = secondary ? p.text : p.background;
  return (
    <Pressable
      onPress={() => {
        if (!disabled && !busy) void Haptics.selectionAsync();
        if (!disabled && !busy) onPress();
      }}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [
        styles.action,
        secondary ? styles.actionSecondary : danger ? styles.actionDanger : styles.actionPrimary,
        pressed && !disabled && !busy ? styles.actionPressed : null,
        disabled || busy ? styles.actionDisabled : null,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={secondary ? p.cyan : p.background} />
      ) : Icon ? (
        <Icon size={17} color={danger ? p.danger : foreground} strokeWidth={2} />
      ) : null}
      <Text numberOfLines={2} style={[styles.actionLabel, { color: danger ? p.danger : foreground, writingDirection: direction, textAlign: Icon ? direction === 'rtl' ? 'right' : 'left' : 'center', flex: 1 }]}>{busy ? translateText('Working…', language) : label}</Text>
    </Pressable>
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
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secret?: boolean;
}) {
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const translatedLabel = translateText(label, language);
  const translatedPlaceholder = placeholder ? translateText(placeholder, language) : undefined;
  const seed = value.trim() || translatedPlaceholder?.trim() || translatedLabel;
  const direction = seed ? resolveTextDirection(seed) : language === 'fa' ? 'rtl' : 'ltr';
  const labelDirection = resolveTextDirection(translatedLabel);
  return (
    <View style={{ gap: 7, width: '100%' }}>
      <Text style={[styles.label, { textAlign: labelDirection === 'rtl' ? 'right' : 'left', writingDirection: labelDirection }]}>{translatedLabel}</Text>
      <View style={styles.fieldBox}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={translatedPlaceholder}
          placeholderTextColor={p.placeholder}
          secureTextEntry={secret}
          autoCapitalize={secret ? 'none' : 'sentences'}
          autoCorrect={!secret}
          multiline={multiline}
          selectionColor={p.accent}
          underlineColorAndroid="transparent"
          style={[styles.inputText, multiline ? styles.multilineText : null, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}
        />
      </View>
    </View>
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
  const direction = resolveTextDirection(translatedLabel);
  return (
    <View style={{ gap: 9 }}>
      {label ? (
        <Text style={[styles.label, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{translatedLabel}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {options.map((option) => {
          const active = selected.includes(option);
          const title = translateText(option, language);
          const itemDirection = resolveTextDirection(title);
          return (
            <Pressable
              key={option}
              onPress={() => {
                void Haptics.selectionAsync();
                onChange(
                  multiple
                    ? active ? selected.filter((item) => item !== option) : [...selected, option]
                    : [option],
                );
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.choice,
                active ? styles.choiceSelected : null,
                pressed ? styles.choicePressed : null,
              ]}
            >
              {active ? <Check size={13} color={p.accent} strokeWidth={2.6} /> : null}
              <Text style={[styles.choiceLabel, { color: active ? p.accentStrong : p.text, writingDirection: itemDirection, textAlign: itemDirection === 'rtl' ? 'right' : 'left' }]}>{title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  tone = 'violet',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
}) {
  const colors = toneColors[tone];
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const title = translateText(label, language);
  const description = hint ? translateText(hint, language) : '';
  return (
    <View style={[styles.metricCard, { backgroundColor: colors.soft, borderColor: colors.line }]}>
      <Text style={[styles.metricLabel, { color: colors.fill }]}>{title}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {description ? <Text style={styles.muted}>{description}</Text> : null}
    </View>
  );
}

export function QuickAction({
  title,
  description,
  icon: Icon,
  onPress,
  tone = 'violet',
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  onPress: () => void;
  tone?: Tone;
}) {
  const colors = toneColors[tone];
  const language = useScout((s) => s.data.preferences.uiLanguage ?? 'fa');
  const name = translateText(title, language);
  const detail = translateText(description, language);
  return (
    <Pressable
      onPress={() => { void Haptics.selectionAsync(); onPress(); }}
      accessibilityRole="button"
      style={({ pressed }) => [styles.shortcutCard, { backgroundColor: colors.soft, borderColor: colors.line }, pressed ? styles.actionPressed : null]}
    >
      <View style={[styles.shortcutIcon, { backgroundColor: colors.line }]}>
        <Icon size={19} color={colors.fill} strokeWidth={1.9} />
      </View>
      <View style={{ gap: 3, flex: 1 }}>
        <Text style={styles.heading}>{name}</Text>
        <Text style={styles.muted}>{detail}</Text>
      </View>
      <ArrowUpRight size={15} color={colors.fill} />
    </Pressable>
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
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <Icon size={25} color={p.accent} strokeWidth={1.9} />
      </View>
      <Txt muted>{title}</Txt>
      <Action secondary onPress={onPress}>{action}</Action>
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.errorBox}>
      <View style={styles.row}>
        <AlertCircle size={18} color={p.danger} />
        <Txt>{message}</Txt>
      </View>
      <Action danger secondary onPress={onRetry}>Retry / dismiss</Action>
    </View>
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
  const direction = resolveTextDirection(translatedTitle);
  return (
    <View style={styles.fold}>
      <Pressable
        onPress={() => { void Haptics.selectionAsync(); setExpanded((current) => !current); }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.foldTrigger, pressed ? { opacity: 0.72 } : null]}
      >
        <Text style={[styles.foldLabel, { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left', flex: 1 }]}>{translatedTitle}</Text>
        <View style={styles.foldIcon}>
          {expanded ? <ChevronUp size={16} color={p.accent} /> : <ChevronDown size={16} color={p.muted} />}
        </View>
      </Pressable>
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
