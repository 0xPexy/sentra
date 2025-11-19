import { Outlet, NavLink } from "react-router-dom";
import { useAuth } from "../../state/auth";
import { canAccess, type AccessLevel } from "../ProtectedRoute";

const NAV_ITEMS: Array<{
  label: string;
  to: string;
  access: AccessLevel;
  end?: boolean;
}> = [
  { label: "Stats", to: "/app", access: "guest", end: true },
  { label: "Details", to: "/app/details", access: "guest" },
  { label: "Playground", to: "/app/playground", access: "user" },
  { label: "EIP-7702", to: "/app/eip7702", access: "user" },
  { label: "Simulator", to: "/app/simulator", access: "user" },
  { label: "Config", to: "/app/config", access: "admin" },
];

export default function AppLayout() {
  const { role, token } = useAuth();
  const isAuthenticated = Boolean(token);
  const links = NAV_ITEMS.filter((item) => {
    if (!isAuthenticated && item.access !== "guest") {
      return false;
    }
    return canAccess(role, item.access);
  });
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
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-full px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:bg-white/5"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
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
