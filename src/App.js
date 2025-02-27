import React from "react";
import { useLocation, useRoutes } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/HomePage";
import Social from "./pages/Social";
import Settings from "./pages/Settings";
import Layout from "./Layout";
import { AuthProvider } from "./context/authContext";
import { getAuth } from "firebase/auth";
import { CallManagerProvider } from "./context/callManagerContext";
import process from "process";
window.process = process;

function App() {

  const auth = getAuth();
  const user = auth.currentUser;
  const location = useLocation();

  const noLayoutRoutes = ["/login", "/register"];

  const routesArray = [
    { path: "*", element: <Login /> },
    { path: "/login", element: <Login /> },
    { path: "/register", element: <Register /> },
    { path: "/home", element: <Home /> },
    { path: "/social", element: <Social /> },
    { path: "/settings", element: <Settings /> },
  ];

  const routesElement = useRoutes(routesArray);

  return (
    <AuthProvider>
        <CallManagerProvider user={user}>
          {noLayoutRoutes.includes(location.pathname) ? (
            <div className="w-full h-screen flex flex-col">{routesElement}</div>
          ) : (
            <Layout>{routesElement}</Layout>
          )}
        </CallManagerProvider>
    </AuthProvider>
  );
}

export default App;
