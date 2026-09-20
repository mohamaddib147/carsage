---
name: CarSage
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0eded'
  surface-container-high: '#eae7e7'
  surface-container-highest: '#e4e2e1'
  on-surface: '#1b1c1c'
  on-surface-variant: '#3f4946'
  inverse-surface: '#303030'
  inverse-on-surface: '#f3f0f0'
  outline: '#6f7976'
  outline-variant: '#bec9c5'
  surface-tint: '#1e6a5c'
  primary: '#004036'
  on-primary: '#ffffff'
  primary-container: '#00594c'
  on-primary-container: '#87cdbd'
  inverse-primary: '#8dd4c3'
  secondary: '#795902'
  on-secondary: '#ffffff'
  secondary-container: '#fdd275'
  on-secondary-container: '#775800'
  tertiary: '#383734'
  on-tertiary: '#ffffff'
  tertiary-container: '#4f4e4b'
  on-tertiary-container: '#c2bfbb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#a9f0df'
  primary-fixed-dim: '#8dd4c3'
  on-primary-fixed: '#00201a'
  on-primary-fixed-variant: '#005145'
  secondary-fixed: '#ffdf9e'
  secondary-fixed-dim: '#ebc166'
  on-secondary-fixed: '#261a00'
  on-secondary-fixed-variant: '#5b4300'
  tertiary-fixed: '#e5e2dd'
  tertiary-fixed-dim: '#c8c6c2'
  on-tertiary-fixed: '#1c1c19'
  on-tertiary-fixed-variant: '#474743'
  background: '#fcf9f8'
  on-background: '#1b1c1c'
  surface-variant: '#e4e2e1'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: 0em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.005em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.03em
  caption:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-tablet: 1.5rem
  gutter-desktop: 2rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes an automotive companion that feels like an experienced, calm, and dependable co-pilot. Built for everyday drivers managing maintenance, mileage, diagnostics, and documentation, the interface diverges completely from aggressive dealership aesthetics, clinical utility tools, or loud mobility apps.

The aesthetic blends **Modern Heritage Minimalism** with **Warm Editorial Utility**:
- **Personality:** Trustworthy, poised, considerate, and unobtrusive. The interface provides quiet confidence, communicating status and maintenance schedules with clarity rather than panic.
- **Visual Tenets:** Generous breathing room, structured card architectures, soft organic rounding, and a tactile sense of paper and polished leather rather than cold glass or glowing neon.
- **Tone:** Measured, informative, and reassuring. Alert states prioritize actionable solutions over alarming visual noise.

## Colors

The palette grounds the interface in timeless motoring heritage while maintaining crisp digital readability.

- **Primary (`#00594C`):** British Racing Green serves as the primary anchor for headers, primary action buttons, selected navigation states, and brand verification elements.
- **Secondary / Accent (`#C9A24B`):** Warm Amber/Soft Gold acts as a nuanced accent for milestones, status badges, ratings, inspection reminders, and warm micro-highlights. It must be used sparingly to retain its perceived value.
- **Background & Canvas (`#F5F1E8`):** A warm Cream foundation that reduces eye strain compared to stark blue-whites and establishes an organic, physical warmth.
- **Surfaces & Cards:**
  - Base Card: Pure White (`#FFFFFF`) for active, elevated, and interactive content modules.
  - Secondary Container: Tinted Cream (`#FAF7F2`) for embedded items, status wells, and grouped sub-panels.
  - Structural Hairlines: Warm Muted Border (`#E5DFD3`) at 1px thickness to anchor surfaces without heavy drop shadows.
- **Typography & Text Contrast:**
  - Headings & Primary Copy: Dark Graphite (`#2B2B2B`) for crisp, legible hierarchy without harsh pure black.
  - Secondary Copy: Soft Graphite (`#4A4A4A`) for supporting details, timestamps, and secondary metadata.
  - Tertiary / Muted: Warm Slate (`#75736E`) for placeholders and caption tags.
- **Feedback Semantics:**
  - Success: Forest Mint (`#1F6E50`)
  - Warning: Warm Amber (`#C9A24B`)
  - Critical / Fault: Crimson Clay (`#A3382D`)

## Typography

The typographic hierarchy utilizes **Plus Jakarta Sans** across all roles. Its geometric balance, humanized apertures, and refined modern proportions deliver exceptional clarity for dashboards, telematics, maintenance records, and reading-heavy vehicle manuals.

- **Display & Large Headlines:** Used for vehicle models, odometer summaries, and primary screen destinations. Tracking is gently tightened (`-0.02em`) to maintain editorial authority and prevent loose titles.
- **Body Text:** Structured with generous line heights to facilitate comfortable scanning while parked or running quick vehicle checks.
- **Labels & Overlines:** Employs medium-to-semi-bold weights with slight positive letter spacing to establish clarity on vehicle specs, VINs, and telemetry indicators.
- **Data & Numbers:** Numbers inherit tabular lining figures where possible for odometer counters, service intervals, and fuel efficiency rates.

## Layout & Spacing

This design system uses a fluid-responsive layout anchored by an 8-point spatial model. The rhythm emphasizes open spacing, giving complex automotive information space to breathe.

