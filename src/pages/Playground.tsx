import PageHeader from "../components/layout/PageHeader";
import { CalculateSimpleAccountCard } from "../components/playground/CalculateSimpleAccountCard";
import { DeployERC721Card } from "../components/playground/DeployERC721Card";
import { MintSponsoredCard } from "../components/playground/MintSponsoredCard";
import { usePlaygroundStoredState } from "../hooks/usePlaygroundStoredState";
import { useAuth } from "../state/auth";

export default function Playground() {
  const { storedState, updateStoredState } = usePlaygroundStoredState();
  const { token } = useAuth();

  const lastDeploy = storedState.lastDeploy ?? null;
  const defaultMintSender =
    storedState.simpleAccount && storedState.simpleAccount.length > 0
      ? storedState.simpleAccount
      : storedState.minter || lastDeploy?.minter || "";

  return (
    <div className="space-y-8">
      <PageHeader title="Playground" />
      <CalculateSimpleAccountCard
        storedState={storedState}
        updateStoredState={updateStoredState}
        suggestedEntryPoint={storedState.paymasterEntryPoint ?? ""}
        authToken={token}
        onCalculated={({ address, owner, salt, factory }) => {
          updateStoredState({
            simpleAccount: address,
            minter: address,
            simpleAccountOwner: owner,
            simpleAccountFactory: factory,
            lastSalt: salt.toString(),
          });
        }}
      />
      <DeployERC721Card
        storedState={storedState}
        updateStoredState={updateStoredState}
        onDeployed={(result) => {
          updateStoredState({ lastDeploy: result, minter: result.minter });
        }}
      />
      <MintSponsoredCard
        defaultTarget={lastDeploy?.address ?? ""}
        defaultSender={defaultMintSender as `0x${string}` | ""}
        simpleAccountFactory={storedState.simpleAccountFactory ?? ""}
        simpleAccountSalt={storedState.lastSalt ?? "0"}
        simpleAccountOwner={storedState.simpleAccountOwner ?? ""}
        entryPointHint={storedState.paymasterEntryPoint ?? ""}
      />
    </div>
  );
}
