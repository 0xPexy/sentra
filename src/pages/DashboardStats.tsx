import { useEffect, useMemo, useState } from "react";
import StatCard from "../components/cards/StatCard";
import PageHeader from "../components/layout/PageHeader";
import TxTable from "../components/tables/TxTable";
import {
  ApiError,
  api,
  type PaymasterOpItem,
  type StatsOverviewResponse,
} from "../lib/api";
import { useAuth } from "../state/auth";
import { isEthAddress } from "../lib/address";

type OverviewState = {
  overview: StatsOverviewResponse | null;
};

type OpsState = {
  items: PaymasterOpItem[];
  nextCursor?: string | null;
};

export default function DashboardStats() {
  const { token } = useAuth();
  const [paymasterAddress, setPaymasterAddress] = useState<
    `0x${string}` | null
  >(null);
  const [paymasterChainId, setPaymasterChainId] = useState<number | undefined>(
    undefined
  );
  const [{ overview }, setOverview] = useState<OverviewState>({
    overview: null,
  });
  const [opsState, setOpsState] = useState<OpsState>({ items: [] });

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const load = async () => {
      try {
        const paymaster = await api.getPaymaster(token);
        if (
          paymaster.address &&
          paymaster.address !== "0x0000000000000000000000000000000000000000" &&
          isEthAddress(paymaster.address)
        ) {
          setPaymasterAddress(paymaster.address as `0x${string}`);
          setPaymasterChainId(
            paymaster.chainId && Number.isFinite(paymaster.chainId)
              ? Number(paymaster.chainId)
              : undefined
          );
        } else {
          setPaymasterAddress(null);
          setPaymasterChainId(undefined);
        }
      } catch (error) {
        if (!cancelled) {
          if (!(error instanceof ApiError && error.status === 404)) {
            console.error(error);
          }
        }
      }

      try {
        const [overviewResp] = await Promise.all([api.getStatsOverview(token)]);
        if (!cancelled) {
          setOverview((prev) => ({
            ...prev,
            overview: overviewResp,
          }));
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setOverview((prev) => ({ ...prev, overview: null }));
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !paymasterAddress) {
      setOpsState({ items: [], nextCursor: undefined });
      return;
    }

    let cancelled = false;

    const loadOps = async () => {
      try {
        const response = await api.getPaymasterOps(token, paymasterAddress, {
          limit: 50,
          chainId: paymasterChainId,
        });
        if (!cancelled) {
          setOpsState({
            items: response.items,
            nextCursor: response.nextCursor,
          });
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError && error.status === 404) {
            setOpsState({ items: [], nextCursor: undefined });
          } else {
            console.error(error);
          }
        }
      }
    };

    void loadOps();

    return () => {
      cancelled = true;
    };
  }, [token, paymasterAddress, paymasterChainId]);

  const tableRows = useMemo(
    () =>
      opsState.items.map((item) => ({
        userOpHash: item.userOpHash,
        sender: item.sender,
        target: item.target,
        selector: item.selector,
        status: item.status,
        timestamp: item.blockTime ?? "",
      })),
    [opsState.items]
  );

  const sponsoredGasDisplay =
    overview?.totalSponsoredGasCost !== undefined
      ? Number(overview.totalSponsoredGasCost).toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })
      : "-";

  const sponsoredGasEthEquivalent =
    overview?.totalSponsoredGasCost !== undefined
      ? (() => {
          const gwei = Number(overview.totalSponsoredGasCost);
          if (Number.isNaN(gwei)) return undefined;
          const eth = gwei / 1_000_000_000;
          return `≈ ${eth.toLocaleString(undefined, {
            maximumFractionDigits: 6,
          })} ETH`;
        })()
      : undefined;

  const avgGasDisplay =
    overview?.avgActualGasUsed !== undefined
      ? Math.round(overview.avgActualGasUsed).toLocaleString()
      : "-";

  const successRateDisplay = (() => {
    if (overview?.successRate === undefined) return "-";
    const rate = overview.successRate;
    const normalized = rate <= 1 ? rate * 100 : rate;
    return `${normalized.toFixed(2)}%`;
  })();

  return (
    <div className="space-y-6">
      <PageHeader title="Stats" />

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Total Sponsored Gas (GWEI)"
          value={sponsoredGasDisplay}
          sublabel={sponsoredGasEthEquivalent}
        />
        <StatCard label="Average Gas Used" value={avgGasDisplay} />
        <StatCard
          label="Total Sponsored Ops"
          value={overview?.totalSponsoredOps?.toLocaleString() ?? "-"}
        />
        <StatCard label="Success Rate" value={successRateDisplay} />
      </div>

      <TxTable rows={tableRows} />
    </div>
  );
}
