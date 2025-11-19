import * as React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type Role } from "../state/auth";

export type AccessLevel = "guest" | "user" | "admin";

export function canAccess(role: Role, access: AccessLevel) {
  if (role === "admin") return true;
  if (role === "user") {
    return access === "guest" || access === "user";
  }
  return access === "guest";
}

export default function ProtectedRoute({
  children,
  access = "user",
}: {
  children: React.JSX.Element;
  access?: AccessLevel;
}) {
  const { role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="p-6 text-sm text-slate-400">
        Checking permissions…
      </div>
    );
  }

  if (canAccess(role, access)) {
    return <>{children}</>;
  }

  if (role === "guest") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Navigate to="/app" replace />;
}
