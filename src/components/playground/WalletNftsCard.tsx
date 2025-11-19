import { useEffect, useState } from "react";
import { isEthAddress } from "../../lib/address";
import { api } from "../../lib/api";
import { NFT_METADATA_URI } from "./MintSponsoredCard";

type Props = {
  owner: `0x${string}` | "";
  authToken?: string | null;
  title?: string;
  subtitle?: string;
  disconnectedMessage?: string;
  emptyMessage?: string | null;
  loadingMessage?: string;
  refreshSignal?: number;
};

type Metadata = {
  image?: string;
  name?: string;
  description?: string;
};

export function WalletNftsCard({
  owner,
  authToken,
  title = "My Smart Account",
  subtitle = "Preview the SENTRA collectibles currently owned by your calculated smart account.",
  disconnectedMessage = "Calculate a smart account first to view holdings.",
  emptyMessage = "No SENTRA NFTs found for this account yet.",
  loadingMessage = "Loading holdings…",
  refreshSignal = 0,
}: Props) {
  const [tokens, setTokens] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);

  useEffect(() => {
    let active = true;
    fetch(NFT_METADATA_URI)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load NFT metadata.");
        return response.json();
      })
      .then((json) => {
        if (!active) return;
        setMetadata(json);
      })
      .catch((err) => {
        if (!active) return;
        console.error("Failed to fetch NFT metadata", err);
        setMetadata(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isEthAddress(owner)) {
      setTokens([]);
      setError(disconnectedMessage);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let active = true;
    api
      .getWalletNfts(owner, authToken)
      .then((response) => {
        if (!active) return;
        const ids = normalizeTokenIds(response);
        setTokens(ids);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        console.error("Failed to fetch wallet NFTs", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch wallet NFTs."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [owner, authToken, disconnectedMessage, refreshSignal]);

  const imageSrc = metadata?.image;
  const connected = isEthAddress(owner);
  const holdingsCount = tokens.length;

  return (
    <section className="surface-card space-y-5 p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
            {title}
          </div>
          <h3 className="text-lg font-semibold text-slate-50">
            SENTRA NFT Holdings
          </h3>
          <p className="text-sm text-slate-400 leading-relaxed">{subtitle}</p>
        </div>
        <div
          className={`rounded-full border px-4 py-2 text-xs font-mono ${
            connected
              ? "border-emerald-400/40 bg-emerald-400/5 text-emerald-200"
              : "border-slate-700 text-slate-500"
          }`}
        >
          {connected ? owner : "Wallet not connected"}
        </div>
      </header>

      <div className="surface-card surface-card--muted inline-flex w-fit flex-col rounded-xl border border-slate-800/60 p-4">
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
          Total NFTs
        </div>
        <div className="text-3xl font-semibold text-slate-50">
          {holdingsCount}
        </div>
        <p className="text-xs text-slate-400">
          Automatically refreshed after each mint.
        </p>
      </div>

      {loading ? (
        <div className="rounded border border-slate-800/60 bg-slate-900/40 p-4 text-sm text-slate-400">
          {loadingMessage}
        </div>
      ) : error ? (
        <div className="rounded border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : tokens.length === 0 ? (
        emptyMessage ? (
          <div className="rounded border border-slate-800/60 bg-slate-900/40 p-4 text-sm text-slate-400">
            {emptyMessage}
          </div>
        ) : null
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {tokens.map((tokenId) => (
            <div
              key={tokenId}
              className="space-y-3 rounded border border-slate-800 bg-slate-900/40 p-3"
            >
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt={metadata?.name ?? "SENTRA NFT"}
                  className="h-32 w-32 rounded object-cover"
                />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded border border-dashed border-slate-700 text-xs text-slate-500">
                  Preview unavailable
                </div>
              )}
              <div className="text-sm font-semibold text-slate-50">
                Token #{tokenId}
              </div>
              {metadata?.name ? (
                <div className="text-xs uppercase tracking-[0.16em] text-emerald-300/80">
                  {metadata.name}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function normalizeTokenIds(response: any): string[] {
  if (!response) return [];
  const list = Array.isArray(response)
    ? response
    : Array.isArray(response.tokens)
    ? response.tokens
    : Array.isArray(response.items)
    ? response.items
    : [];
  return list
    .map((entry: any) => {
      if (entry == null) return null;
      if (typeof entry === "string" || typeof entry === "number")
        return entry.toString();
      if ("tokenId" in entry) return String((entry as any).tokenId);
      return null;
    })
    .filter((value: string | null): value is string => Boolean(value));
}
