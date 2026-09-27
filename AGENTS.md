# Architecture rules

- Organize application code under `src/` using Feature-Sliced Design layers: `app`, `pages`, `widgets`, `features`, `entities`, and `shared`. Add only layers and slices that are needed.
- Keep dependencies flowing downward only: `app → pages → widgets → features → entities → shared`. Slices on the same layer must not import from one another.
- Import across slices only through that slice's public `index.ts`; use direct imports within the same slice.
- Put screen composition in `pages`, reusable page blocks in `widgets`, user actions in `features`, domain concepts and their data in `entities`, and generic reusable code in `shared`.
- Keep code in the appropriate slice segment, such as `ui`, `model`, `api`, or `lib`. Do not place feature- or entity-specific code in `shared`.
- Colocate tests with the code they cover. Run `npm test` and `npm run build` for relevant changes; run `npm run test:e2e` when changing browser flows.
- When changing existing code, keep the change scoped; do not perform unrelated architectural migrations.

## UI guidance

- Prioritize usability, clear information hierarchy, and few-step workflows over visual decoration.
- Design and implement phone layouts first, then enhance them for larger screens.
- Keep primary actions touch-friendly and reachable; use readable text, sufficient contrast, and visible focus.
- Check narrow widths, long content, safe areas, and keyboard/editor behavior when changing responsive flows.
- Keep desktop use functional without introducing a separate interaction model unnecessarily.
