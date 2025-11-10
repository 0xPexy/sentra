import { useEffect, useState } from "react";
import { toSelector } from "../../lib/selectors";
import { ApiError, api } from "../../lib/api";
import { getPublicClient, getWalletClient } from "../../lib/viem";
import { useAuth } from "../../state/auth";
import type { DeployResult, StoredState } from "./types";

type Props = {
  onDeployed: (result: DeployResult) => void;
  storedState: StoredState;
  updateStoredState: (patch: Partial<StoredState>) => void;
};

type ContractArtifact = {
  abi: any;
  bytecode: `0x${string}`;
};

const ARTIFACT_NAME = "ERC721Mintable";

export function DeployERC721Card({
  onDeployed,
  storedState,
  updateStoredState,
}: Props) {
  const { token } = useAuth();
  const [artifact, setArtifact] = useState<ContractArtifact | null>(null);
  const [artifactError, setArtifactError] = useState<string | null>(null);

  const [name, setName] = useState(storedState.name ?? "Sentra NFT");
  const [symbol, setSymbol] = useState(storedState.symbol ?? "SNFT");
  const [defaultAdmin, setDefaultAdmin] = useState<`0x${string}` | "">(
    storedState.defaultAdmin ?? ""
  );
  const [minter, setMinter] = useState<`0x${string}` | "">(
    storedState.minter ?? ""
  );

  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [successInfo, setSuccessInfo] = useState<DeployResult | null>(
    storedState.lastDeploy ?? null
  );

  useEffect(() => {
    if (storedState.minter) {
      setMinter(storedState.minter);
    }
  }, [storedState.minter]);

  useEffect(() => {
    setSuccessInfo(storedState.lastDeploy ?? null);
    if (storedState.lastDeploy) {
      setStatus(
        `contract: ${storedState.lastDeploy.address}` +
          (storedState.lastDeploy.minter
            ? `\nallowlisted minter: ${storedState.lastDeploy.minter}`
            : "")
      );
    }
  }, [storedState.lastDeploy]);

  useEffect(() => {
    if (!token) {
      setArtifact(null);
      setArtifactError(null);
      return;
    }

    let cancelled = false;
    const loadArtifact = async () => {
      try {
        const data = await api.getContractArtifact(token, ARTIFACT_NAME);
        if (!data?.abi || !data?.abi?.bytecode?.object)
          throw new Error("Invalid artifact payload");
        if (cancelled) return;

        setArtifact({
          abi: data.abi,
          bytecode: data.abi.bytecode.object as `0x${string}`,
        });
        setArtifactError(null);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          setArtifact(null);
          setArtifactError("ERC721Mintable artifact not found");
        } else {
          setArtifactError((error as Error)?.message ?? String(error));
        }
      }
    };
    loadArtifact();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const wallet = await getWalletClient();
        const addresses = await wallet.getAddresses();
        if (addresses?.[0]) {
          const adminAddress = addresses[0] as `0x${string}`;
          setDefaultAdmin((prev) => {
            if (prev) return prev;
            updateStoredState({ defaultAdmin: adminAddress });
            return adminAddress;
          });
          setMinter((prev) => {
            if (prev) return prev;
            updateStoredState({ minter: adminAddress });
            return adminAddress;
          });
        }
      } catch {
        // wallet not available; ignore
      }
    })();
  }, [updateStoredState]);

  const deploy = async () => {
    setLoading(true);
    setStatus("");
    setSuccessInfo(null);

    if (!token) {
      window.alert("Sign in to deploy contracts.");
      setLoading(false);
      return;
    }

    if (!defaultAdmin || !minter) {
      window.alert("Please provide default admin and minter addresses.");
      setLoading(false);
      return;
    }

    let localArtifact =
      artifact && "bytecode" in artifact && artifact.bytecode ? artifact : null;
    try {
      const data = await api.getContractArtifact(token, ARTIFACT_NAME);
      const rawAbi = data.abi.abi ?? data.abi;
      const bytecodeObj = data.abi.bytecode?.object;
      if (!rawAbi || !bytecodeObj) throw new Error("Invalid artifact payload");
      localArtifact = {
        abi: rawAbi,
        bytecode: bytecodeObj as `0x${string}`,
      };

      if (
        !localArtifact.abi ||
        typeof (localArtifact.abi as any).find !== "function"
      ) {
        throw new Error("Invalid artifact ABI format");
      }
      setArtifact(localArtifact);
      setArtifactError(null);
    } catch (error: any) {
      setArtifact(null);
      setArtifactError(error?.message ?? String(error));
      window.alert("Failed to fetch contract artifact.");
      setLoading(false);
      return;
    }

    try {
      const wallet = await getWalletClient();
      const [account] = await wallet.getAddresses();
      if (!account) throw new Error("Connect wallet before deploying.");
      const adminAddress = defaultAdmin as `0x${string}`;
      const minterAddress = minter as `0x${string}`;

      const txHash = await wallet.deployContract({
        account,
        chain: null,
        abi: localArtifact!.abi,
        bytecode: localArtifact!.bytecode,
        args: [adminAddress, minterAddress, name, symbol],
      });
      setStatus(`tx submitted: ${txHash}`);

      const receipt = await getPublicClient().waitForTransactionReceipt({
        hash: txHash,
      });
      if (!receipt.contractAddress)
        throw new Error("Unable to read deployed contract address.");

      await allowlistNewContract({
        token,
        contractAddress: receipt.contractAddress,
        contractName: name,
        minter: minterAddress,
      });

      const note = [`contract: ${receipt.contractAddress}`]
        .filter(Boolean)
        .join("\n");
      setStatus((prev) => `${prev}\n${note}`);
      const deployInfo = {
        address: receipt.contractAddress,
        minter: minterAddress,
      };
      setSuccessInfo(deployInfo);

      updateStoredState({
        name,
        symbol,
        defaultAdmin,
        minter: deployInfo.minter,
        lastDeploy: deployInfo,
      });
      onDeployed(deployInfo);
    } catch (error: any) {
      setStatus(`failed: ${error?.message ?? String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-[#151A28] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Deploy ERC721Mintable</h3>
        <div className="text-xs text-slate-400">
          {artifactError
            ? `Artifact unavailable: ${artifactError}`
            : artifact
            ? "Artifact loaded"
            : "Artifact not loaded"}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-sm text-slate-400">Name</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
            value={name}
            onChange={(event) => {
              const value = event.target.value;
              setName(value);
              updateStoredState({ name: value });
            }}
          />
        </div>
        <div>
          <div className="mb-1 text-sm text-slate-400">Symbol</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
            value={symbol}
            onChange={(event) => {
              const value = event.target.value;
              setSymbol(value);
              updateStoredState({ symbol: value });
            }}
          />
        </div>
        <div>
          <div className="mb-1 text-sm text-slate-400">Default Admin</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
            placeholder="0xAdmin..."
            value={defaultAdmin}
            onChange={(event) => {
              const value = event.target.value as `0x${string}` | "";
              setDefaultAdmin(value);
              updateStoredState({ defaultAdmin: value });
            }}
          />
        </div>
        <div>
          <div className="mb-1 text-sm text-slate-400">
            Allowed Minter (Sender)
          </div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
            placeholder="0xMinter..."
            value={minter}
            onChange={(event) => {
              const value = event.target.value as `0x${string}` | "";
              setMinter(value);
              updateStoredState({ minter: value });
            }}
          />
        </div>
      </div>

      <button
        onClick={deploy}
        disabled={loading || !artifact}
        className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Deploying…" : "Deploy"}
      </button>

      {successInfo && (
        <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <div>Contract: {successInfo.address}</div>
          {successInfo.minter && (
            <div>Minter allowlisted: {successInfo.minter}</div>
          )}
        </div>
      )}

      {status && (
        <pre className="whitespace-pre-wrap rounded border border-slate-800 bg-[#0f1422] p-3 text-xs text-slate-200">
          {status}
        </pre>
      )}
    </section>
  );
}

type AllowlistArgs = {
  token: string | null;
  contractAddress: `0x${string}`;
  contractName: string;
  minter: `0x${string}`;
};

async function allowlistNewContract({
  token,
  contractAddress,
  contractName,
  minter,
}: AllowlistArgs) {
  if (!token) {
    throw new Error(
      "Missing admin authorization token. Please sign in again."
    );
  }

  try {
    await api.addContract(token, {
      address: contractAddress,
      name: contractName,
      functions: [
        {
          selector: toSelector("safeMint(address,string)"),
          signature: "safeMint(address,string)",
        },
      ],
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw new Error(
        `Failed to whitelist contract: ${error.message || error.status}`
      );
    }
    throw error;
  }

  try {
    await api.addUser(token, minter);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 409) return;
      throw new Error(
        `Failed to whitelist minter: ${error.message || error.status}`
      );
    }
    throw error;
  }
}
