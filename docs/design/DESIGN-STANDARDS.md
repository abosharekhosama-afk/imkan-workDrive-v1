# IMKAN One — Design Standards

**Status:** REQUIRED / PROJECT DESIGN STANDARD  
**Version:** 1.0  
**Purpose:** Mandatory standard for repairing and building UI interfaces in IMKAN WorkDrive.

## 1. Authority Hierarchy

1. **IMKAN One Design System** — visual authority.
2. **This document** — project-level implementation standard.
3. **Existing IMKAN components** — reuse before creating new components.
4. **Zoho WorkDrive** — functional/UX research reference only.
5. Local invention — last resort and must not be presented as official IMKAN One.

The objective is **not** to copy Zoho's visual identity. The objective is to reproduce appropriate WorkDrive-class information architecture, workflows, interaction patterns, density, navigation and usability using IMKAN One visual language and components.

## 2. Current Token Contract

The repository's supplied fallback token contract explicitly identifies these as authoritative:

```css
--imkan-color-primary: #0f62fe;
--imkan-font-size-ui: 14px;
--imkan-font-size-secondary: 12px;
--imkan-font-size-meta: 10px;
```

The following are explicitly **LOCAL FALLBACKS**, not authoritative IMKAN One values:

```css
--imkan-color-bg
--imkan-color-fg
--imkan-color-muted
--imkan-color-surface
--imkan-font-latin
--imkan-font-arabic
```

The current fallback font is `system-ui`. The supplied contract says the intended font families are Zoho Puvi for English and IBM Plex Sans Arabic for Arabic, but they are not currently packaged. Do not claim they are installed until the official assets/packages exist.

## 3. Token Rules

All styling must use design tokens wherever a corresponding token exists. Do not scatter literal values throughout components or create aliases for a second theme.

Use the existing `--imkan-*` tokens for colors, typography and semantic aliases. Do not introduce values such as `--workdrive-primary`, `--dashboard-theme`, or another application-specific primary color.

If an official value is unavailable, do not silently present an invented value as an official IMKAN One token. Mark it provisional and document the missing authority.

## 4. Component Authority

Before creating a component, inspect the existing IMKAN component library and shared UI primitives.

Reuse existing:

- buttons;
- inputs and forms;
- dropdowns/selects;
- menus;
- dialogs/modals;
- tabs;
- tables/lists;
- cards;
- badges;
- tooltips;
- navigation;
- icons;
- loading, empty, error and success states.

Create a new component only when no equivalent exists, and make it reusable, token-driven and consistent with IMKAN One. Never create a parallel visual system for one page.

## 5. Zoho WorkDrive Reference Rules

Zoho WorkDrive may be studied for:

- information architecture;
- navigation structure;
- file/folder workflows;
- toolbar behavior;
- search, filtering and sorting;
- contextual actions;
- sharing and permissions workflows;
- file preview;
- upload workflows;
- empty/loading/error states;
- interaction sequencing;
- responsive productivity patterns.

Do **not** copy Zoho branding, logos, proprietary assets, product colors or visual identity. The result must be an **IMKAN One application with WorkDrive-like functionality**, not a Zoho clone.

## 6. Layout and Hierarchy

Every screen should clearly distinguish:

1. global/platform navigation;
2. application/module context;
3. page title/context;
4. primary actions;
5. secondary/contextual actions;
6. main content;
7. status and feedback.

Avoid decorative elements that compete with the workflow.

## 7. Navigation

Navigation must be predictable and consistent across modules. Distinguish global navigation, application navigation, module navigation, page navigation and contextual navigation. Keep labels and behavior consistent.

## 8. Actions

Each screen must have an obvious primary action using the IMKAN primary treatment. Secondary actions remain subordinate. Destructive actions must be distinguishable and confirmed when materially consequential. Selection-based actions should be contextual when appropriate.

## 9. Forms

Use shared IMKAN form components. Labels must be clear; required fields distinguishable; validation close to the affected field; errors actionable; repeated-choice inputs should use shared dropdown/select controls where appropriate.

## 10. Tables, Lists and File Views

Data-heavy interfaces should maintain consistent columns, row actions, sorting/filtering where needed, useful information density, contextual actions and complete loading/empty/error states. File list/grid views must remain consistent across the application.

## 11. States

