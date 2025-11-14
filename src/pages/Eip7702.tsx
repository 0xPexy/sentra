import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { toSimpleSmartAccount } from "permissionless/accounts";
import PageHeader from "../components/layout/PageHeader";
import { usePlaygroundStoredState } from "../hooks/usePlaygroundStoredState";
import { useAuth } from "../state/auth";
import { ApiError, api, type PaymasterResponse } from "../lib/api";
import {
  getBundlerClientBySimpleAccount,
  getPaymasterClient,
  getPublicClient,
  tenderlyTestNet,
} from "../lib/viem";

import { toSelector } from "../lib/selectors";
import { isEthAddress } from "../lib/address";
import type { SignedAuthorization } from "viem";
import { recoverAuthorizationAddress } from "viem/utils";
import type { SmartAccount, UserOperation } from "viem/account-abstraction";

const USDC_ADDRESS =
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as `0x${string}`;
const USDC_APPROVE_SELECTOR = toSelector("approve(address,uint256)");
const GWEI = 1_000_000_000n;
const DEFAULT_MAX_PRIORITY_FEE = 1n * GWEI;
const DEFAULT_MAX_FEE = 30n * GWEI;
const DEFAULT_CALL_GAS_LIMIT = 1_000_000n;
const DEFAULT_PRE_VERIFICATION_GAS = 1_000_000n;
const DEFAULT_VERIFICATION_GAS_LIMIT = 500_000n;
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

type GasEstimates = {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
};

