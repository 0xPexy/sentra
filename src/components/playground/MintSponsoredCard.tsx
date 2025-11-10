import { ChangeEvent, useEffect, useState } from "react";
import { encodeFunctionData } from "viem";
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

type Props = {
  defaultTarget: `0x${string}` | "";
  defaultSender?: `0x${string}` | "";
  simpleAccountFactory?: `0x${string}` | "";
  simpleAccountSalt?: string;
  simpleAccountOwner?: `0x${string}` | "";
  entryPointHint?: `0x${string}` | "";
};

type EthereumProvider = {
  request?: (args: {
    method: string;
    params?: Record<string, unknown>;
  }) => Promise<unknown>;
};

const GWEI = 1_000_000_000n;
const DEFAULT_MAX_PRIORITY_FEE = 1n * GWEI;
const DEFAULT_MAX_FEE = 30n * GWEI;
const DEFAULT_CALL_GAS_LIMIT = 1_000_000n;
const DEFAULT_PRE_VERIFICATION_GAS = 1_000_000n;
const DEFAULT_VERIFICATION_GAS_LIMIT = 500_000n;

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
  const [recipient, setRecipient] = useState<`0x${string}` | "">("");
  const [senderAddress, setSenderAddress] = useState<`0x${string}` | "">(
    defaultSender
  );
  const [status, setStatus] = useState("");
  const { supply, refresh: refreshSupply } = useNftTotalSupply(target);

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
    }
  }, [defaultTarget]);

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
          setRecipient((prev) => prev || addr);
        }
      } catch {
        // wallet not available; ignore
      }
    })();
  }, []);

  const sendUserOperation = async () => {
    if (!isEthAddress(target)) {
      setStatus("failed: target contract address is invalid.");
      return;
    }
    if (!isEthAddress(recipient)) {
      setStatus("failed: recipient address is required.");
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
      const selector = toSelector("safeMint(address,string)");
      const safeMintData = encodeFunctionData({
        abi: SAFE_MINT_ABI,
        functionName: "safeMint",
        args: [
          recipient as `0x${string}`,
          "http://localhost:8080/api/v1/playground/nft",
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

      const paymasterClient = getPaymasterClient();
      setStatus(
        (prev) => `${prev}\n4. Fetching paymaster stub data (pm_getPaymasterStubData)…`
      );
      const paymasterStub = await paymasterClient.getPaymasterStubData({
        ...preparedOp,
        entryPointAddress: entryPoint,
        chainId,
        context: {
          target,
          selector,
        },
      });

      setStatus((prev) => `${prev}\n5. Estimating gas from bundler…`);
      const gasEstimates = await bundler.estimateUserOperationGas({
        account,
        ...preparedOp,
        paymaster: paymasterStub.paymaster,
        paymasterData: paymasterStub.paymasterData,
        paymasterPostOpGasLimit: paymasterStub.paymasterPostOpGasLimit,
        paymasterVerificationGasLimit:
          paymasterStub.paymasterVerificationGasLimit,
      });
      const adjustedCallGasLimit = gasEstimates.callGasLimit + 300_000n;
      const adjustedVerificationGasLimit =
        gasEstimates.verificationGasLimit + 75_000n;
      const adjustedPreVerificationGas =
        (gasEstimates.preVerificationGas * 125n) / 100n;

      const { signature: _unusedSignature, ...unsignedOp } = preparedOp;
      void _unusedSignature;

      setStatus(
        (prev) =>
          `${prev}\n6. Sending UserOperation… (CGL=${adjustedCallGasLimit.toString()}, VGL=${adjustedVerificationGasLimit.toString()}, PVG=${adjustedPreVerificationGas.toString()})`
      );
      const userOpHash = await bundler.sendUserOperation({
        account,
        ...unsignedOp,
        callGasLimit: adjustedCallGasLimit,
        verificationGasLimit: adjustedVerificationGasLimit,
        preVerificationGas: adjustedPreVerificationGas,
        paymaster: paymasterClient,
        paymasterContext: {
          target,
          selector,
        },
      });

      setStatus(
        (prev) =>
          `${prev}\n7. submitted ✅\nuserOpHash: ${userOpHash}\nWaiting for totalSupply refresh…`
      );
      await refreshSupply();
    } catch (error) {
      console.error("sendUserOperation failed", error);
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`failed: ${message}`);
    }
  };

  const addToMetaMask = async () => {
    if (!isEthAddress(target)) {
      setStatus("failed: set a valid target contract before importing.");
      return;
    }
    if (supply === null) {
      setStatus("failed: totalSupply is unknown. Mint first or refresh.");
      return;
    }
    const latestMinted = supply > 0n ? supply - 1n : 0n;

    const eth = (window as Window & { ethereum?: EthereumProvider }).ethereum;
    if (!eth?.request) {
      setStatus("failed: MetaMask (window.ethereum) not found.");
      return;
    }

    try {
      await eth.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC721",
          options: {
            address: target,
            tokenId: latestMinted.toString(),
          },
        },
      });
      setStatus((prev) =>
        prev
          ? `${prev}\nMetaMask import requested.`
          : "MetaMask import requested."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`failed: unable to import NFT to MetaMask - ${message}`);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-[#151A28] p-4">
      <h3 className="font-semibold">Mint ERC721Mintable (Sponsored)</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-3">
          <div className="mb-1 text-sm text-slate-400">
            Sender (Allowed Minter)
          </div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
            placeholder="0xMinter..."
            value={senderAddress}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setSenderAddress(event.target.value as `0x${string}` | "")
            }
          />
        </div>
        <div className="md:col-span-2">
          <div className="mb-1 text-sm text-slate-400">
            Target (ERC-721 Mintable)
          </div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
            placeholder="0x..."
            value={target}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setTarget(event.target.value as `0x${string}` | "")
            }
          />
        </div>
        <div className="md:col-span-3">
          <div className="mb-1 text-sm text-slate-400">Recipient</div>
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
            placeholder="0xRecipient..."
            value={recipient}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setRecipient(event.target.value as `0x${string}` | "")
            }
          />
        </div>
        {supply !== null && (
          <div className="md:col-span-3 text-xs text-slate-400">
            totalSupply: {supply.toString()}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={sendUserOperation}
          className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500"
        >
          Send
        </button>
        <button
          onClick={addToMetaMask}
          className="rounded border border-indigo-500 px-3 py-2 text-sm font-medium text-indigo-300 hover:bg-indigo-500/10"
        >
          Import to MetaMask
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
