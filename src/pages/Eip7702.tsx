import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, toHex } from "viem";
import { toSimpleSmartAccount } from "permissionless/accounts";
import PageHeader from "../components/layout/PageHeader";
import { Link } from "react-router-dom";
import { usePlaygroundStoredState } from "../hooks/usePlaygroundStoredState";
import { useAuth } from "../state/auth";
import { ApiError, api, type PaymasterResponse } from "../lib/api";
import {
  getBundlerClient,
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
import { SAFE_MINT_ABI } from "../lib/userOpLegacy";
import { NFT_METADATA_URI } from "../components/playground/MintSponsoredCard";
import { WalletNftsCard } from "../components/playground/WalletNftsCard";
import { useEventStream } from "../hooks/useEventStream";
import { formatEventStatusLine, parseEventStatusLine } from "../lib/events";
import { privateKeyToAccount } from "viem/accounts";

const GWEI = 1_000_000_000n;
const DEFAULT_MAX_PRIORITY_FEE = 1n * GWEI;
const DEFAULT_MAX_FEE = 30n * GWEI;
const DEFAULT_CALL_GAS_LIMIT = 1_000_000n;
const DEFAULT_PRE_VERIFICATION_GAS = 1_000_000n;
const DEFAULT_VERIFICATION_GAS_LIMIT = 500_000n;
const SIMPLE_7702_ACCOUNT =
  "0xe6Cae83BdE06E4c305530e199D7217f42808555B" as const;
const SAFE_MINT_SELECTOR = toSelector("safeMint(address,string)");
const DEMO_7702_PRIVATE_KEY =
  "0x1cd8e4cc72abb54bb073fa919e60d7b9c9b3ba35f6bccdc4c9839be8f16cd3af";
const demoAuthorizationAccount = privateKeyToAccount(DEMO_7702_PRIVATE_KEY);

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
  const [walletAddress, setWalletAddress] = useState<`0x${string}` | "">(
    demoAuthorizationAccount?.address ?? ""
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
  >(null);
  const [allowlistStatus, setAllowlistStatus] = useState("");
  const [allowlistLoading, setAllowlistLoading] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");
  const smartAccountRef = useRef<SmartAccount | null>(null);
  const [nftContractAddress, setNftContractAddress] = useState<
    `0x${string}` | ""
  >("");
  const [walletRefreshSignal, setWalletRefreshSignal] = useState(0);
  const eventForWallet = useEventStream(
    isEthAddress(walletAddress) ? (walletAddress as `0x${string}`) : undefined
  );
  const lastEventHashRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!token) return;
    let ignore = false;
    (async () => {
      try {
        const result = await api.getContractAddress("erc721", token);
        if (ignore) return;
        if (result?.address) {
          setNftContractAddress(result.address as `0x${string}`);
        }
      } catch (error) {
        if (!ignore) {
          console.error("Failed to load ERC-721 address", error);
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, [token]);

  useEffect(() => {
    lastEventHashRef.current = null;
  }, [walletAddress]);

  useEffect(() => {
    if (!eventForWallet?.userOpHash) return;
    if (lastEventHashRef.current === eventForWallet.userOpHash) return;
    lastEventHashRef.current = eventForWallet.userOpHash;
    const line = formatEventStatusLine(eventForWallet);
    setSubmitStatus((prev) => (prev ? `${prev}\n${line}` : line));
    if (eventForWallet.status?.toLowerCase() === "success") {
      setWalletRefreshSignal((prev) => prev + 1);
    }
  }, [eventForWallet]);

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
  const appendSubmitStatus = useCallback((line: string) => {
    setSubmitStatus((prev) => (prev ? `${prev}\n${line}` : line));
  }, []);

  const handleSignAuthorization = useCallback(async () => {
    setAuthorization(null);
    setPreparedOp(null);
    setAuthStatus("");
    setAuthorizationOwner(null);
    setAuthLoading(true);
    try {
      const owner = demoAuthorizationAccount.address;
      setWalletAddress(owner);

      const chainId = resolvedChainId;
      const nonce =
        nonceInput.trim().length > 0
          ? Number(nonceInput)
          : await getPublicClient().getTransactionCount({
              address: owner,
            });
      if (!Number.isFinite(nonce)) {
        throw new Error("Unable to determine nonce for demo signer.");
      }

      setAuthStatus(
        `Signing authorization via demo SimpleAccount ${shorten(
          owner
        )} (chainId=${chainId}, nonce=${nonce}).`
      );

      const nonceValue = Number(nonce);
      const authSignature = await demoAuthorizationAccount.signAuthorization({
        address: SIMPLE_7702_ACCOUNT,
        chainId,
        nonce: nonceValue,
      });

      const auth = {
        ...authSignature,
        chainId,
        nonce: nonceValue,
      } as SignedAuthorization;

      setAuthorization(auth);
      setAuthorizationOwner(owner);

      try {
        const recovered = await recoverAuthorizationAddress({
          authorization: auth,
        } as any);
        console.log(
          "[7702] recovered signer =",
          recovered,
          "expected =",
          owner
        );
        console.log(
          "[7702] serialized tuple =",
          serializeAuthorizationForDebug(auth)
        );
      } catch (e) {
        console.log("[7702] recoverAuthorizationAddress failed", e);
      }
      setAuthStatus(
        "Authorization signed with demo SimpleAccount. Proceed to Step 2."
      );
    } catch (error: any) {
      console.error(error);
      setAuthStatus(error?.message ?? "Failed to sign authorization.");
    } finally {
      setAuthLoading(false);
    }
  }, [nonceInput, resolvedChainId]);

  const handleRegisterAllowlist = useCallback(async () => {
    if (!token) {
      setAllowlistStatus("Sign in to register allowlist entries.");
      return;
    }
    const owner = authorizationOwner ?? walletAddress;
    if (!owner || !isEthAddress(owner)) {
      setAllowlistStatus("Connect your wallet first.");
      return;
    }
    if (!nftContractAddress || !isEthAddress(nftContractAddress)) {
      setAllowlistStatus("NFT contract address is not configured.");
      return;
    }
    setAllowlistLoading(true);
    try {
      await api
        .addUser(token, owner)
        .catch((error) => {
          if (error instanceof ApiError && error.status === 409) return;
          throw error;
        });
      await api
        .addContract(token, {
          address: nftContractAddress,
          name: "SENTRA_NFT",
          functions: [
            {
              selector: SAFE_MINT_SELECTOR,
              signature: "safeMint(address,string)",
            },
          ],
        })
        .catch((error) => {
          if (error instanceof ApiError && error.status === 409) return;
          throw error;
        });
      setAllowlistStatus(
        "Wallet + SENTRA NFT mint selector registered for sponsorship."
      );
    } catch (error: any) {
      console.error(error);
      setAllowlistStatus(error?.message ?? String(error));
    } finally {
      setAllowlistLoading(false);
    }
  }, [authorizationOwner, nftContractAddress, token, walletAddress]);

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
    if (!nftContractAddress || !isEthAddress(nftContractAddress)) {
      setPayloadStatus("NFT contract address is required.");
      return;
    }
    const recipient = authorizationOwner ?? walletAddress;
    if (!recipient || !isEthAddress(recipient)) {
      setPayloadStatus("Demo signer unavailable. Sign Step 1 first.");
      return;
    }
    appendPayloadStatus("Preparing sponsored UserOperation…");
    setPayloadLoading(true);
    try {
      const eoaOwner = recipient;
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
      const eoaSender = eoaOwner as `0x${string}`;

      const mintData = encodeFunctionData({
        abi: SAFE_MINT_ABI,
        functionName: "safeMint",
        args: [recipient as `0x${string}`, NFT_METADATA_URI],
      });

      const prepared = await bundler.prepareUserOperation({
        calls: [{ to: nftContractAddress as `0x${string}`, data: mintData }],
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
          target: nftContractAddress as `0x${string}`,
          selector: SAFE_MINT_SELECTOR,
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
          target: nftContractAddress as `0x${string}`,
          selector: SAFE_MINT_SELECTOR,
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

      const opBeforeAuth: PreparedOperation = {
        ...(sponsoredOp as PreparedOperation),
        callGasLimit: estimateResult.callGasLimit,
        verificationGasLimit: estimateResult.verificationGasLimit,
        preVerificationGas: estimateResult.preVerificationGas,
        authorization: normalizedAuth ?? undefined,
      };
      const opWithEstimates = applyAuthorizationToUserOperation(
        opBeforeAuth,
        normalizedAuth
      );
      smartAccountRef.current = smartAccount;
      setPreparedUnsignedOp(opWithEstimates);
      setPreparedOp(opWithEstimates);
      setPreparedContext({
        entryPoint: entryPoint as `0x${string}`,
        chainId,
        target: nftContractAddress as `0x${string}`,
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
        console.log(
          "[7702] final authorization tuple =",
          (opWithEstimates as any).authorizationList
        );
      }
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
    authorization,
    entryPoint,
    nftContractAddress,
    resolvedChainId,
    token,
    authorizationOwner,
    walletAddress,
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
    if (!authorization) {
      setSubmitStatus("Sign the EIP-7702 authorization again before sending.");
      return;
    }
    setSubmitLoading(true);
    setSubmitStatus("1. Adjusting gas plan with your sliders…");
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

      appendSubmitStatus("2. Requesting paymaster sponsorship…");
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
          selector: SAFE_MINT_SELECTOR,
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

      appendSubmitStatus("3. Signing UserOperation via wallet…");
      const smartAccount = smartAccountRef.current;
      const normalizedAuth = authorization;
      const signature = await smartAccount.signUserOperation(opWithPaymaster);
      const signedOp = {
        ...opWithPaymaster,
        signature,
      };
      const finalSignedOp = applyAuthorizationToUserOperation(
        signedOp,
        normalizedAuth
      );
      console.log("[7702] final UO before send", {
        sender: finalSignedOp.sender,
        authorization: (finalSignedOp as any).authorization,
        authorizationList: (finalSignedOp as any).authorizationList,
        eip7702Auth: (finalSignedOp as any).eip7702Auth,
      });
      setPreparedOp(finalSignedOp);

      const bundlerSendClient = getBundlerClient(preparedContext.chainId);
      appendSubmitStatus("4. Sending UserOperation to bundler…");
      const hash = await bundlerSendClient.sendUserOperation({
        entryPointAddress: preparedContext.entryPoint,
        ...(finalSignedOp as any),
      });
      appendSubmitStatus(`   Bundler accepted. Hash: ${hash}`);
      appendSubmitStatus("5. Waiting for confirmation…");
      const receipt = await bundlerSendClient.waitForUserOperationReceipt({
        hash,
      });
      appendSubmitStatus(
        `6. Confirmed in block ${receipt.receipt.blockNumber}.`
      );
    } catch (error: any) {
      console.error(error);
      appendSubmitStatus(`failed: ${error?.message ?? String(error)}`);
    } finally {
      setSubmitLoading(false);
    }
  }, [
    appendSubmitStatus,
    authorization,
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
        <h3 className="text-xl font-semibold text-slate-50">
          7702 Delegation + ERC-4337 Paymaster
        </h3>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-200">
          <li>
            Use <span className="font-mono">signAuthorization</span> to delegate
            your wallet to our Simple7702Account implementation.
          </li>
          <li>
            Submit a Type-4 transaction (EIP-7702) from the same wallet so it
            temporarily behaves like a smart account.
          </li>
          <li>
            Inside that transaction, send an ERC-4337 UserOperation that mints
            the SENTRA NFT to your wallet, and let the Paymaster sponsor the
            gas.
          </li>
        </ol>
        <div className="rounded border border-slate-700/60 bg-slate-900/40 p-4 text-sm text-slate-300">
          {paymasterSummary}
        </div>
      </section>

      <section className="surface-card space-y-4 p-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Step 1
            </div>
            <h3 className="text-lg font-semibold text-slate-50">
              Generate EIP-7702 Authorization
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Your MetaMask wallet signs the lightweight 7702 authorization that
              powers the sponsored mint.
            </p>
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
            Demo signer:{" "}
            <span className="font-mono">
              {walletAddress ? walletAddress : "Not configured"}
            </span>
          </div>
          <div className="mt-1 text-amber-200/80">
            This built-in demo SimpleAccount signs the EIP-7702 authorization
            and receives the SENTRA NFT.
          </div>
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
          <div className="rounded border border-emerald-400/30 bg-emerald-400/5 p-3 text-xs text-emerald-200">
            Authorization signed and stored locally for the next step.
          </div>
        ) : null}
      </section>

      <section className="surface-card space-y-4 p-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Step 2
            </div>
            <h3 className="text-lg font-semibold text-slate-50">
              Build Sponsored NFT Mint
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Register the allowlist pair, fetch the bundler gas plan, and
              inspect the sliders before you submit.
            </p>
          </div>
          <div className="flex flex-row flex-wrap gap-3 md:flex-nowrap">
            <button
              onClick={handleRegisterAllowlist}
              className="btn-secondary"
              disabled={allowlistLoading}
            >
              {allowlistLoading ? "Registering…" : "Register Sponsorship"}
            </button>
            <button
              onClick={handlePrepareUserOperation}
              className="btn-primary"
              disabled={payloadLoading}
            >
              {payloadLoading ? "Preparing…" : "Prepare UserOp"}
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
            label="NFT Recipient"
            value={walletAddress}
            placeholder="Connected wallet"
          />
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
          <div className="rounded border border-emerald-400/30 bg-emerald-400/5 p-3 text-xs text-emerald-200">
            UserOperation ready. Adjust gas sliders if needed, then submit.
          </div>
        ) : null}
      </section>

      <section className="surface-card space-y-4 p-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Step 3
            </div>
            <h3 className="text-lg font-semibold text-slate-50">
              Submit UserOperation via Bundler
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Fire the final sponsored transaction. Progress appears in the
              shipping log and a details link shows up when confirmed.
            </p>
          </div>
          <button
            onClick={handleSubmitUserOperation}
            className="btn-primary"
            disabled={
              submitLoading ||
              !preparedUnsignedOp ||
              !gasEstimates ||
              !preparedContext ||
              !authorization
            }
          >
            {submitLoading ? "Submitting…" : "Send UserOperation"}
          </button>
        </header>
        {submitStatus && <StatusLog title="Submission" value={submitStatus} />}
      </section>

      <WalletNftsCard
        owner={walletAddress}
        authToken={token}
        title="Demo Wallet Holdings"
        subtitle="SENTRA NFTs currently held by the built-in demo SimpleAccount."
        disconnectedMessage="Demo signer not available."
        emptyMessage={null}
        loadingMessage="Loading demo wallet holdings…"
        refreshSignal={walletRefreshSignal}
      />
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
  onChange?: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="mb-1 block text-sm text-slate-400">{label}</label>
      <input
        className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm outline-none"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        readOnly={!onChange}
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
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return (
    <div className="surface-card surface-card--muted p-3 text-xs text-slate-200">
      <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
        {title}
      </div>
      {lines.length === 0 ? (
        <div className="text-slate-400">No activity yet.</div>
      ) : (
        <ol className="space-y-2">
          {lines.map((line, index) => {
            const eventData = parseEventStatusLine(line);
            if (eventData) {
              const eventStatus = eventData.status?.toLowerCase();
              const dotClass =
                eventStatus === "success"
                  ? "bg-emerald-500"
                  : eventStatus === "failed"
                  ? "bg-rose-500"
                  : "bg-slate-600";
              const textClass =
                eventStatus === "success"
                  ? "text-emerald-300"
                  : eventStatus === "failed"
                  ? "text-rose-300"
                  : "text-slate-200";
              return (
                <li
                  key={`${line}-${index}`}
                  className="flex items-start gap-3"
                >
                  <div className="mt-[3px] flex flex-col items-center">
                    <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                    {index < lines.length - 1 && (
                      <span className="mt-1 h-4 w-px bg-slate-700" />
                    )}
                  </div>
                  <span className={`${textClass} flex flex-wrap items-center gap-2`}>
                    Bundler reported {eventData.status ?? "update"}.
                    {eventData.userOpHash ? (
                      <Link
                        to={`/app/details/${eventData.userOpHash}`}
                        className="text-emerald-200 underline"
                      >
                        View details
                      </Link>
                    ) : null}
                  </span>
                </li>
              );
            }
            const isError = line.toLowerCase().startsWith("failed");
            const isDone =
              line.toLowerCase().includes("submitted") ||
              line.toLowerCase().includes("confirmed");
            const isActive = !isError && !isDone && index === lines.length - 1;
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
                  {index < lines.length - 1 && (
                    <span className="mt-1 h-4 w-px bg-slate-700" />
                  )}
                </div>
                <span className={textClass}>{line}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
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

function applyAuthorizationToUserOperation<T extends Record<string, any>>(
  op: T,
  auth: SignedAuthorization | null
): T {
  const next = { ...op } as Record<string, any>;
  delete next.authorizationList;
  delete next.eip7702Auth;

  if (!auth) {
    delete next.authorization;
    return next as T;
  }

  const chainIdBig =
    typeof auth.chainId === "bigint"
      ? (auth.chainId as bigint)
      : BigInt(auth.chainId);
  const nonceBig =
    typeof auth.nonce === "bigint" ? (auth.nonce as bigint) : BigInt(auth.nonce);

  const normalizedAuth = {
    ...auth,
    address:
      ((auth as any).address?.toLowerCase?.() as `0x${string}`) ??
      ((auth.address ?? "") as `0x${string}`),
    chainId: Number(chainIdBig),
    nonce: typeof auth.nonce === "number" ? auth.nonce : Number(nonceBig),
  } as SignedAuthorization;

  (next as any).authorization = normalizedAuth;

  const tuple = serializeAuthorizationForBundler({
    ...normalizedAuth,
    chainId: chainIdBig,
    nonce: nonceBig,
  });
  if (tuple) {
    (next as any).authorizationList = [tuple];
  }

  const normalizedV =
    typeof auth.v === "bigint"
      ? Number(auth.v)
      : typeof auth.v === "string"
      ? Number(auth.v)
      : auth.v ?? 27;
  const yParityValue = auth.yParity ?? (normalizedV === 28 ? 1 : 0);
  const eip7702Entry = {
    address: normalizedAuth.address,
    chainId: toHex(chainIdBig),
    nonce: toHex(nonceBig),
    r: normalizedAuth.r,
    s: normalizedAuth.s,
    yParity: toHex(BigInt(yParityValue)),
  };
  (next as any).eip7702Auth = eip7702Entry;

  return next as T;
}

function shorten(value: `0x${string}`) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
