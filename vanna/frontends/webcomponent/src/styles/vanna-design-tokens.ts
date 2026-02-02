import { css } from 'lit';

// Vanna 2.0 design tokens - Earthy brown/amber palette
export const vannaDesignTokens = css`
  :host {
    /* Brand Colors - Earthy palette */
    --vanna-navy: rgb(62, 39, 18);
    --vanna-cream: rgb(245, 240, 230);
    --vanna-teal: rgb(139, 90, 43);
    --vanna-orange: rgb(217, 119, 6);
    --vanna-magenta: rgb(220, 38, 38);

    /* Color Palette - Light mode (default) */
    --vanna-background-root: rgb(255, 255, 255);
    --vanna-background-default: rgb(249, 246, 243);
    --vanna-background-higher: rgb(245, 241, 236);
    --vanna-background-highest: rgb(239, 234, 227);
    --vanna-background-subtle: rgb(253, 251, 249);
    --vanna-background-lower: rgb(247, 244, 240);
    --vanna-background-cream-accent: rgb(245, 240, 230);

    --vanna-foreground-default: rgb(62, 39, 18);
    --vanna-foreground-dimmer: rgb(87, 75, 62);
    --vanna-foreground-dimmest: rgb(120, 107, 92);

    --vanna-accent-primary-default: rgb(139, 90, 43);
    --vanna-accent-primary-stronger: rgb(105, 63, 22);
    --vanna-accent-primary-strongest: rgb(62, 39, 18);
    --vanna-accent-primary-subtle: rgba(139, 90, 43, 0.1);
    --vanna-accent-primary-hover: rgb(160, 104, 50);

    --vanna-accent-positive-default: rgb(5, 150, 105);
    --vanna-accent-positive-stronger: rgb(4, 120, 87);
    --vanna-accent-positive-subtle: rgba(5, 150, 105, 0.1);

    --vanna-accent-negative-default: rgb(220, 38, 38);
    --vanna-accent-negative-stronger: rgb(185, 28, 28);
    --vanna-accent-negative-subtle: rgba(220, 38, 38, 0.1);

    --vanna-accent-warning-default: rgb(217, 119, 6);
    --vanna-accent-warning-stronger: rgb(180, 83, 9);
    --vanna-accent-warning-subtle: rgba(217, 119, 6, 0.1);

    /* Outline/Border colors */
    --vanna-outline-default: rgba(139, 90, 43, 0.25);
    --vanna-outline-dimmer: rgb(236, 229, 220);
    --vanna-outline-dimmest: rgb(245, 240, 233);
    --vanna-outline-hover: rgb(139, 90, 43);

    /* Typography */
    --vanna-font-family-default: "Space Grotesk", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
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

    /* Shadows - Preline-inspired */
    --vanna-shadow-xs: 0 1px 2px 0 rgba(0, 0, 0, 0.04);
    --vanna-shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.06);
    --vanna-shadow-md: 0 4px 8px -2px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.06);
    --vanna-shadow-lg: 0 10px 20px -5px rgba(0, 0, 0, 0.10), 0 4px 8px -4px rgba(0, 0, 0, 0.08);
    --vanna-shadow-xl: 0 20px 30px -8px rgba(0, 0, 0, 0.12), 0 8px 12px -6px rgba(0, 0, 0, 0.08);
    --vanna-shadow-2xl: 0 25px 40px -10px rgba(0, 0, 0, 0.15);

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
    --vanna-background-root: rgb(15, 12, 9);
    --vanna-background-default: rgb(22, 18, 14);
    --vanna-background-higher: rgb(32, 26, 20);
    --vanna-background-highest: rgb(42, 35, 27);
    --vanna-background-subtle: rgb(24, 19, 14);
    --vanna-background-lower: rgb(10, 8, 6);

    --vanna-foreground-default: rgb(248, 244, 238);
    --vanna-foreground-dimmer: rgb(210, 200, 185);
    --vanna-foreground-dimmest: rgb(160, 147, 130);

    --vanna-accent-primary-default: rgb(180, 120, 60);
    --vanna-accent-primary-stronger: rgb(200, 140, 75);
    --vanna-accent-primary-strongest: rgb(139, 90, 43);
    --vanna-accent-primary-subtle: rgba(180, 120, 60, 0.15);
    --vanna-accent-primary-hover: rgb(200, 140, 75);

    --vanna-accent-positive-default: rgb(16, 185, 129);
    --vanna-accent-positive-stronger: rgb(5, 150, 105);
    --vanna-accent-positive-subtle: rgba(16, 185, 129, 0.15);

    --vanna-accent-negative-default: rgb(248, 113, 113);
    --vanna-accent-negative-stronger: rgb(239, 68, 68);
    --vanna-accent-negative-subtle: rgba(248, 113, 113, 0.15);

    --vanna-accent-warning-default: rgb(245, 158, 11);
    --vanna-accent-warning-stronger: rgb(217, 119, 6);
    --vanna-accent-warning-subtle: rgba(245, 158, 11, 0.15);

    --vanna-outline-default: rgba(180, 120, 60, 0.3);
    --vanna-outline-dimmer: rgb(45, 38, 30);
    --vanna-outline-dimmest: rgb(28, 22, 16);
    --vanna-outline-hover: rgb(180, 120, 60);

    --vanna-shadow-xs: 0 1px 2px 0 rgba(0, 0, 0, 0.6);
    --vanna-shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.5), 0 1px 2px -1px rgba(0, 0, 0, 0.5);
    --vanna-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.4);
    --vanna-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.4);
    --vanna-shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
    --vanna-shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
  }
`;
