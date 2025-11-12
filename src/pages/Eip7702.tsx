import { useCallback, useEffect, useMemo, useState } from "react";
import { createWalletClient, encodeFunctionData, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { toSimpleSmartAccount } from "permissionless/accounts";
import PageHeader from "../components/layout/PageHeader";
import { usePlaygroundStoredState } from "../hooks/usePlaygroundStoredState";
import { useAuth } from "../state/auth";
import { ApiError, api, type PaymasterResponse } from "../lib/api";
import {
  ENTRYPOINT_ABI,
  getBundlerClientBySimpleAccount,
  getPaymasterClient,
  getPublicClient,
  tenderlyTestNet,
} from "../lib/viem";
import {
  buildPaymasterAndData,
  packAccountGasLimits,
  packGasFees,
} from "../lib/userOpLegacy";
import { toSelector } from "../lib/selectors";
import { isEthAddress } from "../lib/address";
import type { SignedAuthorization } from "viem";

const USDC_ADDRESS =
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as `0x${string}`;
const USDC_APPROVE_SELECTOR = toSelector("approve(address,uint256)");
const GWEI = 1_000_000_000n;
const DEFAULT_MAX_PRIORITY_FEE = 1n * GWEI;
const DEFAULT_MAX_FEE = 30n * GWEI;
const DEFAULT_CALL_GAS_LIMIT = 1_000_000n;
const DEFAULT_PRE_VERIFICATION_GAS = 1_000_000n;
const DEFAULT_VERIFICATION_GAS_LIMIT = 500_000n;
const TYPE4_GAS_LIMIT = 3_000_000n;
const DEMO_AUTH_PRIVATE_KEY =
  "0x6b1d4d8a1eef2711a2c626b7338f2c1fe814f81a79a3d4a7f0c1d6b7e9a4c5f6" as const;
const SIMPLE_7702_ACCOUNT =
  "0xe6Cae83BdE06E4c305530e199D7217f42808555B" as const;
const DEFAULT_APPROVE_AMOUNT = 1_000_000_000_000_000_000n;
const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

type Type4Preview = {
  type: "eip7702";
  from: `0x${string}`;
  chainId: number;
  to: `0x${string}`;
  data: `0x${string}`;
  authorizationList: SignedAuthorization[];
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gas: bigint;
};

export default function Eip7702() {
  const { storedState } = usePlaygroundStoredState();
  const { token } = useAuth();
  const demoAuthorizationAccount = useMemo(
    () => privateKeyToAccount(DEMO_AUTH_PRIVATE_KEY),
    []
  );
  const [paymasterInfo, setPaymasterInfo] = useState<PaymasterResponse | null>(
    null
  );
  const [entryPoint, setEntryPoint] = useState<`0x${string}` | "">(
    storedState.paymasterEntryPoint ?? ""
  );
  const [approveSpender, setApproveSpender] = useState<`0x${string}` | "">(
    storedState.simpleAccountOwner ?? storedState.paymasterEntryPoint ?? ""
  );
  const [chainIdInput, setChainIdInput] = useState(
    String(tenderlyTestNet.id)
  );
  const [nonceInput, setNonceInput] = useState("");
  const [authorization, setAuthorization] =
    useState<SignedAuthorization | null>(null);
  const [type4Preview, setType4Preview] = useState<Type4Preview | null>(null);
  const [authStatus, setAuthStatus] = useState("");
  const [payloadStatus, setPayloadStatus] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [authorizationOwner, setAuthorizationOwner] = useState<
    `0x${string}` | null
  >(demoAuthorizationAccount.address);
  const [allowlistStatus, setAllowlistStatus] = useState("");
  const [allowlistLoading, setAllowlistLoading] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");

  useEffect(() => {
    if (!token) {
      setPaymasterInfo(null);
      return;
    }
    let ignore = false;
    (async () => {
      try {
        const response = await api.getPaymaster(token);
        if (!ignore) setPaymasterInfo(response);
      } catch (error) {
        console.error("Failed to load paymaster info", error);
        if (!ignore) setPaymasterInfo(null);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [token]);

  const resolvedChainId = useMemo(() => {
    const parsed = Number(chainIdInput);
    return Number.isNaN(parsed) || parsed <= 0 ? tenderlyTestNet.id : parsed;
  }, [chainIdInput]);

  const paymasterSummary = useMemo(() => {
    if (!paymasterInfo) return "Paymaster not registered yet.";
    return `Paymaster ${paymasterInfo.address ?? "-"} sponsoring via EntryPoint ${
      paymasterInfo.entryPoint ?? "-"
    }.`;
  }, [paymasterInfo]);

  const appendPayloadStatus = useCallback((line: string) => {
    setPayloadStatus((prev) => (prev ? `${prev}\n${line}` : line));
  }, []);

  const handleSignAuthorization = useCallback(async () => {
    setAuthorization(null);
    setType4Preview(null);
    setAuthStatus("");
    setAuthorizationOwner(null);
    setAuthLoading(true);
    try {
      const chainId = resolvedChainId;

      const account = demoAuthorizationAccount;
      const nonce =
        nonceInput.trim().length > 0
          ? Number(nonceInput)
          : await getPublicClient().getTransactionCount({
              address: account.address,
            });
      if (!Number.isFinite(nonce)) {
        throw new Error("Unable to determine nonce for demo signer.");
      }
      setAuthStatus(
        `Signing authorization via demo signer ${shorten(
          account.address
        )} for Simple7702Account ${SIMPLE_7702_ACCOUNT} (chainId=${chainId}, nonce=${nonce}).`
      );
      const signature = await account.signAuthorization({
        contractAddress: SIMPLE_7702_ACCOUNT,
        chainId,
        nonce,
      });
      setAuthorization(signature);
      setAuthorizationOwner(account.address);
      setAuthStatus(
        "Authorization signed. Copy the payload below for the Type-4 transaction."
      );
    } catch (error: any) {
      console.error(error);
      setAuthStatus(
        error?.message ??
          "Failed to sign authorization. Try switching to demo signer."
      );
    } finally {
      setAuthLoading(false);
    }
  }, [demoAuthorizationAccount, nonceInput, resolvedChainId]);

  const handleRegisterAllowlist = useCallback(async () => {
    if (!token) {
      setAllowlistStatus("Sign in to register allowlist entries.");
      return;
    }
    setAllowlistLoading(true);
    try {
      await api
        .addUser(token, demoAuthorizationAccount.address)
        .catch((error) => {
          if (error instanceof ApiError && error.status === 409) return;
          throw error;
        });
      await api
        .addContract(token, {
          address: USDC_ADDRESS,
          name: "USDC",
          functions: [
            {
              selector: USDC_APPROVE_SELECTOR,
              signature: "approve(address,uint256)",
            },
          ],
        })
        .catch((error) => {
          if (error instanceof ApiError && error.status === 409) return;
          throw error;
        });
      setAllowlistStatus(
        "Demo signer + USDC approve selector registered for sponsorship."
      );
    } catch (error: any) {
      console.error(error);
      setAllowlistStatus(error?.message ?? String(error));
    } finally {
      setAllowlistLoading(false);
    }
  }, [demoAuthorizationAccount.address, token]);


  const handlePrepareType4 = useCallback(async () => {
    setType4Preview(null);
    setPayloadStatus("");
    if (!authorization) {
      setPayloadStatus("Sign an EIP-7702 authorization first.");
      return;
    }
    if (!entryPoint || !isEthAddress(entryPoint)) {
      setPayloadStatus("EntryPoint address is required.");
      return;
    }
    if (!approveSpender || !isEthAddress(approveSpender)) {
      setPayloadStatus("Approve spender address is required.");
      return;
    }
    appendPayloadStatus("Preparing sponsored UserOperation…");
    setPayloadLoading(true);
    try {
      const eoaOwner = authorizationOwner ?? demoAuthorizationAccount.address;
      const publicClient = getPublicClient();

      const smartAccount = await toSimpleSmartAccount({
        client: publicClient,
        owner: demoAuthorizationAccount,
        eip7702: true,
        entryPoint: { address: entryPoint as `0x${string}`, version: "0.8" },
        accountLogicAddress: SIMPLE_7702_ACCOUNT,
      });
      const bundler = getBundlerClientBySimpleAccount(smartAccount);

      const approveData = encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [approveSpender as `0x${string}`, DEFAULT_APPROVE_AMOUNT],
      });

      const prepared = await bundler.prepareUserOperation({
        calls: [{ to: USDC_ADDRESS, data: approveData }],
        callGasLimit: DEFAULT_CALL_GAS_LIMIT,
        verificationGasLimit: DEFAULT_VERIFICATION_GAS_LIMIT,
        preVerificationGas: DEFAULT_PRE_VERIFICATION_GAS,
        maxFeePerGas: DEFAULT_MAX_FEE,
        maxPriorityFeePerGas: DEFAULT_MAX_PRIORITY_FEE,
      });
      appendPayloadStatus("Bundler prepared baseline UserOperation.");

      const paymasterClient = getPaymasterClient(token);
      const chainId = resolvedChainId;
      const stub = await paymasterClient.getPaymasterStubData({
        ...prepared,
        entryPointAddress: entryPoint as `0x${string}`,
        chainId,
        context: {
          target: USDC_ADDRESS,
          selector: USDC_APPROVE_SELECTOR,
        },
      });

      let sponsoredOp: any = {
        ...prepared,
        paymaster: stub.paymaster,
        paymasterData: stub.paymasterData,
        paymasterVerificationGasLimit: stub.paymasterVerificationGasLimit,
        paymasterPostOpGasLimit: stub.paymasterPostOpGasLimit,
      };

      const paymasterData = await paymasterClient.getPaymasterData({
        ...sponsoredOp,
        entryPointAddress: entryPoint as `0x${string}`,
        chainId,
        context: {
          target: USDC_ADDRESS,
          selector: USDC_APPROVE_SELECTOR,
        },
      });

      sponsoredOp = {
        ...sponsoredOp,
        paymaster: paymasterData.paymaster,
        paymasterData: paymasterData.paymasterData,
        paymasterVerificationGasLimit: paymasterData.paymasterVerificationGasLimit,
        paymasterPostOpGasLimit: paymasterData.paymasterPostOpGasLimit,
      };
      appendPayloadStatus("Paymaster attached sponsorship data.");

      const signature = await smartAccount.signUserOperation(sponsoredOp);
      const packed = packOperation({
        ...sponsoredOp,
        signature,
      });

      const calldata = encodeFunctionData({
        abi: ENTRYPOINT_ABI,
        functionName: "handleOps",
        args: [[packed], eoaOwner],
      });

      const preview: Type4Preview = {
        type: "eip7702",
        from: eoaOwner,
        chainId,
        to: entryPoint as `0x${string}`,
        authorizationList: [authorization],
        data: calldata as `0x${string}`,
        maxFeePerGas: DEFAULT_MAX_FEE,
        maxPriorityFeePerGas: DEFAULT_MAX_PRIORITY_FEE,
        gas: TYPE4_GAS_LIMIT,
      };

      setType4Preview(preview);
      setSubmitStatus("");
      appendPayloadStatus(
        "Type-4 payload ready. Send it via walletClient.sendTransaction({ ...preview })."
      );
    } catch (error: any) {
      console.error(error);
      appendPayloadStatus(error?.message ?? String(error));
    } finally {
      setPayloadLoading(false);
    }
  }, [
    appendPayloadStatus,
    approveSpender,
    authorization,
    entryPoint,
    resolvedChainId,
    token,
  ]);

  const handleSubmitType4 = useCallback(async () => {
    if (!type4Preview) {
      setSubmitStatus("Prepare the Type-4 payload first.");
      return;
    }
    setSubmitLoading(true);
    setSubmitStatus("Submitting Type-4 transaction…");
    try {
      const rpcUrl = import.meta.env.VITE_RPC_URL;
      if (!rpcUrl) throw new Error("VITE_RPC_URL is required to send txs.");
      const wallet = createWalletClient({
        account: demoAuthorizationAccount,
        chain: tenderlyTestNet,
        transport: http(rpcUrl),
      });
      const hash = await wallet.sendTransaction(type4Preview);
      setSubmitStatus(`Submitted: ${hash}`);
      const receipt = await getPublicClient().waitForTransactionReceipt({
        hash,
      });
      setSubmitStatus(
        `Confirmed in block ${receipt.blockNumber}. Tx: ${hash}`
      );
    } catch (error: any) {
      console.error(error);
      setSubmitStatus(error?.message ?? String(error));
    } finally {
      setSubmitLoading(false);
    }
  }, [demoAuthorizationAccount, type4Preview]);

  return (
    <div className="space-y-6">
      <PageHeader title="EIP-7702" />

      <section className="surface-card space-y-4 p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
          Pattern A
        </div>
        <h3 className="text-xl font-semibold text-slate-50">
          7702 Delegation + ERC-4337 Paymaster
        </h3>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-200">
          <li>
            Use <span className="font-mono">signAuthorization</span> to delegate
            your EOA to our Simple7702Account implementation.
          </li>
          <li>
            Submit a Type-4 transaction (EIP-7702) from the same EOA so it
            temporarily behaves like a smart account.
          </li>
          <li>
            Inside that transaction, send an ERC-4337 UserOperation (here:
            USDC’s <code>approve</code>) and let the Paymaster sponsor the gas.
          </li>
        </ol>
        <div className="rounded border border-slate-700/60 bg-slate-900/40 p-4 text-sm text-slate-300">
          {paymasterSummary}
        </div>
      </section>

      <section className="surface-card space-y-4 p-6">
        <header className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Step 1
            </div>
            <h3 className="text-lg font-semibold text-slate-50">
              Generate EIP-7702 Authorization
            </h3>
          </div>
          <button
            onClick={handleSignAuthorization}
            className="btn-primary"
            disabled={authLoading}
          >
            {authLoading ? "Waiting…" : "Sign Authorization"}
          </button>
        </header>

        <div className="rounded border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-100">
          <div>
            Demo signer address:{" "}
            <span className="font-mono">{demoAuthorizationAccount.address}</span>
          </div>
          <div className="mt-1 text-amber-200/80">
            Private key: {shortenPrivateKey(DEMO_AUTH_PRIVATE_KEY)} (sandbox use
            only – do not fund on mainnet).
          </div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-200">
          Delegating to Simple7702Account:{" "}
          <span className="font-mono">{SIMPLE_7702_ACCOUNT}</span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Chain ID"
            value={chainIdInput}
            onChange={setChainIdInput}
            placeholder={`${tenderlyTestNet.id}`}
          />
          <Field
            label="Nonce (optional override)"
            value={nonceInput}
            onChange={setNonceInput}
            placeholder="Auto detect"
          />
        </div>

        {authStatus && (
          <StatusLog title="Authorization" value={authStatus} />
        )}

        {authorization ? (
          <pre className="surface-card surface-card--muted overflow-x-auto rounded border border-slate-800 p-3 text-xs text-slate-200">
            {formatJson(authorization)}
          </pre>
        ) : null}
      </section>

      <section className="surface-card space-y-4 p-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Step 2
            </div>
            <h3 className="text-lg font-semibold text-slate-50">
              Build Sponsored Type-4 Transaction
            </h3>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleRegisterAllowlist}
              className="btn-secondary"
              disabled={allowlistLoading}
            >
              {allowlistLoading
                ? "Registering Allowlist…"
                : "Allowlist Demo Pair"}
            </button>
            <button
              onClick={handlePrepareType4}
              className="btn-primary"
              disabled={payloadLoading}
            >
              {payloadLoading ? "Preparing…" : "Prepare Type-4 Payload"}
            </button>
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="EntryPoint (v0.8)"
            value={entryPoint}
            onChange={(val) => setEntryPoint(val as `0x${string}` | "")}
            placeholder="0xEntryPoint..."
          />
          <Field
            label="Approve Spender"
            value={approveSpender}
            onChange={(val) => setApproveSpender(val as `0x${string}` | "")}
            placeholder="0xSpender..."
          />
        </div>

        <div className="rounded border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
          Target contract: <span className="font-mono">{USDC_ADDRESS}</span> (USDC)
          <br />
          Calldata: <code>approve(spender, {`${DEFAULT_APPROVE_AMOUNT.toString()}`} wei)</code>
        </div>

        {allowlistStatus && (
          <StatusLog title="Allowlist" value={allowlistStatus} />
        )}

        {payloadStatus && (
          <StatusLog title="UserOperation" value={payloadStatus} />
        )}

        {type4Preview ? (
          <pre className="surface-card surface-card--muted w-full overflow-hidden whitespace-pre-wrap break-all rounded border border-slate-800 p-3 text-xs text-slate-200">
            {formatJson(type4Preview)}
          </pre>
        ) : null}
      </section>

      <section className="surface-card space-y-4 p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
          Step 3
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h3 className="text-lg font-semibold text-slate-50">
            Submit Type-4 Transaction
          </h3>
          <button
            onClick={handleSubmitType4}
            className="btn-primary"
            disabled={submitLoading || !type4Preview}
          >
            {submitLoading ? "Submitting…" : "Send Type-4"}
          </button>
        </div>
        <p className="text-sm text-slate-300">
          Sends the prepared payload using the demo signer as a Type-4
          transaction. Requires the authorization and UserOperation above to be
          prepared first.
        </p>
        {submitStatus && <StatusLog title="Submission" value={submitStatus} />}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="mb-1 block text-sm text-slate-400">{label}</label>
      <input
        className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function StatusLog({ title, value }: { title: string; value: string }) {
  return (
    <div className="max-w-full">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
        {title}
      </div>
      <pre
        className="mt-2 w-full overflow-hidden whitespace-pre-wrap rounded border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-200"
        style={{ maxWidth: "100%", wordBreak: "break-all", overflowWrap: "anywhere" }}
      >
        {value}
      </pre>
    </div>
  );
}

function packOperation(op: {
  sender: `0x${string}`;
  nonce: bigint;
  initCode?: `0x${string}`;
  callData: `0x${string}`;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymaster?: `0x${string}`;
  paymasterData?: `0x${string}`;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  signature: `0x${string}`;
}) {
  const paymasterAndData = buildPaymasterAndData(
    op.paymaster,
    op.paymasterVerificationGasLimit,
    op.paymasterPostOpGasLimit,
    op.paymasterData
  );
  return {
    sender: op.sender,
    nonce: op.nonce,
    initCode: op.initCode ?? ("0x" as const),
    callData: op.callData,
    accountGasLimits: packAccountGasLimits(
      op.callGasLimit,
      op.verificationGasLimit
    ),
    preVerificationGas: op.preVerificationGas,
    gasFees: packGasFees(op.maxFeePerGas, op.maxPriorityFeePerGas),
    paymasterAndData,
    signature: op.signature,
  };
}

function formatJson(value: unknown) {
  return JSON.stringify(
    value,
    (_, current) => (typeof current === "bigint" ? current.toString() : current),
    2
  );
}

function shorten(value: `0x${string}`) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function shortenPrivateKey(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}
