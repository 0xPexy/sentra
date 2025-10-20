import { useCallback, useEffect, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import { toSelector } from "../lib/selectors";
import { getBundlerClient, getPublicClient, getWalletClient } from "../lib/viem";
import { ApiError, api, type PaymasterResponse } from "../lib/api";
import { useAuth } from "../state/auth";
import { isEthAddress } from "../lib/address";

type ContractArtifact = {
  abi: any;
  bytecode: `0x${string}`;
};

type DeployResult = {
  address: `0x${string}`;
  minter: `0x${string}` | "";
};

type StoredState = {
  name?: string;
  symbol?: string;
  defaultAdmin?: `0x${string}` | "";
  minter?: `0x${string}` | "";
  lastDeploy?: DeployResult | null;
};

const PLAYGROUND_STORAGE_KEY = "sentra.playground.state";

function loadStoredState(): StoredState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PLAYGROUND_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as StoredState;
    }
  } catch (error) {
    console.warn("Failed to parse playground storage", error);
  }
  return {};
}

function persistStoredState(state: StoredState) {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(state).length === 0) {
      window.localStorage.removeItem(PLAYGROUND_STORAGE_KEY);
    } else {
      const cleaned = Object.fromEntries(
        Object.entries(state).filter(([, value]) => value !== undefined)
      );
      window.localStorage.setItem(
        PLAYGROUND_STORAGE_KEY,
        JSON.stringify(cleaned)
      );
    }
  } catch (error) {
    console.warn("Failed to persist playground storage", error);
  }
}

function mergeStoredState(
  prev: StoredState,
  patch: Partial<StoredState>
): StoredState {
  const next: StoredState = { ...prev };
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined) {
      delete (next as Record<string, unknown>)[key];
    } else {
      (next as Record<string, unknown>)[key] = value;
    }
  });
  return next;
}

const ARTIFACT_NAME = "MintableNFT";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export default function Playground() {
  const [storedState, setStoredState] = useState<StoredState>(() =>
    loadStoredState()
  );
  const [lastDeploy, setLastDeploy] = useState<DeployResult | null>(
    storedState.lastDeploy ?? null
  );

  const updateStoredState = useCallback((patch: Partial<StoredState>) => {
    setStoredState((prev) => {
      const next = mergeStoredState(prev, patch);
      persistStoredState(next);
      return next;
    });
  }, []);

  useEffect(() => {
    setLastDeploy((prev) => {
      const next = storedState.lastDeploy ?? null;
      if (prev?.address === next?.address && prev?.minter === next?.minter) {
        return prev;
      }
      return next;
    });
  }, [storedState.lastDeploy]);

  return (
    <div className="space-y-8">
      <PageHeader title="Playground" />
      <DeployERC721Card
        onDeployed={(result) => {
          setLastDeploy(result);
          updateStoredState({ lastDeploy: result });
        }}
        storedState={storedState}
        updateStoredState={updateStoredState}
      />
      <MintSponsoredCard defaultTarget={lastDeploy?.address ?? ""} />
    </div>
  );
}

type DeployCardProps = {
  onDeployed: (result: DeployResult) => void;
  storedState: StoredState;
  updateStoredState: (patch: Partial<StoredState>) => void;
};

