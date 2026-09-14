# Frontend Architecture

## Stack
- Framework: React (Next.js PROPOSED for routing and SSR if needed, otherwise Vite SPA).
- Language: TypeScript.
- State Management: React Context + Zustand (PROPOSED).
- Data Fetching: React Query / SWR (PROPOSED).

## IMKAN One Compliance
- Must use shared platform shell.
- Cannot duplicate header or sidebar.
- Strict token usage for colors, spacing, and typography (14/12/10 scale).
- Support LTR and RTL natively using CSS logical properties and direction attributes.
- Use `next-intl` or `react-i18next` for EN/AR localization.

## Performance
- Code splitting by route (Home, Files, Admin).
- Virtualized lists for rendering large directories.
