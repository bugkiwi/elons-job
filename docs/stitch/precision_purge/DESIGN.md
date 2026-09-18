---
name: Precision Purge
colors:
  surface: '#0f131c'
  surface-dim: '#0f131c'
  surface-bright: '#353943'
  surface-container-lowest: '#0a0e17'
  surface-container-low: '#181c25'
  surface-container: '#1c2029'
  surface-container-high: '#262a34'
  surface-container-highest: '#31353f'
  on-surface: '#dfe2ef'
  on-surface-variant: '#bfc7d3'
  inverse-surface: '#dfe2ef'
  inverse-on-surface: '#2c303a'
  outline: '#89919d'
  outline-variant: '#3f4851'
  surface-tint: '#99cbff'
  primary: '#99cbff'
  on-primary: '#003354'
  primary-container: '#1d9bf0'
  on-primary-container: '#003050'
  inverse-primary: '#00629d'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#cf8400'
  on-tertiary-container: '#432700'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#cfe5ff'
  primary-fixed-dim: '#99cbff'
  on-primary-fixed: '#001d33'
  on-primary-fixed-variant: '#004a78'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#0f131c'
  on-background: '#dfe2ef'
  surface-variant: '#31353f'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
  headline-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  headline-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  body-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 12px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system delivers a high-performance, precision-grade utility experience tailored for modern power users, content curators, and technical professionals who demand total signal control over social feeds. Rooted in the visual precision of tools like Linear and Raycast, and native to the refined atmosphere of modern dark-mode social platforms, the aesthetic bridges defensive cybersecurity telemetry with effortless consumer control.

The visual tone is discreet, hyper-focused, and authoritative:
- **Atmospheric Pitch Black**: Foundations are constructed from obsidian and cold-slate tiers, keeping screen light minimal and maximizing focus on active operational indicators.
- **Instrument Precision**: UI elements favor low visual mass, sharp micro-radii, fine 1px structural dividing lines, and high tabular data fidelity.
- **Confident Feedback**: Real-time classifications (spam filtering, crypto scrubbing, AI confidence thresholds) are telegraphed instantly through micro-badges, emerald operational indicators, and glowing electric accents.

The interface evokes safety, technical competence, and seamless automation—making high-frequency comment sanitization feel like an integrated background engine.

## Colors

The color system is optimized for ambient dark workflows, utilizing distinct tonal surface depths and functional signal accents.

### Core Canvas & Surfaces
- **Canvas Base (`#0B0E14`)**: Root popup background and overlay scrims. Deep, near-void obsidian that dissolves extension boundaries into dark mode viewports.
- **Surface Elevation 1 (`#12161F`)**: Primary cards, floating filter panels, and segmented control containers.
- **Surface Elevation 2 (`#181E2A`)**: Hover states, embedded table rows, active input fields, and nested module wells.
- **Surface Elevation 3 (`#1F2737`)**: Interactive pill hovers, tooltip surfaces, and floating popovers.

### Structural Lines & Dividers
- **Subdued Border (`#222B38`)**: Standard 1px boundary line separating logical modules, cards, and toolbars.
- **High-Contrast Border (`#2E3848`)**: Active focus states, toggle track borders, and interactive card perimeters.

### Functional Accents
- **Electric Sky (`#1D9BF0`)**: Primary interaction, brand identity, radio anchors, and selected states. Hover transitions to `#60A5FA`; active click settles at `#1A8CD8`.
- **Shield Emerald (`#10B981`)**: "Protection Active" metrics, clean sanitation status, and confirmed safe payloads. Muted background tint: `rgba(16, 185, 129, 0.12)`.
- **Flagged Amber (`#F59E0B`)**: Suspected crypto solicitation, high-frequency bot velocity alerts, and borderline confidence scores. Muted background tint: `rgba(245, 158, 11, 0.12)`.
- **Purge Coral (`#EF4444`)**: Quarantined explicit spam, banned regex triggers, and block actions. Muted background tint: `rgba(239, 68, 68, 0.14)`.

