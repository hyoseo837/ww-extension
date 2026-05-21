---
name: Stealth Light
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#494454'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#7b7486'
  outline-variant: '#cbc3d7'
  surface-tint: '#6d3bd7'
  primary: '#6b38d4'
  on-primary: '#ffffff'
  primary-container: '#8455ef'
  on-primary-container: '#fffbff'
  inverse-primary: '#d0bcff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#4d5d73'
  on-tertiary: '#ffffff'
  tertiary-container: '#66768d'
  on-tertiary-container: '#fdfcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#d3e4fe'
  tertiary-fixed-dim: '#b7c8e1'
  on-tertiary-fixed: '#0b1c30'
  on-tertiary-fixed-variant: '#38485d'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  gutter: 24px
  margin-desktop: 48px
  margin-mobile: 16px
  container-max: 1280px
---

## Brand & Style

The design system is a high-contrast, airy evolution of a technical aesthetic. It balances the "stealth" DNA—precision, focus, and performance—with a professional clarity suitable for high-stakes productivity environments. The style is a hybrid of **Modern Minimalism** and **Corporate Precision**, utilizing heavy white space to reduce cognitive load while maintaining technical authority through sharp typography and purposeful accents.

The UI should feel surgical and lightweight. It avoids heavy fills in favor of structural lines and depth created through light and shadow. The goal is to evoke a sense of "quiet power"—a tool that is incredibly capable but stays out of the user's way until needed.

## Colors

The color palette is anchored by a stark high-contrast foundation. 

- **Primary:** The vibrant purple (#8b5cf6) is used exclusively for key actions, active states, and brand-critical moments. It must stand out against the monochrome base.
- **Surface Palette:** Backgrounds utilize pure white (#ffffff) for the primary workspace and a very light gray (#f8fafc) for secondary sidebars or containment areas.
- **Text & Ink:** High-legibility is achieved using deep charcoal (#0f172a) for headings and a slightly softer slate (#334155) for body copy.
- **Interactive States:** Use subtle shifts in opacity or 50px-radius "glow" highlights for hover states rather than changing the background color drastically.

## Typography

Typography in this design system emphasizes hierarchy and "scannability." **Hanken Grotesk** is used across all levels to maintain a cohesive, modern technical feel.

- **Headlines:** Use Bold (700) and SemiBold (600) with slight negative letter spacing to create a compact, "designed" look.
- **Body:** Standard body text uses a generous line height (1.5x - 1.6x) to ensure the high-contrast black text remains comfortable for long-form reading.
- **Labels:** Small labels and metadata should use the `label-caps` style to differentiate them from interactive text and body content.

## Layout & Spacing

This design system uses a **fixed-fluid hybrid grid**. The main content area is capped at 1280px to prevent excessive line lengths on ultra-wide monitors, centered within the viewport.

- **Grid:** A 12-column system for desktop, collapsing to 4 columns on mobile.
- **Rhythm:** An 8px base unit governs all padding and margins. 
- **Density:** Maintain "airy" proportions by utilizing wide gutters (24px) and significant margins. Components themselves should have internal padding that feels breathable—never cramped. 
- **Reflow:** On mobile, sidebars convert to bottom sheets or full-screen overlays to preserve the focused "stealth" experience.

## Elevation & Depth

Depth is conveyed through a combination of **low-contrast outlines** and **ambient shadows**. Dark fills are strictly prohibited for surface differentiation.

- **Level 0 (Base):** Pure white background.
- **Level 1 (Card/Surface):** A 1px border (#e2e8f0) with a very soft, diffused shadow (0px 4px 20px rgba(0, 0, 0, 0.04)).
- **Level 2 (Floating/Dropdown):** A 1px border (#cbd5e1) with a more pronounced shadow (0px 10px 30px rgba(0, 0, 0, 0.08)).
- **Interactive Depth:** When a user hovers over an interactive card, the shadow should slightly deepen, and the border color should shift toward the primary purple at low opacity.

## Shapes

The shape language is "Softly Geometric." Elements use a consistent 0.5rem (8px) radius to feel modern and approachable, yet structured.

- **Small Components:** Checkboxes and small tags use `rounded-sm` (4px).
- **Standard Components:** Buttons, inputs, and cards use the base `rounded` (8px).
- **Large Components:** Modals and large containers use `rounded-lg` (16px).
- **Pills:** Used only for status indicators (e.g., "Active," "Pending") to differentiate them from actionable buttons.

## Components

- **Buttons:**
    - *Primary:* Solid #8b5cf6 fill with white text. No shadow.
    - *Secondary:* White background with a 1px #e2e8f0 border. On hover, the border becomes #8b5cf6.
- **Input Fields:** Use a clean 1px border. Focus states are indicated by a 2px #8b5cf6 border and a soft purple outer glow. Labels sit above the field in the `label-caps` style.
- **Cards:** White background, 1px border, and ambient shadow. Content within cards should follow the 8px spacing rhythm.
- **Chips/Tags:** Light gray background (#f1f5f9) with Slate-600 text. Use the `body-sm` font size.
- **Checkboxes & Radios:** When selected, they utilize the primary purple. When empty, they use a subtle #cbd5e1 border.
- **Lists:** Use subtle 1px horizontal separators (#f1f5f9). List items should have a generous vertical padding (16px) to maintain the "airy" feel.