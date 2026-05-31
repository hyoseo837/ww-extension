---
name: Warm Editorial
colors:
  surface: '#FFFFFF'
  surface-dim: '#e0d9ce'
  surface-bright: '#fff8f0'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#faf3e7'
  surface-container: '#f4ede2'
  surface-container-high: '#efe7dc'
  surface-container-highest: '#e9e2d7'
  on-surface: '#1e1b15'
  on-surface-variant: '#54433e'
  inverse-surface: '#333029'
  inverse-on-surface: '#f7f0e5'
  outline: '#87736d'
  outline-variant: '#d9c1ba'
  surface-tint: '#924a32'
  primary: '#8f4830'
  on-primary: '#ffffff'
  primary-container: '#ad5f46'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb59e'
  secondary: '#655d58'
  on-secondary: '#ffffff'
  secondary-container: '#ece0d9'
  on-secondary-container: '#6b635d'
  tertiary: '#00685d'
  on-tertiary: '#ffffff'
  tertiary-container: '#138376'
  on-tertiary-container: '#f4fffb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbd0'
  primary-fixed-dim: '#ffb59e'
  on-primary-fixed: '#390b00'
  on-primary-fixed-variant: '#75331d'
  secondary-fixed: '#ece0d9'
  secondary-fixed-dim: '#cfc4be'
  on-secondary-fixed: '#201a16'
  on-secondary-fixed-variant: '#4d4540'
  tertiary-fixed: '#95f3e4'
  tertiary-fixed-dim: '#79d7c8'
  on-tertiary-fixed: '#00201c'
  on-tertiary-fixed-variant: '#005048'
  background: '#fff8f0'
  on-background: '#1e1b15'
  surface-variant: '#e9e2d7'
  page-bg: '#FAF9F5'
  surface-alt: '#FBFAF6'
  border: '#E8E5DC'
  text-secondary: '#6E6A5F'
  text-muted: '#9A958A'
  positive: '#5E7C5A'
  negative: '#B5544A'
  accent-hover: '#B5644B'
typography:
  display-lg:
    fontFamily: Source Serif 4
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.01em
  display-lg-mobile:
    fontFamily: Source Serif 4
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg:
    fontFamily: Source Serif 4
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md:
    fontFamily: Source Serif 4
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  max-width: 960px
  gutter: 24px
---

# Design System — WW Scorer
  ## Brand & mood
  A calm, cozy, editorial companion app for a WaterlooWorks AI co-op job
  scorer. Warm and paper-like, not clinical. Adjectives: warm, cozy, calm,
  editorial, friendly, uncluttered, generous whitespace, soft. Inspired by
  Claude.ai's warm light theme. LIGHT MODE ONLY.
  ## Color palette (light)
  - Page background:      #FAF9F5  (warm ivory — never pure white)
  - App surface / cards:  #FFFFFF
  - Secondary surface:    #FBFAF6
  - Hairline / border:    #E8E5DC
  - Text primary:         #29261F  (warm near-black)
  - Text secondary:       #6E6A5F
  - Text muted:           #9A958A
  - Primary accent:       #C8755A  (terracotta / clay) — use sparingly, for
                                    primary buttons and key highlights only
  - Accent hover:         #B5644B
  - Accent soft fill:     #F4E8E1  (chips, selected states, subtle highlights)
  - Positive (Apply):     #5E7C5A
  - Negative (Skip/Excl.): #B5544A
  ## Typography
  - Headings/display: a warm humanist serif (Source Serif 4 / Tiempos-like /
    Fraunces). Used for page titles, big numbers (e.g. credit balance).
  - Body & UI: a clean humanist sans (Inter / Styrene-like).
  - Comfortable line-height (1.5 body), relaxed letter-spacing on headings.
  ## Shape & depth
  - Corner radius: cards 16px, buttons & inputs 10px, chips/pills full.
  - Shadows: very soft and warm only —
    0 1px 2px rgba(41,38,31,.04), 0 4px 16px rgba(41,38,31,.04).
  - Borders: 1px hairline (#E8E5DC) preferred over heavy shadows.
  ## Spacing & layout
  - 4px spacing scale; generous. Card padding 24px; section gaps 24–32px.
  - Max content width ~960px, centered; airy, never dense.
  - Fully responsive (mobile-friendly): cards stack, comfortable tap targets.
  ## Components
  - Buttons: primary = solid terracotta, white text, 10px radius; secondary =
    white with hairline border + primary text. Generous padding.
  - Cards: white, 16px radius, hairline border, soft shadow, 24px padding.
  - Inputs: white, hairline border, 10px radius, terracotta focus ring.
  - Chips/tags: pill, accent-soft fill, small.
  - Tables/lists: roomy rows, hairline dividers, no zebra striping.
  ## Do / Don't
  - DO: warm ivory backgrounds, one terracotta accent, serif headings + sans
    body, soft rounded cards, lots of whitespace.
  - DON'T: pure-white page backgrounds, cool grays/blues, harsh pure-black
    text, heavy drop shadows, multiple accent colors, cramped layouts.