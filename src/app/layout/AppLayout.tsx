import { Outlet, NavLink } from "react-router-dom";

export default function AppLayout() {
  return (
    <div
      className="min-h-screen text-slate-100 flex"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <aside className="w-64 border-r border-slate-800 bg-[rgba(10,15,30,0.85)] backdrop-blur-xl">
        <div
          className="p-4 text-2xl font-black tracking-[0.5em]"
          style={{
            color: "transparent",
            backgroundImage: "var(--gradient-brand)",
            WebkitBackgroundClip: "text",
          }}
        >
          SENTRA
        </div>
        <nav className="flex flex-col gap-2 p-3">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5"
              }`
            }
          >
            Stats
          </NavLink>
          <NavLink
            to="/gas"
            className={({ isActive }) =>
              `rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5"
              }`
            }
          >
            Gas Analyzer
          </NavLink>
          <NavLink
            to="/config"
            className={({ isActive }) =>
              `rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5"
              }`
            }
          >
            Config
          </NavLink>
          <NavLink
            to="/playground"
            className={({ isActive }) =>
              `rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5"
              }`
            }
          >
            Playground
          </NavLink>
          <NavLink
            to="/eip7702"
            className={({ isActive }) =>
              `rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5"
              }`
            }
          >
            EIP-7702
          </NavLink>
          <NavLink
            to="/simulator"
            className={({ isActive }) =>
              `rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5"
              }`
            }
          >
            Simulator
          </NavLink>
        </nav>
      </aside>
      <main className="flex-1">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
