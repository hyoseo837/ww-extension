---
name: Academic Rusticity
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
  primary: '#72311b'
  on-primary: '#ffffff'
  primary-container: '#8f4830'
  on-primary-container: '#ffc9b8'
  inverse-primary: '#ffb59d'
  secondary: '#655d58'
  on-secondary: '#ffffff'
  secondary-container: '#e9ddd7'
  on-secondary-container: '#69615c'
  tertiary: '#004d4b'
  on-tertiary: '#ffffff'
  tertiary-container: '#006764'
  on-tertiary-container: '#94e2de'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbd0'
  primary-fixed-dim: '#ffb59d'
  on-primary-fixed: '#390b00'
  on-primary-fixed-variant: '#74331d'
  secondary-fixed: '#ece0da'
  secondary-fixed-dim: '#cfc4be'
  on-secondary-fixed: '#201a17'
  on-secondary-fixed-variant: '#4d4541'
  tertiary-fixed: '#a1f1ec'
  tertiary-fixed-dim: '#86d4d0'
  on-tertiary-fixed: '#00201f'
  on-tertiary-fixed-variant: '#00504d'
  background: '#fff8f0'
  on-background: '#1e1b15'
  surface-variant: '#e9e2d7'
  page-bg: '#FAF9F5'
  surface-alt: '#FBFAF6'
  border: '#E8E5DC'
  positive: '#5E7C5A'
  negative: '#B5544A'
  text-muted: '#9A958A'
  text-secondary: '#6E6A5F'
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
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  gutter: 24px
  max-width: 960px
---

## Brand & Style

The brand personality is academic, reliable, and warm. It targets students and professionals who require a sense of stability and scholarly authority in their tools. The visual style is a refined **Corporate Modern** approach with a distinct **warm-neutral** twist, moving away from cold blues in favor of earthy terracottas and parchment-like surfaces.

The emotional response should be one of "calm productivity"—avoiding the clinical feel of traditional SaaS tools and instead evoking the feeling of a well-organized university office or a high-end stationery set. The UI is clean and structured but remains approachable through subtle organic color choices.

## Colors

The palette is anchored by a deep terracotta primary (`#8F4830`), providing a sophisticated "ink-on-paper" contrast. The background strategy uses a tiered warm-white approach: `page-bg` for the canvas and `surface` (pure white) for elevated content containers.

Functional colors are desaturated to maintain the earthy aesthetic: `positive` is a forest green rather than a vibrant lime, and `negative` is a brick red. Use `text-secondary` for metadata and `text-muted` for structural labels or disabled states to maintain a clear visual hierarchy without resorting to pure black.

## Typography

The system utilizes a high-contrast pairing between a scholarly serif and a utilitarian sans-serif. 

- **Source Serif 4** is reserved for headings and displays, providing the "academic" voice of the brand. It should be used for large numbers and section headers.
- **Inter** handles all functional UI text, body copy, and labels. Its high x-height ensures readability in data-heavy tables.

On mobile, `display-lg` scales down to `headline-lg` sizing to ensure the layout remains balanced. Use `label-sm` with increased letter spacing for table headers and tag-like elements to distinguish them from standard body copy.

## Layout & Spacing

The system uses a **Fixed Grid** philosophy for desktop, centering content within a 960px container to maintain a readable measure for information-dense sections. 

- **Desktop Side-Nav**: A fixed 256px (w-64) sidebar manages primary navigation.
- **Margins & Gutters**: Use 24px (`lg`) for standard component internal padding and page margins. 
- **Vertical Rhythm**: Section headers are separated from their content by 32px (`xl`), while elements within a card use 16px (`md`) or 12px (`sm`) spacing.
- **Responsive Behavior**: On mobile, the sidebar moves to a hidden drawer, replaced by a 64px tall sticky header. Page horizontal padding should reduce to 16px or 24px depending on the content width.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** and **Ambient Shadows**. Surfaces are not strictly flat but use depth to signify interactivity:

- **Cards**: Use a white background (`surface`) against the off-white page background (`page-bg`). Apply a very soft, high-diffusion shadow: `0 8px 32px rgba(30,27,21,0.03)`. This subtle tint (using the neutral color in the shadow) prevents the shadow from looking "dirty."
- **Borders**: Every container and divider uses a light, warm-grey border (`#E8E5DC`). This is the primary method of separation.
- **Hover States**: Interactive rows in tables use `surface-alt` (`#FBFAF6`) to create a subtle shift in tone without requiring a shadow change.

## Shapes

The shape language is **Soft (Level 1)**, leaning towards a professional and structured appearance. 

- **Standard Buttons & Inputs**: 0.25rem (DEFAULT).
- **Cards & Primary Sections**: 0.75rem (xl), providing enough curve to soften the large 960px layout.
- **Chips & Avatars**: Use "full" rounding (pill-shaped) for elements that represent identity or status tags.
- **Icons**: Icons are contained within 0.5rem (lg) rounded squares when used as decorative accents in lists or navigation.

## Components

### Buttons
- **Primary**: Terracotta background (`primary`), white text. High contrast, sharp corners (4px).
- **Secondary**: Surface-colored background with a defined border. Used for "Load More" or secondary actions.

### Tables
- **Header**: Use `label-sm` with `text-muted` and a bottom border.
- **Rows**: High-contrast text for primary data, `text-secondary` for metadata (dates). Use a hover state of `surface-alt`.
- **Status Icons**: Small 32px square containers with rounded-lg (8px) corners, using `surface-container-low` backgrounds and primary/positive icons.

### Navigation
- **Active State**: In the sidebar, the active link uses `secondary-container` background with `on-secondary-container` text.
- **Inactive State**: `on-surface-variant` text with no background.

### Chips
- Small, pill-shaped tags used for filtering or indicating status. Should have a subtle border and `surface-container` background.