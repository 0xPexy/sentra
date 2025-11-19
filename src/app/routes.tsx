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
import Launch from "../pages/Launch";
export const router = createBrowserRouter([
  { path: "/", element: <Launch /> },
  { path: "/login", element: <Login /> },
  {
    path: "/app",
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: (
          <ProtectedRoute access="guest">
            <DashboardStats />
          </ProtectedRoute>
        ),
      },
      {
        path: "config",
        element: (
          <ProtectedRoute access="admin">
            <DashboardConfig />
          </ProtectedRoute>
        ),
      },
      {
        path: "details",
        element: (
          <ProtectedRoute access="guest">
            <GasAnalyzer />
          </ProtectedRoute>
        ),
      },
      {
        path: "details/:hash",
        element: (
          <ProtectedRoute access="guest">
            <GasAnalyzer />
          </ProtectedRoute>
        ),
      },
      {
        path: "playground",
        element: (
          <ProtectedRoute access="user">
            <Playground />
          </ProtectedRoute>
        ),
      },
      {
        path: "eip7702",
        element: (
          <ProtectedRoute access="user">
            <Eip7702 />
          </ProtectedRoute>
        ),
      },
      {
        path: "simulator",
        element: (
          <ProtectedRoute access="user">
            <Simulator />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);
