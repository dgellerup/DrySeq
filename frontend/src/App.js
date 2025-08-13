import React from "react";
import { ToastContainer } from "react-toastify";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./layout/Layout";
import AnalyzePage from "./pages/AnalyzePage";
import HomePage from "./pages/HomePage";
import UploadPage from "./pages/UploadPage";
import FileManagementPage from "./pages/FileManagementPage";
import PCRPage from "./pages/PCRPage";
import OverviewPage from "./pages/OverviewPage";

import "react-toastify/dist/ReactToastify.css";

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route 
            path="/"
            element={
              <Layout>
                <HomePage />
              </Layout>
            }
          />
          <Route
            path="/overview"
            element={
              <Layout>
                <OverviewPage />
              </Layout>
            }
          />
          <Route
            path="/file-management"
            element={
              <Layout>
                <FileManagementPage />
              </Layout>
            }
          />
          <Route 
            path="/upload"
            element={
              <Layout>
                <UploadPage />
              </Layout>
            }
          />
          <Route
            path = "/pcr"
            element={
              <Layout>
                <PCRPage />
              </Layout>
            }
          />
          <Route
            path = "/analyze"
            element={
              <Layout>
                <AnalyzePage />
              </Layout>
            }
          />
        </Routes>
        <ToastContainer position="top-center" autoClose={3000} />
      </AuthProvider>
    </Router>
  );
}

export default App;
