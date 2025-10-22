type Props = {
  onAddContract: (addr: string, label?: string) => Promise<void>;
  onAddFunction: (contractId: number, selector: string, allow: boolean) => Promise<void>;
  onSetUsdcLimit: (usd: number) => Promise<void>;
};
export default function ConfigForm({
  //   onAddContract, onAddFunction, onSetUsdcLimit
}: Props) {
  // 폼 상태/핸들러는 간결화를 위해 생략
  return (
    <div className="grid grid-cols-2 gap-6">
      <section className="bg-[#151A28] border border-slate-800 rounded-xl p-4">
        <h3 className="font-semibold mb-3">Allow Contract</h3>
        {/* 주소/라벨 입력 + 추가 버튼 */}
        {/* ... */}
      </section>

      <section className="bg-[#151A28] border border-slate-800 rounded-xl p-4">
        <h3 className="font-semibold mb-3">Allow Function</h3>
        {/* contractId, selector(0x...), allow 입력 */}
        {/* ... */}
      </section>

      <section className="bg-[#151A28] border border-slate-800 rounded-xl p-4 col-span-2">
        <h3 className="font-semibold mb-3">USDC Limit per Operation</h3>
        {/* 숫자 입력 + 저장 */}
        {/* ... */}
      </section>
    </div>
  );
}
