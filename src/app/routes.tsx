import { createBrowserRouter } from "react-router-dom";
import Login from "../pages/Login";
import DashboardStats from "../pages/DashboardStats";
import DashboardConfig from "../pages/DashboardConfig";
import Playground from "../pages/Playground";
import Simulator from "../pages/Simulator";
import AppLayout from "./layout/AppLayout";
import ProtectedRoute from "./ProtectedRoute";
import GasAnalyzer from "../pages/GasAnalyzer";
import Eip7702 from "../pages/Eip7702";
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
      { path: "playground", element: <Playground /> },
      { path: "eip7702", element: <Eip7702 /> },
      { path: "simulator", element: <Simulator /> },
      { path: "gas", element: <GasAnalyzer /> },
    ],
  },
]);
