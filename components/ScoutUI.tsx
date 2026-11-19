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
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Search,
  type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette as p } from '@/lib/theme';
import { useScout } from '@/lib/store';

type Tone = 'violet' | 'cyan' | 'mint' | 'amber';

const toneColors: Record<Tone, { fill: string; soft: string; line: string }> = {
  violet: { fill: p.purple, soft: p.purpleSoft, line: p.purpleLine },
  cyan: { fill: p.cyan, soft: p.cyanSoft, line: p.cyanLine },
  mint: { fill: p.success, soft: p.successSoft, line: p.successLine },
  amber: { fill: p.warning, soft: p.warningSoft, line: p.warningLine },
};

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.background },
  content: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 34,
    gap: 15,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  brandBar: {
    minHeight: 54,
    paddingHorizontal: 18,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: p.purpleSoft,
    borderWidth: 1,
    borderColor: p.purpleLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    color: p.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    letterSpacing: 1.25,
  },
  brandSubtitle: {
    color: p.muted,
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
    letterSpacing: 1.45,
    marginTop: 2,
  },
  localPill: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: p.successLine,
    backgroundColor: p.successSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  localDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: p.success },
  localText: {
    color: p.success,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    letterSpacing: 0.9,
  },
  intro: { gap: 7, paddingTop: 7, paddingBottom: 5 },
  eyebrow: {
    color: p.cyan,
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1.65,
    lineHeight: 15,
  },
  title: {
    color: p.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 29,
    lineHeight: 35,
    letterSpacing: -0.8,
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
    letterSpacing: -0.25,
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
    color: p.cyan,
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 0.8,
  },
  panel: {
    padding: 17,
    borderRadius: 23,
    backgroundColor: p.surface,
    borderColor: p.border,
    borderWidth: 1,
    gap: 13,
  },
  heroPanel: {
    padding: 19,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(174, 160, 255, 0.32)',
    gap: 14,
    overflow: 'hidden',
  },
  // eslint-disable-next-line react-native/no-unused-styles -- Exported shared style consumed by collection screens.
  listCard: {
    padding: 15,
    borderRadius: 20,
    backgroundColor: p.surface,
    borderColor: p.border,
    borderWidth: 1,
    gap: 11,
  },
  softCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: p.surfaceAlt,
    borderColor: p.borderSoft,
    borderWidth: 1,
    gap: 9,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // eslint-disable-next-line react-native/no-unused-styles -- Exported shared style consumed by dashboard screens.
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  // eslint-disable-next-line react-native/no-unused-styles -- Exported shared style consumed by app screens and diagnostics.
  rule: { borderBottomColor: p.border, borderBottomWidth: 1, paddingBottom: 16 },
  label: {
    color: p.muted,
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 1.05,
  },
  action: {
    minHeight: 48,
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  actionPrimary: {
    backgroundColor: p.purpleBright,
    borderWidth: 1,
    borderColor: p.purpleBright,
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
  actionPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  actionDisabled: { opacity: 0.42 },
  actionLabel: { fontFamily: 'Inter_700Bold', fontSize: 13, lineHeight: 18 },
  choice: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: p.border,
    backgroundColor: p.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  choiceSelected: { backgroundColor: p.cyan, borderColor: p.cyan },
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
  foldTrigger: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10 },
  foldIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: p.raised,
  },
  foldLabel: { color: p.text, fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 19 },
  fold: {
    borderRadius: 18,
    backgroundColor: p.surfaceAlt,
    borderColor: p.borderSoft,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 10,
  },
  foldContent: { paddingHorizontal: 3, paddingBottom: 9, gap: 12 },
  fieldBox: {
    minHeight: 49,
    borderRadius: 15,
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
  metricValue: { color: p.text, fontFamily: 'Inter_700Bold', fontSize: 23, lineHeight: 28 },
  metricLabel: {
    color: p.muted,
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    lineHeight: 14,
    letterSpacing: 0.8,
  },
  metricCard: {
    flex: 1,
    minWidth: 102,
    padding: 12,
    borderRadius: 17,
    borderWidth: 1,
    gap: 6,
  },
  shortcutCard: {
    flex: 1,
    minWidth: 142,
    minHeight: 122,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'space-between',
    gap: 12,
  },
  shortcutIcon: {
    width: 37,
    height: 37,
    borderRadius: 13,
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
    width: 62,
    height: 62,
    borderRadius: 21,
    backgroundColor: p.purpleSoft,
    borderWidth: 1,
    borderColor: p.purpleLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: p.dangerLine,
    backgroundColor: p.dangerSoft,
    padding: 14,
    gap: 10,
  },
});

export function AppHeader({ showBack = false }: { showBack?: boolean }) {
  const ready = useScout((s) => s.ready);
  const canGoBack = showBack && router.canGoBack();
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
            <Compass size={21} color={p.purple} strokeWidth={2.1} />
          </View>
          <View>
            <Text style={styles.brandName}>MOHSEN SCOUT</Text>
            <Text style={styles.brandSubtitle}>SPACE INTELLIGENCE STUDIO</Text>
          </View>
        </View>
      </View>
      <View style={styles.localPill}>
        <View style={[styles.localDot, { opacity: ready ? 1 : 0.42 }]} />
        <Text style={styles.localText}>{ready ? 'ON DEVICE' : 'STARTING'}</Text>
      </View>
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
        colors={['#22204A', '#182C45', '#123640']}
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
  const foreground = secondary ? p.cyan : p.background;
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
      <Text numberOfLines={2} style={[styles.actionLabel, { color: danger ? p.danger : foreground, writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left', flex: 1 }]}>{busy ? translateText('Working…', language) : label}</Text>
      {!secondary && !danger ? <ArrowUpRight size={15} color={p.background} /> : null}
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
          selectionColor={p.cyan}
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
              {active ? <Check size={13} color={p.background} strokeWidth={2.6} /> : null}
              <Text style={[styles.choiceLabel, { color: active ? p.background : p.text, writingDirection: itemDirection, textAlign: itemDirection === 'rtl' ? 'right' : 'left' }]}>{title}</Text>
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
        <Icon size={27} color={p.purple} strokeWidth={1.9} />
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
          {expanded ? <ChevronUp size={16} color={p.cyan} /> : <ChevronDown size={16} color={p.muted} />}
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
