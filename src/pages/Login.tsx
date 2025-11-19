import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, API_BASE } from "../lib/api";
import { useAuth } from "../state/auth";
import { getWalletClient, tenderlyTestNet } from "../lib/viem";

function truncate(address?: `0x${string}` | null) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function Login() {
  const nav = useNavigate();
  const { token, setToken } = useAuth();
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "signing">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      nav("/app", { replace: true });
    }
  }, [token, nav]);

  const connectWallet = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    try {
      const wallet = await getWalletClient();
      const addresses = await wallet.getAddresses();
      const primary = addresses[0];
      if (!primary) {
        throw new Error("Wallet returned no address.");
      }
      setAddress(primary);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Failed to connect wallet."
      );
    } finally {
      setStatus("idle");
    }
  }, []);

  const authUrl = useMemo(() => {
    try {
      return new URL(API_BASE);
    } catch {
      return new URL(window.location.origin);
    }
  }, []);

  const buildSiweMessage = useCallback(
    (owner: `0x${string}`, nonce: string) => {
      const domain = authUrl.host;
      const origin = authUrl.origin;
      const issuedAt = new Date().toISOString();
      return `${domain} wants you to sign in with your Ethereum account:
${owner}

Sign in to Sentinel 4337

URI: ${origin}
Version: 1
Chain ID: ${tenderlyTestNet.id}
Nonce: ${nonce}
      Issued At: ${issuedAt}`;
    },
    [authUrl]
  );

  const handleSignIn = useCallback(async () => {
    setError(null);
    setStatus("signing");
    try {
      const wallet = await getWalletClient();
      const addresses = await wallet.getAddresses();
      const primary = addresses[0];
      if (!primary) {
        throw new Error("Wallet returned no address.");
      }

      setAddress(primary);

      const { nonce } = await api.getAuthNonce();
      const message = buildSiweMessage(primary, nonce);
      const signature = await wallet.signMessage({
        account: primary,
        message,
      });
      const { token: jwt } = await api.loginWithSiwe({ message, signature });
      setToken(jwt);
      nav("/app", { replace: true });
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to complete SIWE login.");
      }
    } finally {
      setStatus("idle");
    }
  }, [buildSiweMessage, nav, setToken]);

  const buttonLabel = useMemo(() => {
    if (status === "connecting") return "Connecting…";
    if (status === "signing") return "Signing…";
    return "Sign & continue";
  }, [status]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050910] p-6">
      <div className="surface-card w-full max-w-md space-y-6 rounded-3xl border border-white/5 bg-[#0c1322] p-8 shadow-2xl">
        <div className="space-y-2 text-center">
          <p className="text-sm uppercase tracking-[0.4em] text-emerald-300">
            SENTRA
          </p>
          <h1 className="text-2xl font-semibold text-white">
            Sign in with Ethereum
          </h1>
          <p className="text-sm text-slate-400">
            Connect your wallet, sign the SIWE prompt, and unlock the rest of
            the console.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Connected wallet
          </div>
          <div className="mt-2 font-mono text-base text-white">
            {address ? truncate(address) : "Not connected"}
          </div>
        </div>
        {error && (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
        <div className="space-y-3">
          <button
            onClick={connectWallet}
            className="btn-secondary w-full"
            disabled={status !== "idle"}
          >
            {status === "connecting" ? "Connecting…" : "Connect wallet"}
          </button>
          <button
            onClick={handleSignIn}
            className="btn-primary w-full"
            disabled={status !== "idle"}
          >
            {buttonLabel}
          </button>
        </div>
        <p className="text-center text-xs text-slate-500">
          Signing never spends gas. It simply proves wallet ownership so we can
          assign roles.
        </p>
      </div>
    </div>
  );
}