function DeployERC721Card({
  onDeployed,
  storedState,
  updateStoredState,
}: DeployCardProps) {
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
        if (!data?.abi || !data?.bytecode)
          throw new Error("invalid artifact response");
        if (cancelled) return;
        setArtifact({
          abi: data.abi,
          bytecode: data.bytecode as `0x${string}`,
        });
        setArtifactError(null);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          setArtifact(null);
          setArtifactError("MintableNFT artifact not found");
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
        const wallet = getWalletClient();
        const addresses = await wallet.getAddresses();
        if (addresses?.[0]) {
          const adminAddress = addresses[0] as `0x${string}`;
          setDefaultAdmin((prev) => {
            if (prev) return prev;
            updateStoredState({ defaultAdmin: adminAddress });
            return adminAddress;
          });
          if (!minter) {
            setMinter(adminAddress);
            updateStoredState({ minter: adminAddress });
          }
        }
      } catch {
        // ignore wallet absence
      }
    })();
  }, [minter, updateStoredState]);

  const deploy = async () => {
    if (!artifact) {
      window.alert("컨트랙트 아티팩트를 불러오지 못했습니다.");
      return;
    }
    if (!defaultAdmin || !minter) {
      window.alert("Default admin과 minter 주소를 입력하세요.");
      return;
    }

    setLoading(true);
    setStatus("");
    setSuccessInfo(null);

    try {
      const wallet = getWalletClient();
      const [account] = await wallet.getAddresses();
      if (!account) throw new Error("지갑을 먼저 연결하세요");
      const adminAddress = defaultAdmin as `0x${string}`;
      const minterAddress = minter as `0x${string}`;

      const txHash = await wallet.deployContract({
        account,
        chain: null,
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        args: [adminAddress, minterAddress, name, symbol],
      });
      setStatus(`tx submitted: ${txHash}`);

      const receipt = await getPublicClient().waitForTransactionReceipt({
        hash: txHash,
      });
      if (!receipt.contractAddress)
        throw new Error("배포된 컨트랙트 주소를 찾을 수 없습니다");

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
      onDeployed(deployInfo);
    } catch (error: any) {
      setStatus(`error: ${error?.message ?? String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    updateStoredState({});
    setName("Sentra NFT");
    setSymbol("SNFT");
    setDefaultAdmin("");
    setMinter("");
    setSuccessInfo(null);
    onDeployed({ address: "" as `0x${string}`, minter: "" });
    setStatus("로컬 저장 내용을 초기화했습니다. 새로 배포해 주세요.");
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-[#151A28] p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Deploy MintableNFT</h3>
        {artifactError && (
          <span className="text-xs text-red-300">{artifactError}</span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-sm text-slate-400">Name</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
            value={name}
            onChange={(event) => {
              const next = event.target.value;
              setName(next);
              updateStoredState({ name: next });
            }}
          />
        </div>
        <div>
          <div className="mb-1 text-sm text-slate-400">Symbol</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
            value={symbol}
            onChange={(event) => {
              const next = event.target.value;
              setSymbol(next);
              updateStoredState({ symbol: next });
            }}
          />
        </div>
        <div>
          <div className="mb-1 text-sm text-slate-400">Default Admin</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
            value={defaultAdmin}
            placeholder="0xAdmin..."
            onChange={(event) => {
              const next = event.target.value as `0x${string}` | "";
              setDefaultAdmin(next);
              updateStoredState({ defaultAdmin: next });
            }}
          />
        </div>
        <div>
          <div className="mb-1 text-sm text-slate-400">Minter</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
            value={minter}
            placeholder="0xMinter..."
            onChange={(event) => {
              const next = event.target.value as `0x${string}` | "";
              setMinter(next);
              updateStoredState({ minter: next });
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={deploy}
          disabled={loading || !artifact}
          className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-60"
        >
          {loading ? "Deploying..." : "Deploy"}
        </button>
        <button
          onClick={handleRefresh}
          type="button"
          className="rounded border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
        >
          Refresh
        </button>
        {successInfo && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="flex items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 font-mono text-emerald-200">
              ✅ [{successInfo.address}]
            </span>
            {successInfo.minter && (
              <span className="flex items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                ✅ [minter address {successInfo.minter} allowed!]
              </span>
            )}
          </div>
        )}
      </div>

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
      "관리자 인증 토큰을 찾을 수 없습니다. 다시 로그인해 주세요."
    );
  }

  try {
    await api.addContract(token, {
      address: contractAddress,
      name: contractName,
      functions: [
        {
          selector: toSelector("safeMint(address,uint256)"),
          signature: "safeMint(address,uint256)",
        },
      ],
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw new Error(
        `컨트랙트 화이트리스트 등록 실패: ${error.message || error.status}`
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
        `민터 화이트리스트 등록 실패: ${error.message || error.status}`
      );
    }
    throw error;
  }
}

type MintCardProps = {
  defaultTarget: `0x${string}` | "";
};

function MintSponsoredCard({ defaultTarget }: MintCardProps) {
  const { token } = useAuth();
  const [paymasterInfo, setPaymasterInfo] = useState<PaymasterResponse | null>(
    null
  );
  const [target, setTarget] = useState<`0x${string}` | "">(defaultTarget);
  const [recipient, setRecipient] = useState<`0x${string}` | "">("");
  const [senderAddress, setSenderAddress] = useState<`0x${string}` | "">("");
  const [tokenId, setTokenId] = useState<string>("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (defaultTarget) {
      setTarget(defaultTarget);
    }
  }, [defaultTarget]);

  useEffect(() => {
    if (!token) {
      setPaymasterInfo(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const info = await api.getPaymaster(token);
        if (!active) return;
        setPaymasterInfo(info);
      } catch (error) {
        if (!active) return;
        console.error(error);
        setStatus((prev) =>
          prev
            ? `${prev}\nfailed: paymaster 정보를 불러오지 못했습니다.`
            : "failed: paymaster 정보를 불러오지 못했습니다."
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const wallet = getWalletClient();
        const addrs = await wallet.getAddresses();
        if (addrs?.[0]) {
          const addr = addrs[0] as `0x${string}`;
          setSenderAddress(addr);
          setRecipient((prev) => prev || addr);
        }
      } catch {
        // ignore wallet absence
      }
    })();
  }, []);

  const simulateAndSend = async () => {
    if (!isEthAddress(target)) {
      setStatus("failed: 배포된 컨트랙트 주소를 확인하세요.");
      return;
    }
    if (!isEthAddress(recipient)) {
      setStatus("failed: 수신자 주소를 입력하세요.");
      return;
    }
    if (!tokenId.trim()) {
      setStatus("failed: tokenId를 입력하세요.");
      return;
    }
    let tokenIdValue: bigint;
    try {
      tokenIdValue = BigInt(tokenId);
    } catch {
      setStatus("failed: tokenId는 정수여야 합니다.");
      return;
    }
    if (!paymasterInfo || !paymasterInfo.entryPoint) {
      setStatus("failed: paymaster 정보를 먼저 등록하세요.");
      return;
    }
    const entryPoint = paymasterInfo.entryPoint as `0x${string}`;
    const chainId = Number(paymasterInfo.chainId ?? 0);
    if (!Number.isFinite(chainId) || chainId <= 0) {
      setStatus("failed: 유효한 체인 ID를 찾을 수 없습니다.");
      return;
    }

    setStatus("requesting paymaster…");
    try {
      const selector = toSelector("safeMint(address,uint256)");
      const fn = "safeMint";
      const args: [string, string] = [recipient, tokenIdValue.toString()];
      const sender = (senderAddress ||
        recipient ||
        ZERO_ADDRESS) as `0x${string}`;

      await api.getPaymasterStub({
        chainId,
        entryPoint,
        userOperation: {
          sender,
          nonce: 0n,
          maxFeePerGas: 0n,
          maxPriorityFeePerGas: 0n,
        },
        context: {
          target,
          selector,
          args,
        },
      });

      const paymasterData = await api.getPaymasterData({
        chainId,
        entryPoint,
        userOperation: {
          sender,
          nonce: 0n,
          maxFeePerGas: 0n,
          maxPriorityFeePerGas: 0n,
        },
        context: {
          target,
          selector,
          args,
        },
      });

      const bundler = getBundlerClient(chainId);
      const userOp = {
        sender,
        callData: "0x",
        target,
        functionName: fn,
        args,
        paymaster: paymasterData,
      } as any;
      const txHash = await bundler.sendUserOperation(userOp);
      const userOpHash = txHash;

      setStatus(
        `submitted ✅\nuserOpHash: ${userOpHash}\ntx: ${txHash ?? "-"}`
      );
    } catch (error: any) {
      setStatus(`failed: ${error?.message ?? String(error)}`);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-[#151A28] p-4">
      <h3 className="font-semibold">Mint (sponsored)</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="mb-1 text-sm text-slate-400">Target (ERC-721)</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
            placeholder="0x..."
            value={target}
            onChange={(event) => setTarget(event.target.value as any)}
          />
        </div>
        <div className="md:col-span-3">
          <div className="mb-1 text-sm text-slate-400">Recipient</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
            placeholder="0xRecipient..."
            value={recipient}
            onChange={(event) => setRecipient(event.target.value as any)}
          />
        </div>
        <div className="md:col-span-3">
          <div className="mb-1 text-sm text-slate-400">Token ID</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
            placeholder="uint256 tokenId"
            value={tokenId}
            onChange={(event) => setTokenId(event.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={simulateAndSend}
          className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500"
        >
          Simulate &amp; Send
        </button>
      </div>

      {status && (
        <pre className="whitespace-pre-wrap rounded border border-slate-800 bg-[#0f1422] p-3 text-xs text-slate-200">
          {status}
        </pre>
      )}
    </section>
  );
}
