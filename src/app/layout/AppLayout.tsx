import { Outlet, NavLink } from "react-router-dom";

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-[#0A0E17] text-slate-100 flex">
      <aside className="w-64 bg-[#151A28] border-r border-slate-800">
        <div className="p-4 text-xl font-semibold">Sentra</div>
        <nav className="flex flex-col gap-1 p-2">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-3 py-2 rounded ${
                isActive ? "bg-slate-800" : "hover:bg-slate-800/50"
              }`
            }
          >
            Stats
          </NavLink>
          <NavLink
            to="/config"
            className={({ isActive }) =>
              `px-3 py-2 rounded ${
                isActive ? "bg-slate-800" : "hover:bg-slate-800/50"
              }`
            }
          >
            Config
          </NavLink>
          <NavLink
            to="/playground"
            className={({ isActive }) =>
              `px-3 py-2 rounded ${
                isActive ? "bg-slate-800" : "hover:bg-slate-800/50"
              }`
            }
          >
            Playground
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
