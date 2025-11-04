# Sentra Dashboard

Sentra Dashboard is a developer console for ERC‑4337 Account Abstraction. It lets you:

- Build and send sponsored UserOperations (UserOps) via a Bundler & Paymaster
- Calculate and use a deterministic Simple Smart Account
- Deploy and interact with a sample ERC‑721 (Mintable) contract
- Monitor Paymaster statistics and recent UserOps


## Contents

- Playground: AA flows, Simple Account, ERC‑721 sponsored mint
- Dashboard: Stats overview and Paymaster UserOp table
- API & configuration: How the app talks to your backend and chain
- Development: Run, build, and customize


## Playground

The Playground is a hands‑on area to experiment with ERC‑4337 flows.

- Simple Account calculator
  - Fetches SimpleAccountFactory and EntryPoint addresses from your backend
  - Calculates a deterministic account address on‑chain (`factory.getAddress(owner, salt)`) and persists it locally

- Sponsored ERC‑721 mint
  - Prepares a UserOp using the calculated Simple Account
  - Obtains Paymaster stub data (ERC‑7677) and estimates gas via the Bundler
  - Sends the UserOp through the Bundler with Paymaster sponsorship
  - Reads `totalSupply` to suggest a next token ID automatically
  - “Import to MetaMask” adds the last minted token (based on `totalSupply - 1`)

Implementation notes:
- Viem is used for Wallet/Public/Bundler/Paymaster clients
- Simple Account is created via `permissionless` (`toSimpleSmartAccount`) targeting EntryPoint 0.8
- AA send path is clean: prepare → stub → estimate → send


## Dashboard

### Stats Overview

Renders `/api/v1/stats/overview`:
- Total Sponsored Gas (GWEI) with auto‑formatted ETH equivalent
- Total Sponsored Ops
- Average Gas Used (rounded)
- Success Rate (%; supports 0–1 or 0–100 input)

### Paymaster UserOps Table

Renders `/api/v1/paymasters/:address/ops` with optional query params (`chain_id`, `limit`, `cursor`).
- Columns: UserOp Hash, Sender, Target, Selector, Status, Time
- Click a UserOp Hash to open a detail modal (currently shows placeholder revert reason, tx hash, and paymaster subsidy)
- Safe rendering for incomplete items; colors for success/failure


## Configuration

Environment variables (Vite):

- `VITE_RPC_URL` – JSON‑RPC endpoint for the chain
- `VITE_BUNDLER_URL` – Bundler RPC endpoint (eth_sendUserOperation)
- `VITE_API_URL` – Sentra backend API base URL
- `VITE_DEV_TOKEN` – Optional dev token passed as `Authorization` for backend calls

These variables are read by `src/lib/viem.ts` and `src/lib/api.tsx`.


## API Endpoints Used

- `GET /api/v1/addresses?contract=simple_account_factory|entry_point` – Infra addresses
- `GET /api/v1/stats/overview` – Overview metrics
- `GET /api/v1/paymasters/me` – Current Paymaster (address, chainId, entryPoint)
- `GET /api/v1/paymasters/:address/ops` – Paginated UserOps (`chain_id`, `limit`, `cursor`)
- `POST /api/v1/erc7677/*` – Paymaster stub/data (via viem Paymaster client)
- `GET /api/v1/contracts/:name` – Contract artifact (ABI/bytecode for sample ERC‑721)


## Tech Stack

- React + TypeScript + Vite
- Viem (wallet/public, account‑abstraction bundler/paymaster clients)
- permissionless (Simple Smart Account for EP 0.8)
- Tailwind‑style utility classes for UI


## Development

Prerequisites: Node 18+, pnpm 8+

```bash
pnpm install
pnpm dev       # start dev server
pnpm build     # production build
```

Type checking:

```bash
pnpm tsc --noEmit
```


## Usage Tips

1) Open Playground → Calculate Simple Account (owner + salt) → Persisted locally.

2) Deploy the sample ERC‑721 (optional) → allowlist via backend API if required.

3) Sponsored mint
   - Target: deployed ERC‑721
   - Sender: the calculated Simple Account
   - Paymaster: must be configured server‑side (contracts, users)
   - Click “Send” to prepare → stub → estimate → send UserOp

4) Import to MetaMask
   - Uses the last minted token (`totalSupply - 1`), and will succeed only if the connected account owns the token on the active network.

5) Dashboard → verify stats and recent UserOps
   - Overview cards show totals and rates
   - Table lists recent operations; click hash for a detail modal (placeholder data for now)


## Troubleshooting

- MetaMask import fails with “Unable to verify ownership”
  - Ensure the active network matches the token’s chain
  - Confirm the connected wallet owns `tokenId = totalSupply - 1`

- UserOp signature errors
  - The app strips stub signatures and triggers real wallet signing; ensure MetaMask is connected and prompts are not blocked

- Ops table is empty
  - Check that Paymaster address/chainId are loaded and your backend returns items for that network


## Roadmap

- Replace placeholder UserOp detail modal data with real revert/tx/subsidy traces
- Table pagination & filters (status, date range, selector)
- More sample actions (batch calls, ERC‑20 flows)
- Light/dark theming polish and layout refinements


## License

Proprietary – internal use only unless otherwise specified.
