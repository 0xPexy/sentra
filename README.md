# Sentra Dashboard

Sentra Dashboard is a focused developer console for ERC‑4337 (Account Abstraction). It is built to reduce the friction of experimenting with sponsored UserOperations, make failures explainable, and turn “what went wrong” into an actionable fix.

## What it’s for

- Lower the barrier to AA: from wallet connection to a sponsored mint in minutes, with step‑by‑step feedback.
- Operational visibility: recent UserOps, success rate, total sponsored gas, and a per‑operation gas breakdown (phases, limits, overhead).
- Faster debugging: one‑click scenarios for common AA errors and a guided path to a “fixed” input.

## Core Features

- Playground
  - Simple Smart Account calculation (Factory + Owner + Salt → deterministic address)
  - Sponsored ERC‑721 mint via AA: `safeMint(address,string)`
  - Clear, stepwise logs (encode → prepare → paymaster stub/data → estimate → send)
  - Gas snapshot before send (CGL/VGL/PVG) and quick import of the latest token to MetaMask

- Simulator
  - Top AA error presets: AA10/AA21/AA23/AA24/AA25/AA32/AA33/AA34/AA90
  - Run “Error” vs “Fixed” scenarios side‑by‑side to compare intent vs. correction
  - Includes time‑shift for AA32, wrong domain signing for AA24, and prefund issues for AA21

- Gas Analyzer
  - Donut chart and “limits vs usage” view per UserOp
  - Warnings on risky sections (e.g., validation gas too low) and an overhead explainer
  - Deep‑link from the Stats table for quick analysis

- Dashboard
  - High‑level metrics (success rate, total sponsored gas, average gas used)
  - Recent UserOps table (hash/sender/target/selector/status/time) and a detail modal (block, gas, revert reason, tx)

## Design Principles

- Show the path: the UI narrates what happens at each AA step rather than hiding it.
- Practical first: presets are taken from real production issues and map to known AA codes.
- Resilient UX: safe defaults and defensive rendering prevent “white‑screen” moments.

## Tech

- TypeScript + React + Vite
- viem
  - Wallet/Public clients
  - Account Abstraction: Bundler client + ERC‑7677 Paymaster client
- permissionless
  - Simple Smart Account (EntryPoint 0.8; salt → `index`)
- Utility‑first styling (Tailwind‑style classes)

## Development

Prerequisites
- Node.js 18+
- pnpm 8+

Commands
```bash
pnpm install       # install dependencies
pnpm dev           # start dev server
pnpm build         # production build
pnpm tsc --noEmit  # type check
```

## Roadmap

- Deeper traces in the UserOp detail (revert/subsidy events)
- Table filters (time/status/selector) and pagination
- More sample actions (ERC‑20, batch calls)
- Packaging for team deployments (branding, access control)



## License

Proprietary – internal use only unless otherwise specified.
