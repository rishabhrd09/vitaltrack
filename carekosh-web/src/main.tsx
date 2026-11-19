import React from "react";
import routes from "../routes.json";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  Link,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./styles.css";
import "./styles/readability.css";
import "./styles/workspace.css";
import "./styles/overlays.css";
import "./styles/supply-review.css";
import { AppProvider, useApp } from "./context";
import { Shell, Help } from "./components/Shell";
import { Loading } from "./components/ui";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import ItemPage from "./pages/ItemForm";
import Builder from "./pages/Builder";
import { Orders, CreateOrder, OrderDetail } from "./pages/Orders";
import Auth from "./pages/Auth";
import Profile, { Activity } from "./pages/Profile";
import SupplyReview from "./pages/SupplyReview";
import { BRAND } from "./brand";
import { retryRead, readRetryDelay } from "./services/api";
function PageMetadata() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    const labels: Record<string, string> = {
      inventory: "Inventory",
      item: "Item details",
      builder: "Build inventory",
      orders: "Orders",
      profile: "Account",
      activity: "Activity",
      help: "Help & support",
      "supply-review": "Supply review",
      login: "Sign in",
      register: "Create account",
      "forgot-password": "Forgot password",
      "reset-password": "Reset password",
      "verify-email": "Verify email",
      "resend-verification": "Resend verification",
    };
    const section = pathname.split("/")[1];
    const label =
      pathname === "/item/new"
        ? "Add item"
        : ["/orders/new", "/orders/create"].includes(pathname)
          ? "Create order"
          : labels[section] || "Page not found";
    document.title = section
      ? `${label} | ${BRAND.browserTitle}`
      : BRAND.browserTitle;
  }, [pathname]);
  return null;
}
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: retryRead,
      retryDelay: readRetryDelay,
      refetchOnReconnect: true,
    },
    mutations: { retry: 0 },
  },
});
function Protected() {
  const a = useApp();
  return !a.authReady ? (
    <div className="boot-screen">
      <img src="/brand/mark-dark.png" alt="CareKosh" />
      <Loading />
    </div>
  ) : a.user ? (
    <Outlet />
  ) : (
    <Navigate to="/login" replace />
  );
}
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="fatal-error">
        <h1>Something didn’t load.</h1>
        <p>
          Reload the workspace to try again. Your saved inventory stays intact.
        </p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Reload CareKosh
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <PageMetadata />
          <AppProvider>
            <Routes>
              {routes.auth.map((path) => (
                <Route key={path} path={path} element={<Auth />} />
              ))}
              <Route element={<Protected />}>
                <Route element={<Shell />}>
                  {Object.entries({
                    dashboard: <Dashboard />,
                    inventory: <Inventory />,
                    item: <ItemPage />,
                    builder: <Builder />,
                    orders: <Orders />,
                    createOrder: <CreateOrder />,
                    newOrder: <CreateOrder />,
                    order: <OrderDetail />,
                    profile: <Profile />,
                    activity: <Activity />,
                    help: <Help />,
                    supplyReview: <SupplyReview />,
                    supplyReviewRun: <SupplyReview />,
                  }).map(([key, element]) => (
                    <Route
                      key={key}
                      path={
                        routes.workspace[key as keyof typeof routes.workspace]
                      }
                      element={element}
                    />
                  ))}
                  <Route
                    path="*"
                    element={
                      <div className="empty-state">
                        <h1>This page isn’t here.</h1>
                        <p>Let’s get you back to your care space.</p>
                        <Link className="button primary" to="/">
                          Go to dashboard
                        </Link>
                      </div>
                    }
                  />
                </Route>
              </Route>
            </Routes>
          </AppProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
