import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatWeiToEth,
  getPublicClient,
  getWalletClient,
} from "../../lib/viem";
import { useAuth } from "../../state/auth";

type PageHeaderProps = {
  title: string;
};

export default function PageHeader({ title }: PageHeaderProps) {
  const { logout, role, address } = useAuth();
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const isAdmin = role === "admin";

  const refreshBalance = useCallback(async (address: `0x${string}`) => {
    try {
      const value = await getPublicClient().getBalance({ address });
      const asNumber = Number.parseFloat(formatWeiToEth(value));
      setBalance(Number.isNaN(asNumber) ? null : asNumber.toFixed(2));
    } catch (error) {
      console.error(error);
      setBalance(null);
    }
  }, []);

  const hydrateWallet = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) {
      setAccount(null);
      setBalance(null);
      return;
    }
    try {
      const wallet = await getWalletClient();
      const addresses = await wallet.getAddresses();
      const primary = addresses[0];
      if (primary) {
        setAccount(primary);
        await refreshBalance(primary);
      } else {
        setAccount(null);
        setBalance(null);
      }
    } catch (error) {
      console.error(error);
      setAccount(null);
      setBalance(null);
    }
  }, [refreshBalance]);

  useEffect(() => {
    hydrateWallet();
  }, [hydrateWallet]);

  useEffect(() => {
    const handler = () => void hydrateWallet();
    window.addEventListener("sentra:wallet-refresh", handler);
    return () => window.removeEventListener("sentra:wallet-refresh", handler);
  }, [hydrateWallet]);

  useEffect(() => {
    const eth = (window as any).ethereum;
    if (!eth || !eth.on) return;
    const handler = (accounts: string[]) => {
      const next = accounts[0] as `0x${string}` | undefined;
      if (next) {
        setAccount(next);
        refreshBalance(next);
      } else {
        setAccount(null);
        setBalance(null);
      }
    };
    eth.on("accountsChanged", handler);
    return () => {
      if (eth.removeListener) {
        eth.removeListener("accountsChanged", handler);
      }
    };
  }, [refreshBalance]);

  const connectWallet = useCallback(async () => {
    try {
      const wallet = await getWalletClient();
      if (wallet.requestAddresses) {
        await wallet.requestAddresses();
      } else {
        await wallet.getAddresses();
      }
      await hydrateWallet();
    } catch (error) {
      console.error(error);
      window.alert(
        "Failed to connect wallet. Check if a web3 wallet is available."
      );
    }
  }, [hydrateWallet]);

  const disconnectWallet = useCallback(async () => {
    logout();
    const eth = (window as any).ethereum;
    if (eth?.request) {
      try {
        await eth.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch (error) {
        console.warn("Failed to revoke wallet permissions", error);
      }
    }
    setAccount(null);
    setBalance(null);
  }, [logout]);

  const truncatedAccount = useMemo(() => {
    if (!account) return "";
    return `${account.slice(0, 8)}…${account.slice(-6)}`;
  }, [account]);
  const adminAddressDisplay = useMemo(() => {
    if (!isAdmin || !address) return null;
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }, [isAdmin, address]);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-lg font-semibold uppercase tracking-[0.35em] text-slate-400 sm:text-xl">
        {title}
      </h2>
      <div className="flex items-center gap-3">
        {isAdmin ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            Admin
          </div>
        ) : null}
        {account ? (
          <div className="surface-card surface-card--muted flex items-center gap-3 rounded-full px-4 py-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="font-mono text-slate-100">{truncatedAccount}</span>
            <span className="text-xs text-slate-400">{balance ?? "--"} ETH</span>
          </div>
        ) : (
          <button onClick={connectWallet} className="btn-secondary">
            Connect Wallet
          </button>
        )}
        <button onClick={disconnectWallet} className="btn-ghost">
          Disconnect wallet
        </button>
      </div>
    </div>
  );
}
