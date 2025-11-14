import type { ChangeEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData } from "viem";
import type {
  SmartAccount,
  UserOperation,
  UserOperationRequest,
} from "viem/account-abstraction";
import { useAuth } from "../../state/auth";
import { api, type PaymasterResponse } from "../../lib/api";
import { isEthAddress } from "../../lib/address";
import { toSelector } from "../../lib/selectors";
import {
  getBundlerClientBySimpleAccount,
  getPaymasterClient,
  getPublicClient,
  getSimpleSmartAccount,
  getWalletClient,
} from "../../lib/viem";
import { SAFE_MINT_ABI } from "../../lib/userOpLegacy";
import { useNftTotalSupply } from "../../hooks/useNftTotalSupply";

type GasEstimates = {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
};

type Props = {
  defaultTarget: `0x${string}` | "";
  defaultSender?: `0x${string}` | "";
  simpleAccountFactory?: `0x${string}` | "";
  simpleAccountSalt?: string;
  simpleAccountOwner?: `0x${string}` | "";
  entryPointHint?: `0x${string}` | "";
};

const GWEI = 1_000_000_000n;
const DEFAULT_MAX_PRIORITY_FEE = 1n * GWEI;
const DEFAULT_MAX_FEE = 30n * GWEI;
const DEFAULT_CALL_GAS_LIMIT = 1_000_000n;
const DEFAULT_PRE_VERIFICATION_GAS = 1_000_000n;
const DEFAULT_VERIFICATION_GAS_LIMIT = 500_000n;
const SAFE_MINT_SELECTOR = toSelector("safeMint(address,string)");
const NFT_METADATA_URI =
  import.meta.env.VITE_SENTRA_NFT_URI ??
  "http://localhost:8080/api/v1/playground/nft";
type PreparedUserOperation = Omit<UserOperation<"0.8">, "signature">;
type PreparedContext = {
  entryPoint: `0x${string}`;
  chainId: number;
  target: `0x${string}`;
};