### Typography Neutrals
- **Text High-Contrast (`#F9FAFB`)**: Primary metrics, titles, active toggle labels.
- **Text Medium-Contrast (`#94A3B8`)**: Secondary captions, telemetry subtitles, metadata keys.
- **Text Low-Contrast (`#64748B`)**: Inactive hotkeys, disabled placeholders, structural icons.

## Typography

The typography strategy leverages two distinct type engines:
1. **Primary Interface (`Inter`)**: Engineered for UI legibility at small sizes. Used across headers, navigation, form inputs, toggle descriptions, and explanatory text. Tracking is slightly tightened (`-0.01em`) on weights 600 and above to evoke dense engineering tools.
2. **Telemetry & Metrology (`JetBrains Mono`)**: Strict tabular monospace numbers and identifiers. Dedicated to AI inference percentage bars, confidence indices, blocked count counters, execution latency (ms), rule syntax, and shortcut keys.

### Rules for Application
- All quantitative stats (e.g., `99.4% Purged`, `1,420 Spam Blocked`) must use monospace labels or headlines with numeric tabular lining enabled (`font-feature-settings: 'tnum' 1`).
- Uppercase styling is reserved strictly for micro labels (`label-sm`), system status badges (e.g., `ACTIVE`, `IDLE`, `PURGED`), and input category prefixes, paired with `letter-spacing: 0.05em`.

## Layout & Spacing

This design system standardizes on a fixed 380px extension popup width (scalable up to a 640px expanded side-panel or settings modal), structured via an 8pt base grid with a 4pt micro-step.

### Chrome Extension Frame Architecture
- **Popup Container**: Fixed width of `380px`, constrained height up to `580px` with internal scroll chaining.
- **Outer Canvas Margins**: Uniform `margin` (16px / `1rem`) across header, content body, and action footer.
- **Section Stack Rhythm**: Discrete functional cards stack with an element gap of `space-md` (12px / `0.75rem`).
- **Internal Density**: Dense internal padding (`space-sm` / 8px to `space-md` / 12px) inside list items and configuration modules to prevent vertical sprawl while retaining touch/click reliability.

### Breakpoints & Adaptive Modes
- **Compact View (Popup, 360px–400px)**: 1-column stack. Metrics arranged in a 2x1 metric grid.
- **Expanded Panel (Drawer / Tab, 640px+)**: 2-column layout. Left column houses live telemetry stream; right column anchors rule toggles and filter sensitivity calibration.

## Elevation & Depth

Visual depth is achieved through **Tonal Stacking** paired with **Low-Contrast Outlines** and **Micro Glow Accents**. Deep dropshadows are rejected in favor of razor-sharp boundaries that maintain clarity in dark environments.

### Depth Hierarchy
- **Level 0 (Base Canvas)**: `#0B0E14` (solid, non-interactive).
- **Level 1 (Card & Module Foundation)**: `#12161F` with a continuous `1px solid #222B38` outline. Shadows are omitted; clarity relies entirely on contrast.
- **Level 2 (Active Controls, Hover States, Floating Inputs)**: `#181E2A` elevated with a 1px border (`#2E3848`) and an ambient tinted drop: `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45)`.
- **Level 3 (Popovers, Flyout Tooltips, Floating Action Bars)**: `#1F2737` with `border: 1px solid #3B82F6/40` and dynamic directional diffusion: `box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.65), 0 0 1px 1px rgba(29, 155, 240, 0.15)`.

### Optical Highlights & Luminescence
- Active status badges and high-confidence telemetry indicators utilize an internal inset highlight: `box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.06)`.
- Critical shield engagement glows: When AI sanitization is engaged, the hero shield metric card casts an ambient pulse: `0 0 32px -8px rgba(16, 185, 129, 0.15)`.

## Shapes

The design system adopts a **Soft (Level 1)** geometric discipline. Radii are deliberate, compact, and engineered to reflect a professional developer console rather than playful consumer software.

