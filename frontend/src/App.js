import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import UploadPage from "./pages/UploadPage";
import AnalyzePage from "./pages/AnalyzePage"; // Create blank for now
import HomePage from "./pages/HomePage";
import Layout from "./layout/Layout";
import { AuthProvider } from "./contexts/AuthContext";

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
            path="/upload"
            element={
              <Layout>
                <UploadPage />
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
      </AuthProvider>
    </Router>
  );
}

export default App;
