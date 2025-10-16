import { Navigate } from "react-router-dom";
import { useAuth } from "../state/auth";

const BYPASS = import.meta.env.VITE_AUTH_BYPASS === "1";
export default function ProtectedRoute({
  children,
}: {
  children: JSX.Element;
}) {
  const { token } = useAuth();
  if (!token && !BYPASS) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
