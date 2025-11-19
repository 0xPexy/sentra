import { Link } from "react-router-dom";

const heroHighlights = [
  {
    title: "Playground Mint",
    description:
      "Spin up sponsored wallets, stream gas estimates, and ship zero-fee mints without touching a CLI.",
    cta: "Open Playground",
    href: "/app/playground",
  },
  {
    title: "EIP-7702 Demo",
    description:
      "See delegated wallets invoke smart flows with live authorization logs, a demo signer, and NFT holdings.",
    cta: "Open 7702 Lab",
    href: "/app/eip7702",
  },
];

const featureSections = [
  {
    key: "stats",
    label: "Stats Overview",
    title: "See sponsored usage at a glance.",
    copy: "Stats keeps you anchored with live balances, recent transactions, and safeguard alerts so you always know if the paymaster is healthy.",
    imageLabel: "Stats Screen",
    imageSrc: "/launch/stats.jpg",
    bullets: [
      "Live paymaster balances and burn rate",
      "Latest sponsored transactions with status tagging",
      "Alerts when contracts, selectors, or users fall out of policy",
    ],
    href: "/app",
    ctaLabel: "View stats",
  },
  {
    key: "config",
    label: "Config",
    title: "Register policies without touching a CLI.",
    copy: "Config is your staging ground for EntryPoints, allowlists, and sponsorship policies. Update a selector, test a request, and push it live in seconds.",
    imageLabel: "Config View",
    imageSrc: "/launch/config.jpg",
    bullets: [
      "Register contracts and selectors in one place",
      "Preview sponsorship policies before they ship",
      "One-click sync between dev and prod paymasters",
    ],
    href: "/app/config",
    ctaLabel: "Open config",
  },
  {
    key: "details",
    label: "Op Details",
    title: "Inspect every field a transaction carried.",
    copy: "Details shows the exact request the network received—call data, sponsorship metadata, and stage-by-stage status—so support and product can debug without log diving.",
    imageLabel: "Details View",
    imageSrc: "/launch/details.jpg",
    bullets: [
      "Show call data, signatures, and sponsorship context at a glance",
      "See when validation, execution, and settlement happened",
      "Instant deep links back to Stats and Simulator for cross-checking",
    ],
    href: "/app/details",
    ctaLabel: "Open details",
  },
  {
    key: "playground",
    label: "Playground",
    title: "From setup to minted NFT in minutes.",
    copy: "Playground walks builders through preparing a sponsored wallet, attaching gas estimates, and minting an NFT with one click.",
    imageLabel: "Playground Mint",
    imageSrc: "/launch/playground.jpg",
    bullets: [
      "Wallet address, init code, and calldata generated instantly",
      "Bundler gas + sponsorship envelopes streamed as you type",
      "Single CTA to mint with stub + verification budgets attached",
    ],
    href: "/app/playground",
    ctaLabel: "Try Playground",
  },
  {
    key: "7702",
    label: "EIP-7702 Lab",
    title: "Delegate a wallet and run native smart flows.",
    copy: "The 7702 lab pairs a demo signer with sponsorship context so you can see how delegated wallets call EntryPoint without touching a CLI.",
    imageLabel: "EIP-7702 View",
    imageSrc: "/launch/eip7702.jpg",
    bullets: [
      "7702 authorization capture with human-friendly copy",
      "Gas scaling sliders mirror the production console",
      "Shipping-style event log + NFT holdings update live",
    ],
    href: "/app/eip7702",
    ctaLabel: "Enter 7702 lab",
  },
  {
    key: "simulator",
    label: "Simulator",
    title: "Understand every error code instantly.",
    copy: "Simulator rewinds failed UserOperations step by step, overlaying AA error codes with plain-English explanations so teams can fix regressions in minutes.",
    imageLabel: "Simulator Details",
    imageSrc: "/launch/simulator.jpg",
    bullets: [
      "Visualize which stage (pre-verification, validation, execution) triggered the error",
      "See AA codes with recommended fixes and context",
      "Trace ETH/NFT movements to ensure failed paths haven't leaked funds",
    ],
    href: "/app/simulator",
    ctaLabel: "Open simulator",
  },
];

