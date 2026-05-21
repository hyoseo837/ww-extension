---
name: Stealth Obsidian
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#cbc3d7'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#958ea0'
  outline-variant: '#494454'
  surface-tint: '#d0bcff'
  primary: '#d0bcff'
  on-primary: '#3c0091'
  primary-container: '#a078ff'
  on-primary-container: '#340080'
  inverse-primary: '#6d3bd7'
  secondary: '#ffe083'
  on-secondary: '#3c2f00'
  secondary-container: '#eec200'
  on-secondary-container: '#645000'
  tertiary: '#ffb869'
  on-tertiary: '#482900'
  tertiary-container: '#ca801e'
  on-tertiary-container: '#3f2300'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#ffe083'
  secondary-fixed-dim: '#eec200'
  on-secondary-fixed: '#231b00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#ffdcbb'
  tertiary-fixed-dim: '#ffb869'
  on-tertiary-fixed: '#2c1700'
  on-tertiary-fixed-variant: '#673d00'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 16px
  stack-gap: 12px
  inline-gap: 8px
  section-margin: 24px
---

## Brand & Style

The design system is anchored in a "Stealth" aesthetic—a high-performance, low-friction environment for power users. It prioritizes utility and focus, transforming the utilitarian nature of WaterlooWorks into a premium productivity suite. 

The visual style is a blend of **Minimalism** and **Corporate Modern**, utilizing a dark, monochromatic foundation to reduce ocular strain while using a single high-signal accent color to denote intelligence and action. The brand personality is efficient, sophisticated, and quiet, ensuring the extension feels like a native power-up rather than a cluttered third-party addition.

## Colors

The palette is built on a "Dark Stealth" foundation. The primary background is a deep, near-black slate to provide maximum contrast for content. 

- **Primary (Indigo):** Used exclusively for AI-driven features, primary actions, and active states. It represents the "intelligence" layer.
- **Secondary (Gold):** An occasional accent used for high-priority alerts or status indicators, nodding to traditional academic achievement.
- **Neutrals:** A scale of cool slates is used to create hierarchy. Darker shades define the background, while lighter grays define interactive surfaces and borders.
- **Semantic:** Success and error states are muted but clear, using desaturated greens and reds to maintain the low-clutter aesthetic.

## Typography

Typography is used to create a strict information hierarchy. 

- **Headlines:** Hanken Grotesk provides a modern, slightly sharp feel that suggests precision.
- **Body:** Inter is the workhorse, selected for its exceptional legibility at small sizes within the Chrome extension popup.
- **Labels:** JetBrains Mono is used for metadata, secondary labels, and technical information (like API settings) to reinforce the "tool" aesthetic.
- **Contrast:** High contrast is maintained for headlines (Pure White), while secondary body text uses a muted slate to reduce visual noise.

## Layout & Spacing

This design system employs a **Fixed Grid** model tailored for the constraints of a Chrome extension (typically 360px to 400px wide). 

- **Vertical Rhythm:** A 4px baseline grid ensures tight alignment. 
- **Generous Margins:** A standard 16px internal padding for the extension container prevents the UI from feeling cramped.
- **Density:** High density is used for data-heavy sections (like job lists), while "Settings" and "Context" views use more generous 24px margins to reduce cognitive load during configuration.

## Elevation & Depth

Hierarchy is achieved through **Tonal Layers** rather than heavy shadows, maintaining the "stealth" feel.

- **Level 0 (Background):** Deepest slate (#020617).
- **Level 1 (Cards/Containers):** Slightly lighter slate (#0F172A) with a 1px border (#1E293B).
- **Level 2 (Interactive Elements):** Buttons and inputs use a subtly raised tone or a very faint indigo glow when focused.
- **Depth Markers:** Use subtle inner shadows for input fields to create a "recessed" feel, making the data entry feel like a tactile physical action.

## Shapes

The shape language is **Soft** but disciplined. 
- **Standard Radius:** 4px (0.25rem) for inputs and small buttons to maintain a professional, sharp look.
- **Large Radius:** 8px (0.5rem) for cards and containers to provide a touch of modern softness.
- **Interactive States:** On hover, borders should transition from slate to the primary indigo to signal interactivity without moving or shifting the layout.

## Components

### Buttons
- **Primary:** Solid Indigo with white text. No gradient. 
- **Secondary:** Transparent background with a 1px slate border. Text is light gray.
- **Ghost:** No border or background. Used for navigation tabs or "Cancel" actions.

### Input Fields & Textareas
- Background is darker than the card surface.
- Labels are rendered in **label-caps** style (JetBrains Mono) above the field.
- Active focus state is a 1px Indigo border with a 2px semi-transparent Indigo outer glow.

### Cards & Summaries
- Cards use the Level 1 surface color. 
- They should have a subtle "AI-Active" state for summaries generated by Gemini, indicated by a thin 2px vertical Indigo bar on the left edge.

### Toggles & Switches
- Small, sleek pill-shapes. The "off" state is a dark slate; the "on" state is Indigo. No text inside the toggle.

### Lists
- Job listings or extracted text should use 1px slate dividers.
- Hover states on list items should use a subtle background tint (#1E293B).

### Progress Indicators
- Use a slim (2px) horizontal bar at the very top of the extension popup to indicate API processing. This keeps the main UI static and reduces distraction.