Every major asynchronous/data-dependent screen must define loading, empty, error and normal/success feedback states as appropriate. Never leave unexplained blank screens.

## 12. Dialogs

Use dialogs only when a decision is needed before continuing. Provide a clear title, concise explanation and explicit actions. Avoid unnecessary interruption.

## 13. Responsive Design

Interfaces must remain usable across supported viewport sizes. Preserve access to primary actions, readable content, usable controls and navigation. Do not merely shrink desktop layouts; move secondary actions into contextual menus when space requires it while keeping primary actions accessible.

## 14. Internationalization and RTL

The application must support English and Arabic and both LTR and RTL where required.

Avoid hard-coded physical left/right positioning when logical properties can be used. Prefer start/end and inline/block concepts. Arabic must use the configured IMKAN Arabic font token when the official font becomes available.

## 15. Accessibility

Interactive elements must be keyboard accessible; focus states must remain visible; icon-only controls need accessible names; dialogs must manage focus; color must not be the sole mechanism for meaning; semantic HTML and accessible shared components are preferred.

## 16. Dark Mode

Use the existing token-driven dark-mode approach. Do not create a second theme. The supplied token contract keeps the IMKAN primary unchanged unless an authoritative IMKAN One specification later defines otherwise.

## 17. Productivity Density

Because this is a productivity/file-management product, favor efficient information density, clear hierarchy, low visual noise, predictable controls, fast access to common actions and contextual actions. Do not add unnecessary decoration or excessive whitespace that reduces useful information visibility.

## 18. Design Repair Procedure

For every interface repair, the agent MUST:

1. **Inspect** the page, existing components, tokens, shared styles, navigation and layout primitives.
2. **Identify violations** such as hard-coded colors, duplicate components/themes, inconsistent typography, spacing, controls, navigation, states, RTL or responsive behavior.
3. **Map each violation to IMKAN** tokens/components/patterns.
4. **Repair** by replacing inconsistent implementations with the appropriate reusable IMKAN implementation.
5. **Validate** desktop, responsive, RTL, English, Arabic, keyboard behavior and loading/empty/error/success states.
6. **Document** significant changes in project change documentation.

## 19. Prohibited Practices

The agent MUST NOT:

- create a Zoho visual theme;
- create an application-specific theme;
- introduce another primary color;
- invent official IMKAN tokens;
- copy Zoho branding or proprietary assets;
- unnecessarily duplicate shared components;
- use unnecessary hard-coded design values;
- break RTL or accessibility for visual similarity;
- sacrifice responsive behavior for reference matching;
- describe fallback values as official IMKAN One values.

## 20. Missing Official Specifications

When the repository lacks an authoritative specification for a property such as spacing, radius, shadows, motion, iconography, dimensions or colors:

1. use an existing approved token/component if available;
2. otherwise follow the nearest established project pattern;
3. mark the result provisional;
4. document the missing authority;
5. do not create a permanent official token without approval.

## 21. Definition of Done

A repaired interface is complete only when:

- [ ] IMKAN One remains the visual authority.
- [ ] Zoho WorkDrive is used only as a functional/UX reference.
- [ ] Existing IMKAN components are reused wherever possible.
- [ ] No competing theme or primary color exists.
- [ ] No invented value is presented as an official IMKAN token.
- [ ] Typography follows the available token contract.
- [ ] English/Arabic and LTR/RTL are handled where required.
- [ ] Responsive behavior is preserved.
- [ ] Accessibility is preserved.
- [ ] Loading, empty, error and success states are handled.
- [ ] Shared navigation and components remain consistent.
- [ ] Significant design changes are documented.
- [ ] UI/design validation passes.

## 22. Source-of-Truth Note

This file is a **project implementation standard**, not a replacement for the official private IMKAN One package or authoritative IMKAN One documentation. If an official IMKAN One package/specification becomes available, it supersedes fallback and provisional values here. The agent must then update this document and migrate the UI to the authoritative source.

## 23. Agent Directive

When implementing or repairing any interface, treat this file as mandatory design governance.

> **Build a WorkDrive-class productivity experience using IMKAN One components, tokens, patterns and branding — never by creating a Zoho visual clone.**

Conflict priority:

**IMKAN One authority > this project standard > existing reusable IMKAN components > Zoho functional reference > local invention.**