function placeholder(label: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='420' viewBox='0 0 800 420'><rect width='800' height='420' rx='28' ry='28' fill='url(#g)'/><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='#0f172a'/><stop offset='100%' stop-color='#1e293b'/></linearGradient></defs><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#94a3b8' font-family='Inter, sans-serif' font-size='28'>${label}</text></svg>`
  )}`;
}

export default function Launch() {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "auto" });
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8">
        <div className="text-2xl font-black tracking-[0.5em] text-transparent">
          <span
            className="bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-500 bg-clip-text text-transparent"
            aria-label="Sentra"
          >
            SENTRA
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            to="/app/playground"
            className="rounded-full bg-emerald-400/90 px-4 py-2 font-semibold text-slate-900 shadow-lg shadow-emerald-400/30 transition hover:bg-emerald-300"
            onClick={scrollToTop}
          >
            Launch App
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-16 px-6 pb-24">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-8 shadow-2xl shadow-emerald-500/10">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="space-y-6 md:max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Gas-Sponsored Builder Lab
              </div>
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold text-white md:text-5xl">
                  Meet SENTRA’s control surface.
                </h1>
                <p className="text-base text-slate-300 md:text-lg">
                  Configure ERC-4337 sponsorships, rerun 7702 flows, and inspect
                  gas traces without bash scripts or throwaway dashboards. Every module
                  below is production-ready and hooked to the live paymaster.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/app/playground"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-slate-900 shadow-lg shadow-white/20 transition hover:bg-slate-100"
                  onClick={scrollToTop}
                >
                  Launch Playground
                  <span aria-hidden="true">↗</span>
                </Link>
                <Link
                  to="/app/eip7702"
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/60"
                  onClick={scrollToTop}
                >
                  EIP-7702 demo
                </Link>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-4">
              {heroHighlights.map((card) => (
                <div
                  key={card.title}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-emerald-300/60 hover:bg-white/10"
                >
                  <div className="text-sm uppercase tracking-[0.2em] text-emerald-200">
                    {card.title}
                  </div>
                  <p className="mt-2 text-slate-200">{card.description}</p>
                  <Link
                    to={card.href}
                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-200 hover:text-emerald-100"
                    onClick={scrollToTop}
                  >
                    {card.cta}
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-10">
          <header className="space-y-2">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Explore the console
            </div>
            <h3 className="text-2xl font-semibold text-white">
              Every module at a glance.
            </h3>
            <p className="text-sm text-slate-400">
              Each section below mirrors a live page. Scroll down to inspect the
              Stats dashboard, Playground, EIP-7702 lab, and Simulator.
            </p>
          </header>
          {featureSections.map((section, index) => {
            const imageFirst = index % 2 === 1;
            return (
            <section
              key={section.key}
              className="grid gap-8 rounded-3xl border border-white/10 bg-slate-900/80 p-6 md:grid-cols-2 md:items-center"
            >
              <div
                className={`space-y-4 ${
                  imageFirst ? "md:order-2" : "md:order-1"
                }`}
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  {section.label}
                </div>
                <h4 className="text-2xl font-semibold text-white">
                  {section.title}
                </h4>
                <p className="text-sm text-slate-400">{section.copy}</p>
                <ul className="space-y-2 text-sm text-slate-300">
                  {section.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2 text-left"
                    >
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-300" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to={section.href}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-300/40 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:border-emerald-200 hover:text-white"
                  onClick={scrollToTop}
                >
                  {section.ctaLabel}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
              <div
                className={`rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/30 ${
                  imageFirst ? "md:order-1" : "md:order-2"
                }`}
              >
                <img
                  src={section.imageSrc}
                  alt={section.imageLabel}
                  className="w-full rounded-2xl border border-white/5"
                />
              </div>
            </section>
          );
        })}
        </section>

      </main>
    </div>
  );
}