export function MintSponsoredCard({
  defaultTarget,
  defaultSender = "",
  simpleAccountFactory,
  simpleAccountSalt = "0",
  simpleAccountOwner,
  entryPointHint,
}: Props) {
  const { token } = useAuth();
  const [paymasterInfo, setPaymasterInfo] = useState<PaymasterResponse | null>(
    null
  );
  const [target, setTarget] = useState<`0x${string}` | "">(defaultTarget);
  const [senderAddress, setSenderAddress] = useState<`0x${string}` | "">(
    defaultSender
  );
  const [status, setStatus] = useState("");
  const [gasEstimates, setGasEstimates] = useState<GasEstimates | null>(null);
  const [gasScaling, setGasScaling] = useState({
    call: 100,
    verification: 100,
    preVerification: 100,
  });
  const [preparedAccount, setPreparedAccount] = useState<SmartAccount | null>(
    null
  );
  const [preparedUnsignedOp, setPreparedUnsignedOp] =
    useState<PreparedUserOperation | null>(null);
  const [preparedContext, setPreparedContext] = useState<PreparedContext | null>(
    null
  );
  const { supply, refresh: refreshSupply } = useNftTotalSupply(target);
  const calculatedRecipient = senderAddress;
  const [nftPreview, setNftPreview] = useState<{
    image?: string;
    name?: string;
    description?: string;
  } | null>(null);

  const invalidatePrepared = useCallback(() => {
    setPreparedAccount(null);
    setPreparedUnsignedOp(null);
    setPreparedContext(null);
    setGasEstimates(null);
    setGasScaling({
      call: 100,
      verification: 100,
      preVerification: 100,
    });
  }, []);

  const derivedFactory =
    simpleAccountFactory && isEthAddress(simpleAccountFactory)
      ? (simpleAccountFactory as `0x${string}`)
      : undefined;
  const derivedOwner =
    simpleAccountOwner && isEthAddress(simpleAccountOwner)
      ? (simpleAccountOwner as `0x${string}`)
      : undefined;
  const derivedSalt = simpleAccountSalt ?? "0";
  const derivedSaltBigInt = (() => {
    try {
      return BigInt(derivedSalt || "0");
    } catch {
      return null;
    }
  })();
  const derivedEntryPointHint =
    entryPointHint && isEthAddress(entryPointHint)
      ? (entryPointHint as `0x${string}`)
      : undefined;

  useEffect(() => {
    if (defaultTarget) {
      setTarget(defaultTarget);
      invalidatePrepared();
    }
  }, [defaultTarget, invalidatePrepared]);

  useEffect(() => {
    if (defaultSender) {
      setSenderAddress(defaultSender);
    }
  }, [defaultSender]);

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
            ? `${prev}\nfailed: unable to load paymaster info.`
            : "failed: unable to load paymaster info."
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
        const wallet = await getWalletClient();
        const addrs = await wallet.getAddresses();
        if (addrs?.[0]) {
          const addr = addrs[0] as `0x${string}`;
          setSenderAddress((prev) => prev || addr);
        }
      } catch {
        // wallet not available; ignore
      }
    })();
  }, []);

  useEffect(() => {
    invalidatePrepared();
  }, [senderAddress, invalidatePrepared]);

  useEffect(() => {
    let active = true;
    fetch(NFT_METADATA_URI)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to fetch NFT metadata.");
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        setNftPreview(data);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Failed to load NFT preview", error);
        setNftPreview(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const prepareUserOperation = async () => {
    invalidatePrepared();
    if (!isEthAddress(target)) {
      setStatus("failed: target contract address is invalid.");
      return;
    }
    const recipientAddress = calculatedRecipient;
    if (!isEthAddress(recipientAddress)) {
      setStatus(
        "failed: Calculated smart account address is required. Run Calculate Simple Account first."
      );
      return;
    }
    if (
      !paymasterInfo ||
      (!paymasterInfo.entryPoint && !derivedEntryPointHint)
    ) {
      setStatus("failed: configure the paymaster before sending.");
      return;
    }
    if (!isEthAddress(senderAddress)) {
      setStatus("failed: sender (minter) address is invalid.");
      return;
    }
    const sender = senderAddress as `0x${string}`;

    if (!derivedFactory || !derivedOwner) {
      setStatus("failed: calculate the SimpleAccount first.");
      return;
    }
    if (derivedSaltBigInt === null) {
      setStatus("failed: SimpleAccount salt is invalid.");
      return;
    }

    const entryPoint =
      (paymasterInfo?.entryPoint as `0x${string}` | undefined) ??
      derivedEntryPointHint;
    const chainId = paymasterInfo?.chainId ?? 0;
    if (!entryPoint) {
      setStatus("failed: entry point address is missing.");
      return;
    }
    if (!Number.isFinite(chainId) || chainId <= 0) {
      setStatus("failed: chain id is invalid.");
      return;
    }

    setStatus("Preparing user operation…");
    try {
      setStatus((prev) => `${prev}\n1. Encoding safeMint calldata…`);
      const safeMintData = encodeFunctionData({
        abi: SAFE_MINT_ABI,
        functionName: "safeMint",
        args: [
          recipientAddress as `0x${string}`,
          NFT_METADATA_URI,
        ],
      });

      setStatus((prev) => `${prev}\n2. Preparing UserOperation…`);
      const publicClient = getPublicClient();
      const walletClient = await getWalletClient();
      const account = await getSimpleSmartAccount(
        sender,
        publicClient,
        walletClient,
        derivedFactory,
        derivedSaltBigInt
      );
      const bundler = getBundlerClientBySimpleAccount(account);

      setStatus((prev) => `${prev}\n3. Requesting bundler prepareUserOperation…`);
      const preparedOp = await bundler.prepareUserOperation({
        calls: [
          {
            to: target as `0x${string}`,
            data: safeMintData,
          },
        ],
        callGasLimit: DEFAULT_CALL_GAS_LIMIT,
        verificationGasLimit: DEFAULT_VERIFICATION_GAS_LIMIT,
        preVerificationGas: DEFAULT_PRE_VERIFICATION_GAS,
        maxFeePerGas: DEFAULT_MAX_FEE,
        maxPriorityFeePerGas: DEFAULT_MAX_PRIORITY_FEE,
      });
      const normalizedPreparedOp = preparedOp as UserOperation<"0.8">;

      const paymasterClient = getPaymasterClient();
      setStatus(
        (prev) => `${prev}\n4. Fetching paymaster stub data (pm_getPaymasterStubData)…`
      );
      const paymasterStub = await paymasterClient.getPaymasterStubData({
        ...normalizedPreparedOp,
        entryPointAddress: entryPoint,
        chainId,
        context: {
          target,
          selector: SAFE_MINT_SELECTOR,
        },
      });

      setStatus((prev) => `${prev}\n5. Estimating gas from bundler…`);
      const estimateResult = await bundler.estimateUserOperationGas({
        account,
        ...normalizedPreparedOp,
        paymaster: paymasterStub.paymaster,
        paymasterData: paymasterStub.paymasterData,
        paymasterPostOpGasLimit: paymasterStub.paymasterPostOpGasLimit,
        paymasterVerificationGasLimit:
          paymasterStub.paymasterVerificationGasLimit,
      });
      setGasEstimates(estimateResult);
      const { signature: _unusedSignature, ...unsignedOp } = normalizedPreparedOp;
      void _unusedSignature;

      setPreparedAccount(account);
      setPreparedUnsignedOp(unsignedOp as PreparedUserOperation);
      setPreparedContext({
        entryPoint,
        chainId,
        target: target as `0x${string}`,
      });
      setStatus(
        (prev) =>
          `${prev}\n6. Prepared. Adjust gas sliders then click Send.`
      );
    } catch (error) {
      console.error("prepareUserOperation failed", error);
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`failed: ${message}`);
    }
  };

  const sendPreparedUserOperation = async () => {
    if (
      !preparedAccount ||
      !preparedUnsignedOp ||
      !gasEstimates ||
      !preparedContext
    ) {
      setStatus("failed: prepare the UserOperation first.");
      return;
    }
    if (!isEthAddress(target)) {
      setStatus("failed: target changed. Re-run Prepare.");
      return;
    }
    setStatus((prev) =>
      prev ? `${prev}\nSending UserOperation…` : "Sending UserOperation…"
    );
    try {
      const scaledCallGasLimit = scaleGas(
        gasEstimates.callGasLimit,
        gasScaling.call
      );
      const scaledVerificationGasLimit = scaleGas(
        gasEstimates.verificationGasLimit,
        gasScaling.verification
      );
      const scaledPreVerificationGas = scaleGas(
        gasEstimates.preVerificationGas,
        gasScaling.preVerification
      );

      const bundler = getBundlerClientBySimpleAccount(preparedAccount);
      const scaledOp: UserOperation<"0.8"> = {
        ...(preparedUnsignedOp as UserOperation<"0.8">),
        callGasLimit: scaledCallGasLimit,
        verificationGasLimit: scaledVerificationGasLimit,
        preVerificationGas: scaledPreVerificationGas,
      };
      const paymasterClient = getPaymasterClient();
      const paymasterData = await paymasterClient.getPaymasterData({
        sender: scaledOp.sender,
        nonce: scaledOp.nonce,
        callData: scaledOp.callData,
        callGasLimit: scaledOp.callGasLimit,
        verificationGasLimit: scaledOp.verificationGasLimit,
        preVerificationGas: scaledOp.preVerificationGas,
        maxFeePerGas: scaledOp.maxFeePerGas,
        maxPriorityFeePerGas: scaledOp.maxPriorityFeePerGas,
        factory: scaledOp.factory,
        factoryData: scaledOp.factoryData,
        paymasterPostOpGasLimit: scaledOp.paymasterPostOpGasLimit,
        paymasterVerificationGasLimit: scaledOp.paymasterVerificationGasLimit,
        entryPointAddress: preparedContext.entryPoint,
        chainId: preparedContext.chainId,
        context: {
          target: preparedContext.target,
          selector: SAFE_MINT_SELECTOR,
        },
      });

      const finalOp: UserOperationRequest<"0.8"> = {
        ...(scaledOp as UserOperationRequest<"0.8">),
        paymaster: paymasterData.paymaster,
        paymasterData: paymasterData.paymasterData,
        paymasterVerificationGasLimit:
          paymasterData.paymasterVerificationGasLimit ??
          scaledOp.paymasterVerificationGasLimit,
        paymasterPostOpGasLimit:
          paymasterData.paymasterPostOpGasLimit ?? scaledOp.paymasterPostOpGasLimit,
      };

      const userOpParams = {
        account: preparedAccount,
        ...finalOp,
      } as Parameters<typeof bundler.sendUserOperation>[0];
      const userOpHash = await bundler.sendUserOperation(userOpParams);
      setStatus(
        (prev) =>
          `${prev}\nsubmitted ✅\nuserOpHash: ${userOpHash}\nWaiting for totalSupply refresh…`
      );
      await refreshSupply();
      invalidatePrepared();
    } catch (error) {
      console.error("sendUserOperation failed", error);
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`failed: ${message}`);
    }
  };

  return (
    <section className="surface-card space-y-4 p-6">
      <h3 className="font-semibold">Mint SENTRA NFT</h3>
      <p className="text-sm text-slate-400">
        Mint a SENTRA NFT to your smart account with{" "}
        <span className="font-semibold text-emerald-300">
          zero native gas cost
        </span>
        . The Paymaster sponsors the entire UserOperation.
      </p>
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Gas Sponsored · 0 Fee Mint
      </div>
      {nftPreview?.image ? (
        <div className="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <img
            src={nftPreview.image}
            alt={nftPreview?.name ?? "SENTRA NFT"}
            className="h-32 w-32 rounded-lg border border-slate-800 object-cover"
          />
          <div>
            <div className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
              SENTRA NFT
            </div>
            <div className="text-lg font-semibold text-slate-50">
              {nftPreview?.name ?? "Prototype"}
            </div>
            {nftPreview?.description ? (
              <p className="mt-1 text-sm text-slate-400 line-clamp-3">
                {nftPreview.description}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded border border-dashed border-slate-700 p-4 text-sm text-slate-400">
          Loading preview from {NFT_METADATA_URI}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-3">
          <div className="mb-1 text-sm text-slate-400">
            Smart Account (Sender)
          </div>
          <div className="rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-slate-200">
            {isEthAddress(senderAddress)
              ? senderAddress
              : "Run Calculate Simple Account to populate."}
          </div>
        </div>
        <div className="md:col-span-2">
          <div className="mb-1 text-sm text-slate-400">
            Target (ERC-721 Mintable)
          </div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
            placeholder="0x..."
            value={target}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setTarget(event.target.value as `0x${string}` | "");
              invalidatePrepared();
            }}
          />
        </div>
        <div className="md:col-span-3">
          <div className="mb-1 text-sm text-slate-400">
            Recipient (Calculated Smart Account)
          </div>
          <div className="rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-slate-200">
            {isEthAddress(calculatedRecipient)
              ? calculatedRecipient
              : "Run Calculate Simple Account to populate."}
          </div>
        </div>
        {supply !== null && (
          <div className="md:col-span-3 text-xs text-slate-400">
            totalSupply: {supply.toString()}
          </div>
        )}
      </div>

      {gasEstimates && preparedUnsignedOp ? (
        <div className="surface-card surface-card--muted space-y-4 p-4">
          <div className="text-sm font-semibold text-slate-200">
            Gas Scaling
          </div>
          <p className="text-xs text-slate-400">
            Bundler estimate is treated as 100%. Adjust the sliders before
            clicking Send. A red warning appears if you drop below 80%.
          </p>
          <GasScalingControl
            label="Call Gas Limit"
            percent={gasScaling.call}
            baseValue={gasEstimates.callGasLimit}
            onChange={(value) =>
              setGasScaling((prev) => ({ ...prev, call: value }))
            }
          />
          <GasScalingControl
            label="Verification Gas Limit"
            percent={gasScaling.verification}
            baseValue={gasEstimates.verificationGasLimit}
            onChange={(value) =>
              setGasScaling((prev) => ({ ...prev, verification: value }))
            }
          />
          <GasScalingControl
            label="Pre-Verification Gas"
            percent={gasScaling.preVerification}
            baseValue={gasEstimates.preVerificationGas}
            onChange={(value) =>
              setGasScaling((prev) => ({ ...prev, preVerification: value }))
            }
          />
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button onClick={prepareUserOperation} className="btn-secondary">
          Prepare
        </button>
        <button
          onClick={sendPreparedUserOperation}
          className="btn-primary"
          disabled={!preparedAccount || !preparedUnsignedOp || !gasEstimates}
        >
          Send
        </button>
      </div>

      {status && (
        <div className="surface-card surface-card--muted p-3 text-xs text-slate-200">
          <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
            Mint Progress
          </div>
          <ol className="space-y-2">
            {status
              .split("\n")
              .map((line) => line.trim())
              .filter((line) => line.length > 0)
              .map((line, index, all) => {
                const isError = line.toLowerCase().startsWith("failed");
                const isDone =
                  line.toLowerCase().includes("submitted") ||
                  line.toLowerCase().includes("confirmed");
                const isActive =
                  !isError && !isDone && index === all.length - 1;
                const dotClass = isError
                  ? "bg-rose-500"
                  : isDone
                  ? "bg-emerald-500"
                  : isActive
                  ? "bg-emerald-300"
                  : "bg-slate-600";
                const textClass = isError
                  ? "text-rose-300"
                  : isDone
                  ? "text-emerald-300"
                  : "text-slate-200";
                return (
                  <li key={`${line}-${index}`} className="flex items-start gap-3">
                    <div className="mt-[3px] flex flex-col items-center">
                      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                      {index < all.length - 1 && (
                        <span className="mt-1 h-4 w-px bg-slate-700" />
                      )}
                    </div>
                    <span className={textClass}>{line}</span>
                  </li>
                );
              })}
          </ol>
        </div>
      )}
    </section>
  );
}

function GasScalingControl({
  label,
  percent,
  baseValue,
  onChange,
}: {
  label: string;
  percent: number;
  baseValue: bigint;
  onChange: (value: number) => void;
}) {
  const scaledValue = scaleGas(baseValue, percent);
  const levelClass =
    percent < 80
      ? "text-rose-400"
      : percent < 100
      ? "text-amber-300"
      : "text-emerald-300";
  const warningText =
    percent < 80
      ? "Risk: below 80% is very likely to fail."
      : percent < 100
      ? "Caution: below the baseline."
      : "Safe: baseline or higher.";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className={`font-mono ${levelClass}`}>
          {percent}% → {scaledValue.toString()}
        </span>
      </div>
      <input
        type="range"
        min={50}
        max={200}
        step={5}
        value={percent}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
      />
      <div className={`text-[11px] ${levelClass}`}>{warningText}</div>
    </div>
  );
}

function scaleGas(base: bigint, percent: number) {
  return (base * BigInt(percent)) / 100n;
}