### Geometry Specifications
- **Micro Radii (`4px`)**: Checkboxes, slider thumbs, monospace code tags, table cells, confidence score indicators.
- **Standard Control Radii (`6px`)**: Buttons, text inputs, segmented tab items, dropdown triggers.
- **Container Radii (`8px`)**: Metric cards, rule group modules, modal overlays, main view panels.
- **Full Pill (`9999px`)**: Reserved exclusively for binary status indicators (e.g., `SHIELD ON`, `CLEANED`), toggle switches, and quick-filter category pills.

## Components

### Buttons
- **Primary Action (Execute/Clean)**: Background `#1D9BF0`, text `#FFFFFF`, font-weight 600, border radius `6px`. Hover: `#60A5FA` with `box-shadow: 0 0 12px rgba(29, 155, 240, 0.35)`. Active: `#1A8CD8`.
- **Secondary / Ghost (Whitelist, Config)**: Background `transparent`, border `1px solid #222B38`, text `#94A3B8`. Hover: Background `#181E2A`, border `#2E3848`, text `#F9FAFB`.
- **Destructive (Purge Cache / Block Account)**: Background `rgba(239, 68, 68, 0.10)`, border `1px solid rgba(239, 68, 68, 0.30)`, text `#EF4444`. Hover: Background `#EF4444`, text `#FFFFFF`.

### Switch Toggles (The "Shield Engine" Toggle)
- **Track**: Width 36px, height 20px, full pill shape (`9999px`).
  - Off: `#181E2A`, border `1px solid #2E3848`.
  - On: `#1D9BF0` or `#10B981` (for auto-purge active).
- **Thumb**: Diameter 14px, circle, `#FFFFFF`. Smooth transition `transform 150ms cubic-bezier(0.16, 1, 0.3, 1)`.

### Confidence Score Badges & Status Pills
- Compact pills styled in `JetBrains Mono` (`label-sm`, 10px uppercase).
- **Safe / High Confidence**: Background `rgba(16, 185, 129, 0.12)`, text `#10B981`, border `1px solid rgba(16, 185, 129, 0.25)`.
- **Suspect / Clutter**: Background `rgba(245, 158, 11, 0.12)`, text `#F59E0B`, border `1px solid rgba(245, 158, 11, 0.25)`.
- **Explicit / Malicious**: Background `rgba(239, 68, 68, 0.12)`, text `#EF4444`, border `1px solid rgba(239, 68, 68, 0.25)`.

### Metric Telemetry Cards
- Surface background `#12161F`, border `1px solid #222B38`, padding `12px 14px`, border radius `8px`.
- Contains:
  - Metric Header: `label-sm` in `#64748B` with an optional 6px circular operational status dot.
  - Large Metric Value: `headline-lg` in `JetBrains Mono` (`#F9FAFB`).
  - Delta/Subtext: `label-sm` showing real-time purged counts (`+42 today` in `#10B981`).

### Input Fields & Sensitivity Sliders
- **Text Inputs (Regex & Keyword Filters)**:
  - Background `#0B0E14`, border `1px solid #222B38`, color `#F9FAFB`, placeholder `#64748B`, font family `Inter`, font size `13px`, radius `6px`.
  - Focus state: Border `#1D9BF0`, outline `none`, subtle halo `box-shadow: 0 0 0 2px rgba(29, 155, 240, 0.20)`.
- **Sensitivity Range Slider (Confidence Calibration)**:
  - Track: 4px height, background `#181E2A`, filled progress bar `#1D9BF0`.
  - Thumb: 14px square with `4px` rounded corners, background `#FFFFFF`, border `2px solid #1D9BF0`, cursor grab.

### Activity Stream List Item (Quarantined Feed Preview)
- Border bottom `1px solid #222B38`, hover background `#12161F/80`.
- Row Layout: 
  - Left: Monospace tag indicating spam category (`[CRYPTO]`, `[NSFW]`, `[BOT]`).
  - Center: Truncated comment body with flagged tokens highlighted in `#EF4444` or `#F59E0B`.
  - Right: Quick-action icons (Restore, Ban Domain, Inspect Confidence) rendered in `#64748B`, transitioning to `#F9FAFB` on hover.