import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import { CalculateSimpleAccountCard } from "../components/playground/CalculateSimpleAccountCard";
import { MintSponsoredCard } from "../components/playground/MintSponsoredCard";
import { usePlaygroundStoredState } from "../hooks/usePlaygroundStoredState";
import { useAuth } from "../state/auth";
import { api } from "../lib/api";

export default function Playground() {
  const { storedState, updateStoredState } = usePlaygroundStoredState();
  const { token } = useAuth();
  const [erc721Address, setErc721Address] = useState<`0x${string}` | "">("");
  const [erc721Status, setErc721Status] = useState<
    "loading" | "loaded" | "error"
  >("loading");
  const [erc721Error, setErc721Error] = useState<string | null>(null);

  const lastDeploy = storedState.lastDeploy ?? null;
  const defaultMintSender =
    storedState.simpleAccount && storedState.simpleAccount.length > 0
      ? storedState.simpleAccount
      : storedState.minter || lastDeploy?.minter || "";
  const resolvedTarget = erc721Address || lastDeploy?.address || "";
  const overviewItems = useMemo(
    () => [
      {
        label: "EntryPoint",
        value: storedState.paymasterEntryPoint ?? "Not configured",
        ok: Boolean(storedState.paymasterEntryPoint),
      },
      {
        label: "Smart Account",
        value: storedState.simpleAccount ?? "Run calculation",
        ok: Boolean(storedState.simpleAccount),
      },
      {
        label: "SENTRA NFT",
        value: resolvedTarget || "Fetching from server",
        ok: Boolean(resolvedTarget),
      },
    ],
    [resolvedTarget, storedState.paymasterEntryPoint, storedState.simpleAccount]
  );

  useEffect(() => {
    let active = true;
    setErc721Status("loading");
    setErc721Error(null);
    api
      .getContractAddress("erc721", token)
      .then((response) => {
        if (!active) return;
        setErc721Address(response.address);
        setErc721Status("loaded");
      })
      .catch((error) => {
        if (!active) return;
        console.error("Failed to load ERC-721 address", error);
        setErc721Address("");
        setErc721Status("error");
        setErc721Error(
          error instanceof Error
            ? error.message
            : "Failed to load ERC-721 address."
        );
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="space-y-8">
      <PageHeader title="Playground" />
      <section className="surface-card surface-card--muted space-y-4 p-6">
        <div className="flex flex-col gap-2">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Guided Flow
            </div>
            <h3 className="text-lg font-semibold text-slate-50">
              Configure, Calculate, Mint
            </h3>
            <p className="text-sm text-slate-400">
              Spin up a SENTRA-ready smart account and mint a sponsored NFT in
              minutes—no wallets, no script juggling, just click through.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {overviewItems.map((item) => (
            <div
              key={item.label}
              className="rounded border border-slate-800/60 bg-slate-900/50 p-3"
            >
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                {item.label}
              </div>
              <div
                className={`mt-1 font-mono text-sm ${
                  item.ok ? "text-emerald-300" : "text-amber-200"
                }`}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </section>
      <CalculateSimpleAccountCard
        storedState={storedState}
        updateStoredState={updateStoredState}
        suggestedEntryPoint={storedState.paymasterEntryPoint ?? ""}
        authToken={token}
        onCalculated={({ address, owner, salt, factory }) => {
          updateStoredState({
            simpleAccount: address,
            minter: address,
            simpleAccountOwner: owner,
            simpleAccountFactory: factory,
            lastSalt: salt.toString(),
          });
        }}
      />
      <MintSponsoredCard
        defaultTarget={resolvedTarget}
        defaultSender={defaultMintSender as `0x${string}` | ""}
        simpleAccountFactory={storedState.simpleAccountFactory ?? ""}
        simpleAccountSalt={storedState.lastSalt ?? "0"}
        simpleAccountOwner={storedState.simpleAccountOwner ?? ""}
        entryPointHint={storedState.paymasterEntryPoint ?? ""}
      />
    </div>
  );
}