- **Grid Systems:**
  - **Mobile (< 640px):** 4-column fluid layout with `1rem` margins and `1rem` gutters. Vertical stacked cards dominate.
  - **Tablet (640px - 1024px):** 8-column layout with `2rem` margins and `1.5rem` gutters. Dashboard metrics reflow into 2-column card configurations.
  - **Desktop (> 1024px):** 12-column layout with maximum content width capped at `1200px` to maintain focused legibility. Multi-pane structure splits active vehicle diagnostics from historical service logs.
- **Spacing Principles:**
  - Group related vehicle stats (e.g., tire pressures, oil life) tightly using `space-xs` and `space-sm`.
  - Separate interactive operational groups with `space-md` and `space-lg`.
  - Maintain page-level section dividers with `space-xl`.

## Elevation & Depth

Visual hierarchy is communicated through warm tonal layering and soft, low-contrast ambient shadows rather than stark elevation jumps.

- **Tonal Stacking:** Surfaces step forward from the warm Cream background (`#F5F1E8`) to Pure White cards (`#FFFFFF`). Sub-panels and recessed inputs sit quietly inside White cards using Tinted Cream (`#FAF7F2`).
- **Ambient Shadow Character:** Shadows are warm-tinted and deeply diffused, using the deep tones of `#2B2B2B` mixed with a touch of earth green:
  - *Base Surface (Cards, Panels):* `0px 2px 10px rgba(43, 43, 43, 0.04), 0px 1px 2px rgba(43, 43, 43, 0.02)`.
  - *Elevated (Popovers, Active Bottom Sheets, Floating Nav):* `0px 12px 28px rgba(43, 43, 43, 0.07), 0px 4px 8px rgba(43, 43, 43, 0.03)`.
- **Low-Contrast Perimeter Lines:** Every elevated surface is coupled with a subtle 1px border (`#E5DFD3`) to maintain crisp boundaries under direct sunlight or varying mobile screen brightness.

## Shapes

The design system adopts a reassuring, organic curvature that mirrors high-end automotive interior trim and steering wheels.

- **Base Radius (Roundedness: 2):** Standard inputs, secondary buttons, tags, and table cells use `0.5rem` (8px).
- **Cards & Primary Modules (`rounded-lg` / `rounded-xl`):** Primary content cards and diagnostic modules feature `1rem` to `1.5rem` (16px to 24px) corner radius, softening the overall visual envelope.
- **Floating Controls & Modals (`rounded-2xl`):** Action sheets, hero vehicle preview containers, and bottom navigation bars utilize generous 24px to 32px radii.
- **Pills:** Used strictly for interactive tags, status chips (e.g., "Good Condition", "Due Soon"), and tab switchers.

## Components

### Buttons
- **Primary:** British Racing Green (`#00594C`) background with pure white text, 48px minimum touch height, `rounded-xl` (16px) corners, and medium font weight. Subtle active scale effect (`0.98`).
- **Secondary:** Tinted Cream (`#FAF7F2`) background with a 1px `#E5DFD3` border and Dark Graphite (`#2B2B2B`) text.
- **Tertiary / Subtle:** Transparent background with `#00594C` label and subtle hover fill of `#FAF7F2`.
- **Accent Action:** Soft Gold (`#C9A24B`) reserved for premium membership cues, roadside urgency, or scheduled service bookings.

### Cards & Vehicle Status Tiles
- Constructed from Pure White (`#FFFFFF`) with a 1px border (`#E5DFD3`) and warm ambient shadow.
- Interior layout incorporates `space-md` to `space-lg` internal padding.
- Metric cards (e.g., Oil Life, Fuel/Battery Range) use large numeral tokens paired with a subdued status indicator pill in the top-right corner.

### Chips & Badges
- **Informational Chips:** Soft Cream (`#FAF7F2`) fill with `#4A4A4A` text, bordered with `#E5DFD3`, fully rounded into a pill shape.
- **Status Badges:** Muted background tints paired with solid indicator dots (e.g., `#00594C` for verified/completed, `#C9A24B` for pending inspection).

### Input Fields & Controls
- **Text Fields:** 48px height, Crisp White fill, subtle border (`#E5DFD3`), `rounded-lg` (8px). Focus state brings a 1.5px `#00594C` ring with zero aggressive drop shadow.
- **Checkboxes & Radios:** Curved 4px corners for checkboxes, fully circular for radios. In checked states, solid `#00594C` fill with a crisp white glyph.
- **Range Sliders & Toggles:** British Racing Green fill on active track, warm white thumb with delicate elevation.

### Vehicle Health Indicators (Custom Component)
- Horizontal segmented progress bars indicating component wear (brakes, fluids, battery).
- Segment states transition seamlessly from deep British Racing Green to muted amber, avoiding abrasive red hazard styling unless an immediate critical mechanical failure is detected.

### Lists & Activity Logs
- Service histories, mileage logs, and document lists rely on inset dividers (`#E5DFD3`) and generous vertical padding (`space-md`). 
- Icons sit inside subtle `40px` circular containers filled with `#FAF7F2`.