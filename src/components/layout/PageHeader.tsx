import { useCallback, useEffect, useMemo, useState } from "react";
import { formatWeiToEth, getPublicClient, getWalletClient } from "../../lib/viem";
import { useAuth } from "../../state/auth";

type PageHeaderProps = {
  title: string;
};

export default function PageHeader({ title }: PageHeaderProps) {
  const { logout } = useAuth();
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

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
      window.alert("Failed to connect wallet. Check if a web3 wallet is available.");
    }
  }, [hydrateWallet]);

  const truncatedAccount = useMemo(() => {
    if (!account) return "";
    return `${account.slice(0, 8)}…${account.slice(-6)}`;
  }, [account]);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="flex items-center gap-2">
        {account ? (
          <div className="flex items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm">
            <span aria-hidden className="text-lg">👛</span>
            <span className="font-mono text-sm text-slate-200">{truncatedAccount}</span>
            <span className="text-xs text-slate-400">{balance ?? "--"} ETH</span>
          </div>
        ) : (
          <button
            onClick={connectWallet}
            className="rounded bg-slate-800 px-3 py-2 text-sm font-medium hover:bg-slate-700"
          >
            Connect Wallet
          </button>
        )}
        <button
          onClick={logout}
          className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
