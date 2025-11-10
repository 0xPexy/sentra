import { useMemo, useState, type ReactNode } from "react";
import PageHeader from "../components/layout/PageHeader";
import { useAuth } from "../state/auth";
import { isEthAddress } from "../lib/address";
import {
  getPublicClient,
  getWalletClient,
  getSimpleSmartAccount,
  getBundlerClientBySimpleAccount,
  getPaymasterClient,
} from "../lib/viem";
import {
  SAFE_MINT_ABI,
  EXECUTE_ABI,
  packAccountGasLimits,
  packGasFees,
  buildPaymasterAndData,
  buildFactoryData,
  DUMMY_SIGNATURE,
} from "../lib/userOpLegacy";
import { encodeFunctionData, parseAbi } from "viem";
import { usePlaygroundStoredState } from "../hooks/usePlaygroundStoredState";
import { getUserOperationTypedData } from "viem/account-abstraction";
import { toSelector } from "../lib/selectors";

type ButtonProps = {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

function PrimaryButton({ children, onClick, disabled }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, disabled }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-indigo-500 px-3 py-2 text-sm font-medium text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

type SimulationPreset =
  | "AA10_ALREADY_CONSTRUCTED"
  | "AA21_PAYMASTER_PREFUND"
  | "AA23_VALIDATION_GAS"
  | "AA24_SIGNATURE_ERROR"
  | "AA25_INVALID_NONCE"
  | "AA32_PAYMASTER_WINDOW"
  | "AA33_PAYMASTER_VALIDATION"
  | "AA34_PAYMASTER_SIGNATURE"
  | "AA90_INVALID_BENEFICIARY";

type SimulationMode = "bad" | "fix";

type SimulationResult = {
  status: "idle" | "loading" | "success" | "error";
  code?: string;
  message?: string;
  raw?: any;
  note?: string;
};

const ENTRY_POINT_ABI = parseAbi([
  "function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)[] ops,address beneficiary)",
]);

const DEFAULT_MAX_FEE = 30_000_000_000n;
const DEFAULT_PRIORITY_FEE = 1_000_000_000n;
const DEFAULT_CALL_GAS = 1_000_000n;
const DEFAULT_VERIFICATION_GAS = 500_000n;
const DEFAULT_PRE_VERIFICATION_GAS = 1_000_000n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const SAFE_MINT_SELECTOR = toSelector("safeMint(address,string)");

export default function Simulator() {
  const { token } = useAuth();
  const { storedState } = usePlaygroundStoredState();
  const lastDeploy = storedState.lastDeploy;
  const [form, setForm] = useState({
    entryPoint: storedState.paymasterEntryPoint ?? "",
    factory: storedState.simpleAccountFactory ?? "",
    owner: storedState.simpleAccountOwner ?? "",
    sender: storedState.simpleAccount ?? "",
    salt: storedState.lastSalt ?? "0",
    target: lastDeploy?.address ?? "",
    recipient: storedState.simpleAccountOwner ?? "",
  });

  type FormState = typeof form;
type SimulationCardConfig = {
  preset: SimulationPreset;
  title: string;
  description: string;
  badInput: (state: FormState) => string;
  fixTip: (state: FormState) => string;
};

  const createPresetResults = () => ({
    bad: { status: "idle" as const },
    fix: { status: "idle" as const },
  });

  const [results, setResults] = useState<
    Record<SimulationPreset, { bad: SimulationResult; fix: SimulationResult }>
  >({
    AA10_ALREADY_CONSTRUCTED: createPresetResults(),
    AA21_PAYMASTER_PREFUND: createPresetResults(),
    AA23_VALIDATION_GAS: createPresetResults(),
    AA24_SIGNATURE_ERROR: createPresetResults(),
    AA25_INVALID_NONCE: createPresetResults(),
    AA32_PAYMASTER_WINDOW: createPresetResults(),
    AA33_PAYMASTER_VALIDATION: createPresetResults(),
    AA34_PAYMASTER_SIGNATURE: createPresetResults(),
    AA90_INVALID_BENEFICIARY: createPresetResults(),
  });

  const presets = useMemo<SimulationCardConfig[]>(
    () =>
      [
        {
          preset: "AA10_ALREADY_CONSTRUCTED" as SimulationPreset,
          title: "AA10 — Already Constructed",
          description:
            "Inject initCode for an already deployed smart account to trigger AA10.",
          badInput: (state) =>
            `initCode = factory.createAccount(owner=${shorten(state.owner)}, salt=${state.salt})`,
          fixTip: () => "initCode removed (reuse deployed account).",
        },
        {
          preset: "AA21_PAYMASTER_PREFUND" as SimulationPreset,
          title: "AA21 — Prefund Not Paid",
          description:
            "Route the UserOp through the paymaster client decorator so EntryPoint never receives the prefund (AA21).",
          badInput: () => "paymaster client decorator (no prefund deposit)",
          fixTip: () =>
            "paymaster = resolved paymaster address/data (prefund paid).",
        },
        {
          preset: "AA23_VALIDATION_GAS" as SimulationPreset,
          title: "AA23 — Validation Reverted (or OOG)",
          description:
            "Drop the verification gas limit until account validation reverts or runs out of gas.",
          badInput: () => "verificationGasLimit = 1",
          fixTip: () =>
            "verificationGasLimit restored to prepared EntryPoint estimate.",
        },
        {
          preset: "AA24_SIGNATURE_ERROR" as SimulationPreset,
          title: "AA24 — Signature Error",
          description:
            "Sign the UserOp with a mismatched EIP-712 domain to reproduce AA24 signature errors.",
          badInput: () => "verifyingContract = 0x0000… (wrong domain)",
          fixTip: (state) => `verifyingContract = ${shorten(state.entryPoint)}`,
        },
        {
          preset: "AA25_INVALID_NONCE" as SimulationPreset,
          title: "AA25 — Invalid Nonce",
          description:
            "Reuse a stale nonce from the previous UserOp to trigger AA25.",
          badInput: () => "nonce = previous nonce (reused)",
          fixTip: (state) =>
            `nonce = EntryPoint.getNonce(${shorten(state.sender)}, key=0)`,
        },
        {
          preset: "AA32_PAYMASTER_WINDOW" as SimulationPreset,
          title: "AA32 — Paymaster Expired or Not Due",
          description:
            "Advance the simulated block timestamp beyond the paymaster's validity window to trigger AA32.",
          badInput: () => "simulationTimestamp = now + 90m",
          fixTip: () => "simulationTimestamp = latest block time",
        },
        {
          preset: "AA33_PAYMASTER_VALIDATION" as SimulationPreset,
          title: "AA33 — Paymaster Reverted (or OOG)",
          description:
            "Shrink the paymaster verification gas limit until validation reverts or runs out of gas.",
          badInput: () => "paymasterVerificationGasLimit = 1",
          fixTip: () =>
            "paymasterVerificationGasLimit restored to stub estimate.",
        },
        {
          preset: "AA34_PAYMASTER_SIGNATURE" as SimulationPreset,
          title: "AA34 — Paymaster Signature Error",
          description:
            "Corrupt the paymaster signature so validation fails with AA34.",
          badInput: () => "paymasterData suffix replaced with dummy signature",
          fixTip: () => "paymasterData signed payload intact.",
        },
        {
          preset: "AA90_INVALID_BENEFICIARY" as SimulationPreset,
          title: "AA90 — Invalid Beneficiary",
          description:
            "Set the handleOps beneficiary to address(0) to trigger AA90.",
          badInput: () => "beneficiary = address(0)",
          fixTip: (state) =>
            `beneficiary = ${shorten(
              state.owner || state.sender || state.entryPoint
            )}`,
        },
      ] satisfies SimulationCardConfig[],
    []
  );

  const tenderlyRpc = import.meta.env.VITE_RPC_URL;

  const updateForm = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSimulate = async (
    preset: SimulationPreset,
    mode: SimulationMode
  ) => {
    if (!token) {
      setResults((prev) => {
        const current = prev[preset] ?? createPresetResults();
        return {
          ...prev,
          [preset]: {
            ...current,
            [mode]: { status: "error", message: "Login is required." },
          },
        };
      });
      return;
    }

    if (!isEthAddress(form.entryPoint)) {
      setResults((prev) => {
        const current = prev[preset] ?? createPresetResults();
        return {
          ...prev,
          [preset]: {
            ...current,
            [mode]: {
              status: "error",
              message: "Check the EntryPoint address.",
            },
          },
        };
      });
      return;
    }
    if (!isEthAddress(form.sender)) {
      setResults((prev) => {
        const current = prev[preset] ?? createPresetResults();
        return {
          ...prev,
          [preset]: {
            ...current,
            [mode]: {
              status: "error",
              message: "Check the Simple Account address.",
            },
          },
        };
      });
      return;
    }
    if (!isEthAddress(form.factory)) {
      setResults((prev) => {
        const current = prev[preset] ?? createPresetResults();
        return {
          ...prev,
          [preset]: {
            ...current,
            [mode]: {
              status: "error",
              message: "Check the factory address.",
            },
          },
        };
      });
      return;
    }
    if (!isEthAddress(form.target)) {
      setResults((prev) => {
        const current = prev[preset] ?? createPresetResults();
        return {
          ...prev,
          [preset]: {
            ...current,
            [mode]: {
              status: "error",
              message: "Check the target contract address.",
            },
          },
        };
      });
      return;
    }
    if (!isEthAddress(form.recipient)) {
      setResults((prev) => {
        const current = prev[preset] ?? createPresetResults();
        return {
          ...prev,
          [preset]: {
            ...current,
            [mode]: {
              status: "error",
              message: "Check the recipient address.",
            },
          },
        };
      });
      return;
    }

    let saltBigInt: bigint;
    try {
      saltBigInt = BigInt(form.salt || "0");
    } catch {
      setResults((prev) => {
        const current = prev[preset] ?? createPresetResults();
        return {
          ...prev,
          [preset]: {
            ...current,
            [mode]: { status: "error", message: "Salt must be an integer." },
          },
        };
      });
      return;
    }

    setResults((prev) => {
      const current = prev[preset] ?? createPresetResults();
      return {
        ...prev,
        [preset]: {
          ...current,
          [mode]: {
            status: "loading",
            message:
              mode === "bad"
                ? "Simulating with invalid input…"
                : "Simulating with corrected input…",
          },
        },
      };
    });

    let scenarioNote: string | undefined;
    try {
      const walletClient = await getWalletClient();
      const publicClient = getPublicClient();
      const simpleAccount = await getSimpleSmartAccount(
        form.sender as `0x${string}`,
        publicClient,
        walletClient,
        form.factory as `0x${string}`,
        saltBigInt
      );

      const bundler = getBundlerClientBySimpleAccount(simpleAccount);
      const chainId = await publicClient.getChainId();

      const safeMintData = encodeFunctionData({
        abi: SAFE_MINT_ABI,
        functionName: "safeMint",
        args: [
          form.recipient as `0x${string}`,
          "http://localhost:8080/api/v1/playground/nft",
        ],
      });

      const prepared = await bundler.prepareUserOperation({
        calls: [{ to: form.target as `0x${string}`, data: safeMintData }],
        callGasLimit: DEFAULT_CALL_GAS,
        verificationGasLimit: DEFAULT_VERIFICATION_GAS,
        preVerificationGas: DEFAULT_PRE_VERIFICATION_GAS,
        maxFeePerGas: DEFAULT_MAX_FEE,
        maxPriorityFeePerGas: DEFAULT_PRIORITY_FEE,
      });

      const {
        account: _preparedAccount,
        paymasterAndData: _preparedPaymasterAndData,
        initCode: preparedInitCode,
        ...preparedOperation
      } = prepared;

      const sanitizedPreparedOperation = preparedInitCode && preparedInitCode !== ("0x" as `0x${string}`)
        ? { ...preparedOperation, initCode: preparedInitCode }
        : { ...preparedOperation };

      const paymasterClient = getPaymasterClient(token);
      const useDecorator = preset === "AA21_PAYMASTER_PREFUND" && mode === "bad";
      let baseOp = { ...sanitizedPreparedOperation };

      if (useDecorator) {
        console.debug(
          "[simulator] using paymaster decorator (prefund withheld) to trigger AA21"
        );
      } else {
        const paymasterStub = await paymasterClient.getPaymasterStubData({
          ...sanitizedPreparedOperation,
          entryPointAddress: form.entryPoint as `0x${string}`,
          chainId,
          context: {
            target: form.target as `0x${string}`,
            selector: SAFE_MINT_SELECTOR,
          },
        });

        baseOp = {
          ...sanitizedPreparedOperation,
          paymaster: paymasterStub.paymaster,
          paymasterData: paymasterStub.paymasterData,
          paymasterVerificationGasLimit:
            paymasterStub.paymasterVerificationGasLimit,
          paymasterPostOpGasLimit: paymasterStub.paymasterPostOpGasLimit,
        };

        const paymasterData = await paymasterClient.getPaymasterData({
          ...baseOp,
          entryPointAddress: form.entryPoint as `0x${string}`,
          chainId,
          context: {
            target: form.target as `0x${string}`,
            selector: SAFE_MINT_SELECTOR,
          },
        });

        baseOp.paymaster = paymasterData.paymaster;
        baseOp.paymasterData = paymasterData.paymasterData;
        baseOp.paymasterVerificationGasLimit =
          paymasterData.paymasterVerificationGasLimit;
        baseOp.paymasterPostOpGasLimit = paymasterData.paymasterPostOpGasLimit;
      }

      const { operation: mutated, note, beneficiary: overrideBeneficiary } =
        await mutateForPreset({
          preset,
          operation: baseOp,
          walletClient,
          simpleAccount,
          factory: form.factory as `0x${string}`,
        owner: form.owner as `0x${string}`,
        salt: saltBigInt,
        mode,
          chainId,
          entryPoint: form.entryPoint as `0x${string}`,
        });
      scenarioNote =
        note ??
        presets
          .find((cfg) => cfg.preset === preset)
          ?.[mode === "bad" ? "badInput" : "fixTip"](form);

      const paymasterAndData = buildPaymasterAndData(
        mutated.paymaster,
        mutated.paymasterVerificationGasLimit,
        mutated.paymasterPostOpGasLimit,
        mutated.paymasterData
      );

      const signature =
        mutated.signature ??
        (await simpleAccount.signUserOperation({
          ...mutated,
          paymasterAndData,
        }));

      const packed = packOperation({
        ...mutated,
        paymasterAndData,
        signature,
      });

      const defaultBeneficiary =
        (await walletClient.getAddresses())?.[0] ?? form.owner ?? form.sender;
      const beneficiary = overrideBeneficiary ?? defaultBeneficiary;

      const simulationCalldata = encodeFunctionData({
        abi: ENTRY_POINT_ABI,
        functionName: "handleOps",
        args: [[packed], beneficiary],
      });

      const futureTimeHex =
        preset === "AA32_PAYMASTER_WINDOW" && mode === "bad"
          ? `0x${BigInt(Math.floor(Date.now() / 1000) + 90 * 60).toString(16)}`
          : undefined;

      const tenderlyParams = futureTimeHex
        ? [
            {
              from: beneficiary,
              to: form.entryPoint,
              gas: "0x7a1200",
              gasPrice: "0x0",
              value: "0x0",
              data: simulationCalldata,
            },
            "latest",
            {},
            { time: futureTimeHex },
          ]
        : [
            {
              from: beneficiary,
              to: form.entryPoint,
              gas: "0x7a1200",
              gasPrice: "0x0",
              value: "0x0",
              data: simulationCalldata,
            },
            "latest",
            {},
          ];

      const payload = {
        id: Date.now(),
        jsonrpc: "2.0",
        method: "tenderly_simulateTransaction",
        params: tenderlyParams,
      };

      const response = await fetch(tenderlyRpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      console.log(json);
      const code = extractErrorCode(json);
      const readableError = extractReadableError(json);
      const simStatus = json?.result?.status;
      const simulationSucceeded = simStatus === true;
      const panelStatus: SimulationResult["status"] = simulationSucceeded
        ? "success"
        : "error";
      const errorMessage =
        readableError ??
        (code ? `Detected code: ${code}` : "Simulation response requires review.");
      setResults((prev) => {
        const current = prev[preset] ?? createPresetResults();
        return {
          ...prev,
          [preset]: {
            ...current,
            [mode]: {
              status: panelStatus,
              code: simulationSucceeded ? undefined : code,
              message: simulationSucceeded
                ? "Simulation succeeded."
                : errorMessage,
              raw: json,
              note: scenarioNote,
            },
          },
        };
      });
    } catch (error: any) {
      console.error(error);
      setResults((prev) => {
        const current = prev[preset] ?? createPresetResults();
        return {
          ...prev,
          [preset]: {
            ...current,
            [mode]: {
              status: "error",
              message: error?.message ?? String(error),
              note: scenarioNote,
            },
          },
        };
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Simulator" />

      <section className="rounded-xl border border-slate-800 bg-[#151A28] p-4 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200">
          Base Configuration
        </h3>
        <div className="grid gap-3 md:grid-cols-3">
          <LabeledInput
            label="Entry Point"
            value={form.entryPoint}
            onChange={(value) => updateForm("entryPoint", value)}
            placeholder="0xEntryPoint"
          />
          <LabeledInput
            label="Simple Account (Sender)"
            value={form.sender}
            onChange={(value) => updateForm("sender", value)}
            placeholder="0xSender"
          />
          <LabeledInput
            label="Owner (EOA)"
            value={form.owner}
            onChange={(value) => updateForm("owner", value)}
            placeholder="0xOwner"
          />
          <LabeledInput
            label="Factory"
            value={form.factory}
            onChange={(value) => updateForm("factory", value)}
            placeholder="0xFactory"
          />
          <LabeledInput
            label="Salt"
            value={form.salt}
            onChange={(value) => updateForm("salt", value)}
            placeholder="0"
          />
          <LabeledInput
            label="Target (ERC-721)"
            value={form.target}
            onChange={(value) => updateForm("target", value)}
            placeholder="0xTarget"
          />
          <LabeledInput
            label="Recipient"
            value={form.recipient}
            onChange={(value) => updateForm("recipient", value)}
            placeholder="0xRecipient"
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {presets.map((card) => {
          const result =
            results[card.preset] ?? createPresetResults();
          return (
            <div
              key={card.preset}
              className="rounded-xl border border-slate-800 bg-[#151A28] p-4 space-y-3"
            >
              <div>
                <div className="text-sm font-semibold text-slate-200">
                  {card.title}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {card.description}
                </div>
                <div className="mt-2 space-y-1 text-xs">
                  <div className="text-slate-400">
                    Wrong input: <span className="text-slate-200">{card.badInput(form)}</span>
                  </div>
                  <div className="text-emerald-300">
                    Right input: {card.fixTip(form)}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <PrimaryButton
                  onClick={() => handleSimulate(card.preset, "bad")}
                  
                  disabled={result.bad.status === "loading"}
                >
                  {result.bad.status === "loading" ? "Simulating…" : "Run Error Scenario"}
                </PrimaryButton>
                <SecondaryButton
                  onClick={() => handleSimulate(card.preset, "fix")}
                  
                  disabled={result.fix.status === "loading"}
                >
                  {result.fix.status === "loading" ? "Simulating…" : "Run Fixed Scenario"}
                </SecondaryButton>
              </div>
              <ResultPanel title="Error Scenario" result={result.bad} />
              <ResultPanel title="Fixed Scenario" result={result.fix} />
            </div>
          );
        })}
      </section>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      {label}
      <input
        className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

async function mutateForPreset(params: {
  preset: SimulationPreset;
  operation: any;
  walletClient: Awaited<ReturnType<typeof getWalletClient>>;
  simpleAccount: Awaited<ReturnType<typeof getSimpleSmartAccount>>;
  factory: `0x${string}`;
  owner: `0x${string}`;
  salt: bigint;
  mode: SimulationMode;
  chainId: number;
  entryPoint: `0x${string}`;
}) {
  const {
    preset,
    operation,
    factory,
    owner,
    salt,
    mode,
    chainId,
    entryPoint,
  } = params;
  const op = { ...operation };
  delete op.signature;
  let note: string | undefined;
  let beneficiary: `0x${string}` | undefined;

  if (mode === "fix") {
    note = buildFixNote(preset, op, entryPoint);
    return { operation: op, note, beneficiary };
  }

  switch (preset) {
    case "AA23_VALIDATION_GAS":
      op.verificationGasLimit = 1n;
      note =
        "Wrong input: verificationGasLimit lowered to 1 (validation runs out of gas).";
      break;
    case "AA24_SIGNATURE_ERROR":
      try {
        const typedData = getUserOperationTypedData({
          chainId,
          entryPointAddress: "0x0000000000000000000000000000000000000000",
          userOperation: {
            ...op,
            signature: "0x",
          },
        });
        const [account] = await params.walletClient.getAddresses();
        op.signature = await params.walletClient.signTypedData({
          account,
          domain: typedData.domain,
          types: typedData.types,
          primaryType: typedData.primaryType,
          message: typedData.message,
        });
      } catch (error) {
        console.error(
          "Failed to create mismatched EIP-712 signature; falling back to dummy signature.",
          error
        );
        op.signature = DUMMY_SIGNATURE;
      }
      note = "Wrong input: verifyingContract = 0x0000… (mismatched domain)";
      break;
    case "AA32_PAYMASTER_WINDOW":
      note =
        "Wrong input: simulation time advanced beyond paymaster validity window.";
      break;
    case "AA33_PAYMASTER_VALIDATION":
      op.paymasterVerificationGasLimit = 1n;
      note =
        "Wrong input: paymasterVerificationGasLimit reduced to 1 (validation out of gas).";
      break;
    case "AA34_PAYMASTER_SIGNATURE":
      if (op.paymasterData && op.paymasterData !== "0x") {
        const dummy = DUMMY_SIGNATURE.slice(2);
        const current = op.paymasterData.slice(2);
        const prefixLength = Math.max(0, current.length - dummy.length);
        const prefix = current.slice(0, prefixLength);
        op.paymasterData = (`0x${prefix}${dummy}`) as `0x${string}`;
      } else {
        op.paymasterData = DUMMY_SIGNATURE;
      }
      note = "Wrong input: paymaster signature replaced with dummy bytes.";
      break;
    case "AA10_ALREADY_CONSTRUCTED":
      op.factory = factory;
      op.factoryData = buildFactoryData(owner, salt);
      op.initCode = (factory as string) + op.factoryData.slice(2);
      note =
        "Wrong input: initCode provided for an already deployed smart account.";
      break;
    case "AA25_INVALID_NONCE":
      if (typeof op.nonce === "bigint") {
        op.nonce = op.nonce === 0n ? 0n : op.nonce - 1n;
      }
      note = "Wrong input: reused previous nonce for the User Operation.";
      break;
    case "AA90_INVALID_BENEFICIARY":
      beneficiary = ZERO_ADDRESS;
      note = "Wrong input: beneficiary forced to address(0).";
      break;
  }

  return { operation: op, note, beneficiary };
}

function buildFixNote(
  preset: SimulationPreset,
  op: any,
  entryPoint: `0x${string}`
) {
  switch (preset) {
    case "AA23_VALIDATION_GAS":
      return "Right input: verificationGasLimit kept at prepared estimate.";
    case "AA24_SIGNATURE_ERROR":
      return `Right input: verifyingContract = ${entryPoint} (correct EIP-712 domain).`;
    case "AA32_PAYMASTER_WINDOW":
      return "Right input: simulation timestamp aligned with latest block time.";
    case "AA33_PAYMASTER_VALIDATION":
      return "Right input: sufficient paymasterVerificationGasLimit restored.";
    case "AA34_PAYMASTER_SIGNATURE":
      return "Right input: paymaster signature verified.";
    case "AA10_ALREADY_CONSTRUCTED":
      return "Right input: initCode omitted for already deployed account.";
    case "AA25_INVALID_NONCE":
      return `Right input: nonce = EntryPoint.getNonce(${op.sender}, 0).`;
    case "AA90_INVALID_BENEFICIARY":
      return "Right input: beneficiary set to a non-zero address.";
    default:
      return undefined;
  }
}

function packOperation(op: any) {
  const paymasterAndData =
    op.paymasterAndData ??
    buildPaymasterAndData(
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



function shorten(value?: string, head = 6) {
  if (!value) return "-";
  if (value.length <= head * 2 + 2) return value;
  return `${value.slice(0, head + 2)}…${value.slice(-head)}`;
}

function extractErrorCode(response: any): string | undefined {
  const message =
    response?.error?.message ?? response?.result?.error?.message ?? "";
  const regex = /(AA\d{2})/;
  const match = regex.exec(message);
  if (match) return match[1];
  return undefined;
}

function extractReadableError(response: any): string | undefined {
  const status = response?.result?.status;
  if (status === false) {
    const traceEntry = response?.result?.trace?.[0];
    if (traceEntry) {
      const error = traceEntry?.error ?? "";
      const reasonRaw =
        traceEntry?.errorReason ??
        traceEntry?.revertReason ??
        response?.result?.error?.message ??
        "";
      const reason = trimNullChars(reasonRaw);
      const combined = [error, reason]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(": ");
      if (combined) return combined;
    }
    const trace = response?.result?.trace;
    if (Array.isArray(trace) && trace.length > 0) {
      const fallbackEntry = trace[trace.length - 1];
      const fallbackError = fallbackEntry?.error
        ? trimNullChars(String(fallbackEntry.error))
        : undefined;
      if (fallbackError) {
        return `execution reverted: ${fallbackError}`;
      }
    }
    return "Simulation failed. Please inspect the trace.";
  }
  const message =
    response?.error?.message ?? response?.result?.error?.message ?? "";
  return trimNullChars(message) || undefined;
}

function trimNullChars(value: string) {
  if (typeof value !== "string") return value;
  return value.replace(/\u0000/g, "").trim();
}



function ResultPanel({
  title,
  result,
}: {
  title: string;
  result: SimulationResult;
}) {
  if (result.status === "idle") return null;
  const statusClass =
    result.status === "success"
      ? "text-emerald-400"
      : result.status === "error"
      ? "text-rose-400"
      : "text-slate-300";
  return (
    <div className="rounded border border-slate-700 bg-[#0f1422] p-3 text-xs text-slate-200">
      <div className="font-semibold">{title}</div>
      <div className="mt-1">
        Status: <span className={statusClass}>{result.status}</span>
      </div>
      {result.code ? <div>Code: {result.code}</div> : null}
      {result.message ? (
        <div className="mt-1 text-slate-300">{result.message}</div>
      ) : null}
    </div>
  );
}