type PreparedOperation = Omit<UserOperation<"0.8">, "signature">;
type PreparedContext = {
  entryPoint: `0x${string}`;
  chainId: number;
  target: `0x${string}`;
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
  const [chainIdInput, setChainIdInput] = useState(String(tenderlyTestNet.id));
  const [nonceInput, setNonceInput] = useState("");
  const [authorization, setAuthorization] =
    useState<SignedAuthorization | null>(null);
  const [preparedOp, setPreparedOp] = useState<any | null>(null);
  const [preparedUnsignedOp, setPreparedUnsignedOp] =
    useState<PreparedOperation | null>(null);
  const [gasEstimates, setGasEstimates] = useState<GasEstimates | null>(null);
  const [gasScaling, setGasScaling] = useState({
    call: 100,
    verification: 100,
    preVerification: 100,
  });
  const [preparedContext, setPreparedContext] =
    useState<PreparedContext | null>(null);
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
  const smartAccountRef = useRef<SmartAccount | null>(null);

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
    return `Paymaster ${
      paymasterInfo.address ?? "-"
    } sponsoring via EntryPoint ${paymasterInfo.entryPoint ?? "-"}.`;
  }, [paymasterInfo]);

  const appendPayloadStatus = useCallback((line: string) => {
    setPayloadStatus((prev) => (prev ? `${prev}\n${line}` : line));
  }, []);

  const handleSignAuthorization = useCallback(async () => {
    setAuthorization(null);
    setPreparedOp(null);
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
      try {
        const recovered = await recoverAuthorizationAddress({
          authorization: signature,
        } as any);
        console.log(
          "[7702] recovered signer =",
          recovered,
          "expected =",
          account.address
        );
        console.log(
          "[7702] serialized tuple =",
          serializeAuthorizationForDebug(signature)
        );
      } catch (e) {
        console.log("[7702] recoverAuthorizationAddress failed", e);
      }
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

  const handlePrepareUserOperation = useCallback(async () => {
    setPreparedOp(null);
    setPreparedUnsignedOp(null);
    setPreparedContext(null);
    setGasEstimates(null);
    setGasScaling({ call: 100, verification: 100, preVerification: 100 });
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
      console.log("[7702] using sender (EOA)", eoaOwner);
      try {
        if (authorization) {
          const recovered = await recoverAuthorizationAddress({
            authorization,
          } as any);
          console.log(
            "[7702] recovered signer before UO =",
            recovered,
            "sender =",
            eoaOwner
          );
        }
      } catch (e) {
        console.log("[7702] recoverAuthorizationAddress (before UO) failed", e);
      }
      const eoaSender = demoAuthorizationAccount.address as `0x${string}`;

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
      const preparedSanitized: any = { ...prepared };
      const hadFactory =
        "factory" in preparedSanitized || "factoryData" in preparedSanitized;
      delete preparedSanitized.factory;
      delete preparedSanitized.factoryData;
      delete preparedSanitized.initCode;
      // Remove any stub/dummy 7702 fields that bundler might have attached.
      const hadAuthStub =
        "authorization" in preparedSanitized ||
        "eip7702Auth" in preparedSanitized;
      delete preparedSanitized.authorization;
      delete preparedSanitized.eip7702Auth;
      if (hadFactory)
        console.log("[7702] removed factory/factoryData from prepared op");
      if (hadAuthStub)
        console.log(
          "[7702] removed stub authorization/eip7702Auth from prepared op"
        );
      const preparedWithSender = {
        ...preparedSanitized,
        sender: eoaSender,
      };
      appendPayloadStatus("Bundler prepared baseline UserOperation.");

      const paymasterClient = getPaymasterClient(token);
      const chainId = resolvedChainId;
      const stub = await paymasterClient.getPaymasterStubData({
        ...preparedWithSender,
        entryPointAddress: entryPoint as `0x${string}`,
        chainId,
        context: {
          target: USDC_ADDRESS,
          selector: USDC_APPROVE_SELECTOR,
        },
      });

      let sponsoredOp: any = {
        ...preparedWithSender,
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
        paymasterVerificationGasLimit:
          paymasterData.paymasterVerificationGasLimit,
        paymasterPostOpGasLimit: paymasterData.paymasterPostOpGasLimit,
      };
      appendPayloadStatus("Paymaster attached sponsorship data.");

      const estimateResult = await bundler.estimateUserOperationGas({
        account: smartAccount,
        ...sponsoredOp,
      });
      setGasEstimates(estimateResult);
      appendPayloadStatus(
        `Bundler gas estimate → CGL=${estimateResult.callGasLimit.toString()}, VGL=${estimateResult.verificationGasLimit.toString()}, PVG=${estimateResult.preVerificationGas.toString()}.`
      );

      const normalizedAuth = authorization
        ? {
            ...authorization,
            address:
              (authorization as any).address?.toLowerCase?.() ??
              authorization.address,
          }
        : null;

      const opWithEstimates: PreparedOperation = {
        ...(sponsoredOp as PreparedOperation),
        callGasLimit: estimateResult.callGasLimit,
        verificationGasLimit: estimateResult.verificationGasLimit,
        preVerificationGas: estimateResult.preVerificationGas,
        authorization: normalizedAuth ?? undefined,
      };
      smartAccountRef.current = smartAccount;
      setPreparedUnsignedOp(opWithEstimates);
      setPreparedOp(opWithEstimates);
      setPreparedContext({
        entryPoint: entryPoint as `0x${string}`,
        chainId,
        target: USDC_ADDRESS,
      });
      console.log("[7702] UO keys", Object.keys(opWithEstimates));
      console.log(
        "[7702] has authorization =",
        "authorization" in (opWithEstimates as any),
        "has authorizationList =",
        "authorizationList" in (opWithEstimates as any),
        "has eip7702Auth =",
        "eip7702Auth" in (opWithEstimates as any)
      );
      if (authorization) {
        console.log("[7702] authorization object =", authorization);
        console.log(
          "[7702] serialized tuple =",
          serializeAuthorizationForDebug(authorization)
        );
      }
      const dbgAuth = (opWithEstimates as any).authorization;
      console.log("[7702] final authorization =", dbgAuth);
      setSubmitStatus("");
      appendPayloadStatus(
        "UserOperation ready. Adjust gas sliders (default 100%) before sending."
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

  const handleSubmitUserOperation = useCallback(async () => {
    if (!preparedUnsignedOp || !gasEstimates || !preparedContext) {
      setSubmitStatus("Build the UserOperation (Step 2) before sending.");
      return;
    }
    if (!smartAccountRef.current) {
      setSubmitStatus("Smart account context missing. Re-run Step 2.");
      return;
    }
    setSubmitLoading(true);
    setSubmitStatus("Signing + submitting UserOperation via bundler…");
    try {
      const scaledCallGasLimit = scaleGasValue(
        gasEstimates.callGasLimit,
        gasScaling.call
      );
      const scaledVerificationGasLimit = scaleGasValue(
        gasEstimates.verificationGasLimit,
        gasScaling.verification
      );
      const scaledPreVerificationGas = scaleGasValue(
        gasEstimates.preVerificationGas,
        gasScaling.preVerification
      );

      const baseOp = preparedUnsignedOp as UserOperation<"0.8">;
      const opWithScaling: UserOperation<"0.8"> = {
        ...baseOp,
        callGasLimit: scaledCallGasLimit,
        verificationGasLimit: scaledVerificationGasLimit,
        preVerificationGas: scaledPreVerificationGas,
      };

      const paymasterClient = getPaymasterClient(token);
      const paymasterData = await paymasterClient.getPaymasterData({
        sender: opWithScaling.sender,
        nonce: opWithScaling.nonce,
        callData: opWithScaling.callData,
        callGasLimit: opWithScaling.callGasLimit,
        verificationGasLimit: opWithScaling.verificationGasLimit,
        preVerificationGas: opWithScaling.preVerificationGas,
        maxFeePerGas: opWithScaling.maxFeePerGas,
        maxPriorityFeePerGas: opWithScaling.maxPriorityFeePerGas,
        factory: opWithScaling.factory,
        factoryData: opWithScaling.factoryData,
        paymasterPostOpGasLimit: opWithScaling.paymasterPostOpGasLimit,
        paymasterVerificationGasLimit:
          opWithScaling.paymasterVerificationGasLimit,
        entryPointAddress: preparedContext.entryPoint,
        chainId: preparedContext.chainId,
        context: {
          target: preparedContext.target,
          selector: USDC_APPROVE_SELECTOR,
        },
      });

      const opWithPaymaster: UserOperation<"0.8"> = {
        ...opWithScaling,
        paymaster: paymasterData.paymaster,
        paymasterData: paymasterData.paymasterData,
        paymasterVerificationGasLimit:
          paymasterData.paymasterVerificationGasLimit ??
          opWithScaling.paymasterVerificationGasLimit,
        paymasterPostOpGasLimit:
          paymasterData.paymasterPostOpGasLimit ??
          opWithScaling.paymasterPostOpGasLimit,
      };

      const smartAccount = smartAccountRef.current;
      const signature = await smartAccount.signUserOperation(opWithPaymaster);
      const signedOp = {
        ...opWithPaymaster,
        signature,
      };
      setPreparedOp(signedOp);

      const bundler = getBundlerClientBySimpleAccount(smartAccount);
      const hash = await bundler.sendUserOperation(signedOp);
      setSubmitStatus(`UserOperation sent. Hash: ${hash}`);
      const receipt = await bundler.waitForUserOperationReceipt({ hash });
      setSubmitStatus(
        `UserOperation confirmed in block ${receipt.receipt.blockNumber}.`
      );
    } catch (error: any) {
      console.error(error);
      setSubmitStatus(error?.message ?? String(error));
    } finally {
      setSubmitLoading(false);
    }
  }, [
    gasEstimates,
    gasScaling.call,
    gasScaling.preVerification,
    gasScaling.verification,
    preparedContext,
    preparedUnsignedOp,
    token,
  ]);

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
            <span className="font-mono">
              {demoAuthorizationAccount.address}
            </span>
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

        {authStatus && <StatusLog title="Authorization" value={authStatus} />}

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
              Build Sponsored UserOperation
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
              onClick={handlePrepareUserOperation}
              className="btn-primary"
              disabled={payloadLoading}
            >
              {payloadLoading ? "Preparing…" : "Prepare UserOperation"}
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
          Target contract: <span className="font-mono">{USDC_ADDRESS}</span>{" "}
          (USDC)
          <br />
          Calldata:{" "}
          <code>
            approve(spender, {`${DEFAULT_APPROVE_AMOUNT.toString()}`} wei)
          </code>
        </div>

        {allowlistStatus && (
          <StatusLog title="Allowlist" value={allowlistStatus} />
        )}

        {payloadStatus && (
          <StatusLog title="UserOperation" value={payloadStatus} />
        )}

        {gasEstimates && preparedUnsignedOp ? (
          <div className="surface-card surface-card--muted space-y-4 p-4">
            <div className="text-sm font-semibold text-slate-200">
              Gas Scaling
            </div>
            <p className="text-xs text-slate-400">
              Bundler estimates are treated as 100%. Adjust the sliders before
              submitting if you want extra headroom.
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
                setGasScaling((prev) => ({
                  ...prev,
                  preVerification: value,
                }))
              }
            />
          </div>
        ) : null}

        {preparedOp ? (
          <pre className="surface-card surface-card--muted w-full overflow-hidden whitespace-pre-wrap break-all rounded border border-slate-800 p-3 text-xs text-slate-200">
            {formatJson(preparedOp)}
          </pre>
        ) : null}
      </section>

      <section className="surface-card space-y-4 p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
          Step 3
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h3 className="text-lg font-semibold text-slate-50">
            Submit UserOperation via Bundler
          </h3>
          <button
            onClick={handleSubmitUserOperation}
            className="btn-primary"
            disabled={
              submitLoading ||
              !preparedUnsignedOp ||
              !gasEstimates ||
              !preparedContext
            }
          >
            {submitLoading ? "Submitting…" : "Send UserOperation"}
          </button>
        </div>
        <p className="text-sm text-slate-300">
          Sends the prepared UserOperation through the bundler. Requires Steps 1
          & 2 to complete so that the operation includes{" "}
          <code>eip7702Auth</code>
          and paymaster sponsorship.
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
  const scaledValue = scaleGasValue(baseValue, percent);
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

function scaleGasValue(base: bigint, percent: number) {
  return (base * BigInt(percent)) / 100n;
}

function StatusLog({ title, value }: { title: string; value: string }) {
  return (
    <div className="max-w-full">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
        {title}
      </div>
      <pre
        className="mt-2 w-full overflow-hidden whitespace-pre-wrap rounded border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-200"
        style={{
          maxWidth: "100%",
          wordBreak: "break-all",
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </pre>
    </div>
  );
}

function formatJson(value: unknown) {
  return JSON.stringify(
    value,
    (_, current) =>
      typeof current === "bigint" ? current.toString() : current,
    2
  );
}

function serializeAuthorizationForDebug(auth: any) {
  try {
    const chainIdHex = `0x${BigInt(auth.chainId).toString(16)}`;
    const nonceHex = `0x${BigInt(auth.nonce).toString(16)}`;
    const yParityHex = `0x${BigInt(
      auth.yParity ?? (auth.v === "28" || auth.v === 28 ? 1 : 0)
    ).toString(16)}`;
    return [chainIdHex, auth.address, nonceHex, yParityHex, auth.r, auth.s];
  } catch {
    return null;
  }
}

// Some bundlers expect tuple order: [chainId, address, nonce, r, s, yParity]
function serializeAuthorizationForBundler(auth: any) {
  try {
    const chainIdHex = `0x${BigInt(auth.chainId).toString(16)}`;
    const nonceHex = `0x${BigInt(auth.nonce).toString(16)}`;
    const yParityHex = `0x${BigInt(
      auth.yParity ?? (auth.v === "28" || auth.v === 28 ? 1 : 0)
    ).toString(16)}`;
    const addrLower = (auth.address ?? "").toLowerCase();
    // Repo expectation: [chainId, address, nonce, yParity, r, s]
    return [chainIdHex, addrLower, nonceHex, yParityHex, auth.r, auth.s];
  } catch {
    return null;
  }
}

function shorten(value: `0x${string}`) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function shortenPrivateKey(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}
