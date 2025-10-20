import { useEffect, useState } from "react";
import StatCard from "../components/cards/StatCard";
import PageHeader from "../components/layout/PageHeader";
import TxTable from "../components/tables/TxTable";
import { ApiError, api } from "../lib/api";
import { useAuth } from "../state/auth";
import { fetchPaymasterDeposit, formatWeiToEth } from "../lib/viem";
import { isEthAddress } from "../lib/address";

export default function DashboardStats() {
  const { token } = useAuth();
  const [deposit, setDeposit] = useState<string>("-");
  const [ops, setOps] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        const paymaster = await api.getPaymaster(token);
        if (
          paymaster.address &&
          paymaster.address !== "0x0000000000000000000000000000000000000000" &&
          paymaster.entryPoint &&
          isEthAddress(paymaster.address) &&
          isEthAddress(paymaster.entryPoint)
        ) {
          const value = await fetchPaymasterDeposit(
            paymaster.entryPoint as `0x${string}`,
            paymaster.address as `0x${string}`,
          );
          const eth = Number.parseFloat(formatWeiToEth(value));
          setDeposit(Number.isNaN(eth) ? "-" : eth.toFixed(2));
        } else {
          setDeposit("-");
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          setDeposit("-");
        } else {
          console.error(error);
        }
      }
      try {
        const operations = await api.getStats(token);
        setOps(operations);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          setOps([]);
        } else {
          console.error(error);
        }
      }
    };
    load();
  }, [token]);

  return (
    <div className="space-y-6">
      <PageHeader title="Stats" />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Deposit (ETH)" value={deposit} />
        <StatCard label="Allowed Contracts" value={42} />
        <StatCard label="Success Rate" value={"98.4%"} />
      </div>

      <TxTable rows={ops} />
    </div>
  );
}
