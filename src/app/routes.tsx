import { createBrowserRouter } from "react-router-dom";
import Login from "../pages/Login";
import DashboardStats from "../pages/DashboardStats";
import DashboardConfig from "../pages/DashboardConfig";
import AppLayout from "./layout/AppLayout";
import ProtectedRoute from "./ProtectedRoute";
export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardStats /> },
      { path: "config", element: <DashboardConfig /> },
    ],
  },
]);
