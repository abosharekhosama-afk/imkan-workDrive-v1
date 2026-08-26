# UI Architecture

## IMKAN One Integration
- The frontend will consume the IMKAN One NPM packages for tokens and components.
- CSS Modules or Tailwind configured STRICTLY with IMKAN One tokens.

## Rules
- **No duplicate shells:** WorkDrive mounts into the existing IMKAN platform shell.
- **Typography:** Enforce 14/12/10px density scale.
- **Localization:** `dir="auto"` or explicit `rtl`/`ltr` applied at the root. Flexbox layouts must use `start/end` instead of `left/right`.
