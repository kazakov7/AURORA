# AURORA Backend Agent Instruction

AURORA is a NestJS GraphQL monorepo migrated from the existing Nestar backend into a travel marketplace platform.

## Project Shape

- Backend apps are `aurora-api` and `aurora-batch`.
- Keep the existing Nestar architecture and coding style.
- Keep the existing NestJS resolver/service/module pattern based on MVC and DI.
- Keep DTOs, enums, types and schemas in their existing Nestar structure.
- Keep shared modules reusable: auth, member, like, view, comment, follow, board article, socket.
- Prefer modifying existing Nestar code over creating duplicate implementations.

## Domain Rules

- AURORA is a travel marketplace with Member, Agent, Destination, Property/Hotel and Tour as core domains.
- Keep `MemberType.USER`, `MemberType.AGENT` and `MemberType.ADMIN`.
- Public signup creates `USER` only.
- Member and Agent are separate entities.
- A user becomes `AGENT` only after agent application approval.
- Agent types are `HOTEL` and `TOUR`.
- `HOTEL` agents manage Property/Hotel listings.
- `TOUR` agents manage Tour listings.
- Destination represents a city; `destinationCountry` holds the country it belongs to.
- Authorization and ownership must always be validated server-side.
- Do not trust client-provided roles, ownership, verification state, prices, counters or payment state.
- Current AURORA requirements provided in the task override old Nestar business/domain logic.
- Existing Nestar architecture and code style remain the implementation reference.

## Workflow

1. Analyze the existing implementation before editing.
2. Reuse existing Nestar patterns whenever compatible.
3. Keep changes small and consistent with the existing project style.
4. Do not rewrite working logic unless AURA requirements require it.
5. Do not create duplicate helpers, guards, decorators or utilities when an existing implementation can be adapted.
6. Do not refactor unrelated working code.
7. Add or update focused tests when behavior changes.

## Validation

Use these checks for backend work:

```bash
npx tsc -p apps/aurora-api/tsconfig.app.json --noEmit
npx tsc -p apps/aurora-batch/tsconfig.app.json --noEmit
npm run build
```
