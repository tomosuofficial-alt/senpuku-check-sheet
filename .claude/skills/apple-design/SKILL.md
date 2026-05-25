---
name: apple-design
description: Apply Apple Human Interface Guidelines inspired design to web UIs. Clean typography, generous whitespace, subtle animations, glassmorphism, SF-style system fonts. Use when improving UI design, styling components, making interfaces look polished, modern, or Apple-like.
---

# Apple Design System for Web

Apply Apple's design philosophy to web interfaces: clarity, deference, depth. Create UIs that feel native to iOS/macOS with web technologies.

## When to Use This Skill

- Improving visual design of HTML/CSS components
- Styling forms, cards, modals, tabs, buttons
- Adding micro-interactions and animations
- Making an interface feel premium and polished
- Designing mobile-first responsive layouts

## Core Design Principles

### 1. Clarity
- Content is paramount; every element serves a purpose
- Use negative space generously
- Typography creates visual hierarchy without heavy decoration

### 2. Deference
- UI helps users understand content, never competes with it
- Subtle translucency, blurs, and layering create depth
- Minimize visual noise

### 3. Depth
- Layered interfaces with meaningful transitions
- Shadows and blur create spatial relationships
- Motion provides context and continuity

## Design Tokens

### Typography

```css
/* System Font Stack (SF Pro equivalent) */
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text',
  'Helvetica Neue', 'Noto Sans JP', sans-serif;

/* Scale */
--font-title-large: 34px;    /* weight: 700, letter-spacing: 0.37px */
--font-title-1: 28px;        /* weight: 700, letter-spacing: 0.36px */
--font-title-2: 22px;        /* weight: 700, letter-spacing: 0.35px */
--font-title-3: 20px;        /* weight: 600, letter-spacing: 0.38px */
--font-headline: 17px;       /* weight: 600, letter-spacing: -0.41px */
--font-body: 17px;           /* weight: 400, letter-spacing: -0.41px */
--font-callout: 16px;        /* weight: 400, letter-spacing: -0.32px */
--font-subheadline: 15px;    /* weight: 400, letter-spacing: -0.24px */
--font-footnote: 13px;       /* weight: 400, letter-spacing: -0.08px */
--font-caption-1: 12px;      /* weight: 400, letter-spacing: 0px */
--font-caption-2: 11px;      /* weight: 400, letter-spacing: 0.07px */
```

### Colors (Light Mode)

```css
/* System Colors */
--color-blue: #007AFF;
--color-green: #34C759;
--color-red: #FF3B30;
--color-orange: #FF9500;
--color-yellow: #FFCC00;
--color-purple: #AF52DE;
--color-pink: #FF2D55;
--color-teal: #5AC8FA;

/* Semantic Colors */
--color-label: #000000;
--color-secondary-label: rgba(60, 60, 67, 0.6);
--color-tertiary-label: rgba(60, 60, 67, 0.3);
--color-quaternary-label: rgba(60, 60, 67, 0.18);

/* Backgrounds */
--bg-primary: #FFFFFF;
--bg-secondary: #F2F2F7;
--bg-tertiary: #FFFFFF;
--bg-grouped: #F2F2F7;
--bg-grouped-secondary: #FFFFFF;

/* Separators */
--separator: rgba(60, 60, 67, 0.29);
--separator-opaque: #C6C6C8;

/* Fill */
--fill-primary: rgba(120, 120, 128, 0.2);
--fill-secondary: rgba(120, 120, 128, 0.16);
--fill-tertiary: rgba(120, 120, 128, 0.12);
--fill-quaternary: rgba(120, 120, 128, 0.08);
```

### Spacing

```css
/* Apple uses 8pt grid system */
--space-2: 2px;
--space-4: 4px;
--space-6: 6px;
--space-8: 8px;
--space-12: 12px;
--space-16: 16px;
--space-20: 20px;
--space-24: 24px;
--space-32: 32px;
--space-40: 40px;
--space-48: 48px;
```

### Border Radius

```css
--radius-sm: 8px;     /* Small elements: chips, tags */
--radius-md: 12px;    /* Cards, inputs */
--radius-lg: 16px;    /* Modals, large cards */
--radius-xl: 20px;    /* Sheets, panels */
--radius-full: 9999px; /* Pills, circular buttons */
```

### Shadows

