import { Platform } from 'react-native';
import { palette } from './theme';

const ROOT_THEME_TOKENS: Record<string, string> = {
  '--scout-background': palette.background,
  '--scout-surface': palette.surface,
  '--scout-surface-raised': palette.raised,
  '--scout-foreground': palette.text,
  '--scout-muted': palette.muted,
  '--scout-placeholder': palette.placeholder,
  '--scout-accent': palette.accent,
  '--scout-input': palette.input,
  '--scout-border': palette.border,
};

// HeroUI computes these with color-mix(). On web, useThemeColor can read the unresolved
// expression and HeroUI's colorKit then falls back to black; registering them as <color>
// makes the browser resolve the mix first. Web only: as CSS @property rules, Uniwind 1.13+
// applies the transparent initial value on native too, blanking secondary labels and soft
// backgrounds.
const CALCULATED_COLOR_TOKENS = [
  '--color-accent-hover',
  '--color-accent-soft',
  '--color-accent-soft-foreground',
  '--color-accent-soft-hover',
  '--color-background-secondary',
  '--color-background-tertiary',
  '--color-border-secondary',
  '--color-border-tertiary',
  '--color-danger-hover',
  '--color-danger-soft',
  '--color-danger-soft-foreground',
  '--color-danger-soft-hover',
  '--color-default-hover',
  '--color-default-soft',
  '--color-default-soft-hover',
  '--color-field-border-focus',
  '--color-field-border-hover',
  '--color-field-hover',
  '--color-separator-secondary',
  '--color-separator-tertiary',
  '--color-success-hover',
  '--color-success-soft',
  '--color-success-soft-foreground',
  '--color-success-soft-hover',
  '--color-surface-hover',
  '--color-warning-hover',
  '--color-warning-soft',
  '--color-warning-soft-foreground',
  '--color-warning-soft-hover',
];

export function registerColorTokens(): void {
  if (Platform.OS !== 'web') return;
  if (typeof document !== 'undefined') {
    const rootStyle = document.documentElement.style;
    for (const [name, value] of Object.entries(ROOT_THEME_TOKENS)) {
      rootStyle.setProperty(name, value);
    }
  }
  if (typeof CSS === 'undefined' || !CSS.registerProperty) return;
  for (const name of CALCULATED_COLOR_TOKENS) {
    try {
      CSS.registerProperty({
        name,
        syntax: '<color>',
        inherits: true,
        initialValue: 'transparent',
      });
    } catch {
      // Already registered (fast refresh re-runs this module).
    }
  }
}
