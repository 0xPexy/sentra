import { useEffect, useState } from "react";
import { useAuth } from "../state/auth";
import { api } from "../lib/api";
import StatCard from "../components/cards/StatCard";
import TxTable from "../components/tables/TxTable";
import { getWalletClient } from "../lib/viem";

export default function DashboardStats() {
  const { token } = useAuth();
  const [deposit, setDeposit] = useState<string>("-");
  const [ops, setOps] = useState<any[]>([]);
  const PAYMASTER_ID = 1; // 데모용

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        const balance = await api.getDeposit(token, PAYMASTER_ID);
        setDeposit(balance.depositWei);
      } catch (error) {
        console.error(error);
      }
      try {
        const operations = await api.getStats(token, PAYMASTER_ID);
        setOps(operations);
      } catch (error) {
        console.error(error);
      }
    };
    load();
  }, [token]);

  const connectWallet = async () => {
    const wc = getWalletClient();
    // 메타마스크 연결 예시 (주소 요청)
    await wc.requestAddresses?.();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Stats</h2>
        <button
          onClick={connectWallet}
          className="px-3 py-2 bg-slate-800 rounded hover:bg-slate-700"
        >
          Connect Wallet
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Deposit (wei)" value={deposit} />
        <StatCard label="Allowed Contracts" value={42} />
        <StatCard label="Success Rate" value={"98.4%"} />
      </div>

      <TxTable rows={ops} />
    </div>
  );
}