```css
/* Elevation 1: Cards */
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06);

/* Elevation 2: Dropdowns, popovers */
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04);

/* Elevation 3: Modals, sheets */
--shadow-lg: 0 8px 28px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.04);

/* Elevation 4: Notifications */
--shadow-xl: 0 16px 48px rgba(0, 0, 0, 0.16), 0 8px 16px rgba(0, 0, 0, 0.06);
```

## Component Patterns

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: var(--color-blue);
  color: #fff;
  border: none;
  border-radius: var(--radius-full);
  padding: 12px 24px;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.41px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.btn-primary:hover {
  filter: brightness(1.1);
}
.btn-primary:active {
  transform: scale(0.97);
  filter: brightness(0.95);
}

/* Secondary Button */
.btn-secondary {
  background: var(--fill-tertiary);
  color: var(--color-blue);
  border: none;
  border-radius: var(--radius-full);
  padding: 12px 24px;
  font-size: 17px;
  font-weight: 600;
}
```

### Cards (Grouped Table Style)

```css
.card {
  background: var(--bg-grouped-secondary);
  border-radius: var(--radius-md);
  padding: 0;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  min-height: 44px; /* Apple's minimum touch target */
}
.card-row + .card-row {
  border-top: 0.5px solid var(--separator);
}
```

### Segmented Controls (Tab Bars)

```css
.segmented-control {
  display: flex;
  background: var(--fill-tertiary);
  border-radius: var(--radius-sm);
  padding: 2px;
  gap: 0;
}
.segment {
  flex: 1;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--color-secondary-label);
  background: transparent;
  border: none;
}
.segment.active {
  background: #fff;
  color: var(--color-label);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
}
```

### Status Badges

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
}
.badge-done {
  background: rgba(52, 199, 89, 0.12);
  color: #248A3D;
}
.badge-partial {
  background: rgba(255, 149, 0, 0.12);
  color: #C93400;
}
.badge-none {
  background: rgba(255, 59, 48, 0.1);
  color: #D70015;
}
```

### Glassmorphism (Frosted Glass)

```css
.glass {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 0.5px solid rgba(0, 0, 0, 0.08);
}
```

## Animations & Transitions

### Standard Curves

```css
/* Apple's standard easing */
--ease-standard: cubic-bezier(0.25, 0.1, 0.25, 1);

/* Spring-like for interactive elements */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

/* Deceleration for entering elements */
--ease-decel: cubic-bezier(0, 0, 0.2, 1);

/* Acceleration for exiting elements */
--ease-accel: cubic-bezier(0.4, 0, 1, 1);
```

### Common Animations

```css
/* Tap feedback */
.tappable:active {
  transform: scale(0.97);
  transition: transform 0.1s ease;
}

/* Smooth appear */
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.appear {
  animation: fadeInUp 0.35s var(--ease-decel) forwards;
}

/* Sheet slide up */
@keyframes slideUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
```

## Responsive Patterns

```css
/* Compact (iPhone SE): up to 375px */
/* Regular (iPhone): 376px - 428px */
/* Large (iPad/Desktop): 429px+ */

/* Content max-width */
.container {
  max-width: 428px;
  margin: 0 auto;
  padding: 0 16px;
}

/* Touch targets: minimum 44x44px */
button, a, [role="button"] {
  min-height: 44px;
  min-width: 44px;
}
```

## AI Assistant Instructions

When this skill is activated:

1. **Analyze** the current UI component or page
2. **Apply** Apple design tokens (colors, spacing, typography, radius)
3. **Use** the component patterns from this skill as reference
4. **Ensure** minimum 44px touch targets for interactive elements
5. **Add** subtle transitions (0.2-0.35s) on interactive states
6. **Maintain** visual hierarchy through typography scale, not decoration
7. **Prefer** system font stack over custom fonts for body text

Always:
- Use the 8pt grid for spacing
- Apply consistent border-radius from the token set
- Use semantic colors (label, secondary-label) not raw values
- Add `:active` states with `scale(0.97)` for tappable elements
- Use `rgba()` for overlays and fills for transparency
- Keep backgrounds clean with `#F2F2F7` grouped style

Never:
- Use heavy borders (prefer 0.5px or box-shadow)
- Use harsh shadows (keep them soft and diffused)
- Skip hover/active states on interactive elements
- Use font sizes outside the type scale
- Ignore minimum touch target sizes
- Use saturated background colors for large areas
