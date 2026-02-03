import { css } from 'lit';

// Vanna 2.0 design tokens - Earthy brown/amber palette
export const vannaDesignTokens = css`
  :host {
  /* Brand Colors - clean neutral palette */
  --vanna-navy: rgb(17, 24, 39);
  --vanna-cream: rgb(248, 250, 252);
  --vanna-teal: rgb(37, 99, 235);
  --vanna-orange: rgb(249, 115, 22);
  --vanna-magenta: rgb(236, 72, 153);

  /* Color Palette - Light mode (default) */
  --vanna-background-root: rgb(255, 255, 255);
  --vanna-background-default: rgb(248, 250, 252);
  --vanna-background-higher: rgb(241, 245, 249);
  --vanna-background-highest: rgb(226, 232, 240);
  --vanna-background-subtle: rgb(255, 255, 255);
  --vanna-background-lower: rgb(244, 247, 251);
  --vanna-background-cream-accent: rgb(248, 250, 252);

  --vanna-foreground-default: rgb(15, 23, 42);
  --vanna-foreground-dimmer: rgb(71, 85, 105);
  --vanna-foreground-dimmest: rgb(100, 116, 139);

  --vanna-accent-primary-default: rgb(37, 99, 235);
  --vanna-accent-primary-stronger: rgb(29, 78, 216);
  --vanna-accent-primary-strongest: rgb(30, 64, 175);
  --vanna-accent-primary-subtle: rgba(37, 99, 235, 0.12);
  --vanna-accent-primary-hover: rgb(59, 130, 246);

  --vanna-accent-positive-default: rgb(16, 185, 129);
  --vanna-accent-positive-stronger: rgb(5, 150, 105);
  --vanna-accent-positive-subtle: rgba(16, 185, 129, 0.12);

  --vanna-accent-negative-default: rgb(239, 68, 68);
  --vanna-accent-negative-stronger: rgb(220, 38, 38);
  --vanna-accent-negative-subtle: rgba(239, 68, 68, 0.12);

  --vanna-accent-warning-default: rgb(245, 158, 11);
  --vanna-accent-warning-stronger: rgb(217, 119, 6);
  --vanna-accent-warning-subtle: rgba(245, 158, 11, 0.12);

  /* Outline/Border colors */
  --vanna-outline-default: rgba(148, 163, 184, 0.6);
  --vanna-outline-dimmer: rgb(226, 232, 240);
  --vanna-outline-dimmest: rgb(241, 245, 249);
  --vanna-outline-hover: rgb(59, 130, 246);

  /* Typography */
  --vanna-font-family-default: "Manrope", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  --vanna-font-family-serif: "Roboto Slab", ui-serif, Georgia, serif;
  --vanna-font-family-mono: "Space Mono", ui-monospace, SFMono-Regular, "SF Mono", Monaco, Inconsolata, "Roboto Mono", "Ubuntu Mono", monospace;

    /* Spacing scale */
    --vanna-space-0: 0px;
    --vanna-space-1: 4px;
    --vanna-space-1-5: 6px;
    --vanna-space-2: 8px;
    --vanna-space-3: 12px;
    --vanna-space-4: 16px;
    --vanna-space-5: 20px;
    --vanna-space-6: 24px;
    --vanna-space-7: 28px;
    --vanna-space-8: 32px;
    --vanna-space-9: 36px;
    --vanna-space-10: 40px;
    --vanna-space-12: 48px;
    --vanna-space-14: 56px;
    --vanna-space-16: 64px;

    /* Border radius */
    --vanna-border-radius-sm: 4px;
    --vanna-border-radius-md: 8px;
    --vanna-border-radius-lg: 12px;
    --vanna-border-radius-xl: 14px;
    --vanna-border-radius-2xl: 16px;
    --vanna-border-radius-full: 9999px;

  /* Shadows - subtle and clean */
  --vanna-shadow-xs: 0 1px 2px 0 rgba(15, 23, 42, 0.04);
  --vanna-shadow-sm: 0 2px 4px 0 rgba(15, 23, 42, 0.08);
  --vanna-shadow-md: 0 6px 12px -4px rgba(15, 23, 42, 0.12);
  --vanna-shadow-lg: 0 12px 24px -10px rgba(15, 23, 42, 0.16);
  --vanna-shadow-xl: 0 20px 32px -14px rgba(15, 23, 42, 0.18);
  --vanna-shadow-2xl: 0 30px 50px -20px rgba(15, 23, 42, 0.25);

    /* Animation durations */
    --vanna-duration-75: 75ms;
    --vanna-duration-100: 100ms;
    --vanna-duration-150: 150ms;
    --vanna-duration-200: 200ms;
    --vanna-duration-300: 300ms;
    --vanna-duration-500: 500ms;
    --vanna-duration-700: 700ms;

    /* Z-index scale */
    --vanna-z-dropdown: 1000;
    --vanna-z-sticky: 1020;
    --vanna-z-fixed: 1030;
    --vanna-z-modal: 1040;
    --vanna-z-popover: 1050;
    --vanna-z-tooltip: 1060;

    /* Chat-specific tokens */
    --vanna-chat-bubble-radius: 12px;
    --vanna-chat-bubble-radius-sm: 8px;
    --vanna-chat-spacing: 16px;
    --vanna-chat-avatar-size: 40px;
  }

  /* Dark theme overrides */
  :host([theme="dark"]) {
    --vanna-background-root: rgb(15, 23, 42);
    --vanna-background-default: rgb(17, 24, 39);
    --vanna-background-higher: rgb(30, 41, 59);
    --vanna-background-highest: rgb(51, 65, 85);
    --vanna-background-subtle: rgb(15, 23, 42);
    --vanna-background-lower: rgb(12, 18, 32);

    --vanna-foreground-default: rgb(241, 245, 249);
    --vanna-foreground-dimmer: rgb(203, 213, 225);
    --vanna-foreground-dimmest: rgb(148, 163, 184);

    --vanna-accent-primary-default: rgb(96, 165, 250);
    --vanna-accent-primary-stronger: rgb(59, 130, 246);
    --vanna-accent-primary-strongest: rgb(37, 99, 235);
    --vanna-accent-primary-subtle: rgba(59, 130, 246, 0.2);
    --vanna-accent-primary-hover: rgb(147, 197, 253);

    --vanna-accent-positive-default: rgb(16, 185, 129);
    --vanna-accent-positive-stronger: rgb(5, 150, 105);
    --vanna-accent-positive-subtle: rgba(16, 185, 129, 0.18);

    --vanna-accent-negative-default: rgb(248, 113, 113);
    --vanna-accent-negative-stronger: rgb(239, 68, 68);
    --vanna-accent-negative-subtle: rgba(248, 113, 113, 0.18);

    --vanna-accent-warning-default: rgb(245, 158, 11);
    --vanna-accent-warning-stronger: rgb(217, 119, 6);
    --vanna-accent-warning-subtle: rgba(245, 158, 11, 0.18);

    --vanna-outline-default: rgba(148, 163, 184, 0.4);
    --vanna-outline-dimmer: rgb(51, 65, 85);
    --vanna-outline-dimmest: rgb(30, 41, 59);
    --vanna-outline-hover: rgb(147, 197, 253);

    --vanna-shadow-xs: 0 1px 2px 0 rgba(0, 0, 0, 0.6);
    --vanna-shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.5), 0 1px 2px -1px rgba(0, 0, 0, 0.5);
    --vanna-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.4);
    --vanna-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.4);
    --vanna-shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
    --vanna-shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
  }
`;
