import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, File, Upload, ActivitySquare } from "lucide-react";
import "./Layout.css";
import LoginModal from "../components/LoginModal";
import { useAuth } from "../contexts/AuthContext";

export default function Layout({ children }) {
    const [showLoginModal, setShowLoginModal] = useState(false);

    const location = useLocation();
    const navigate = useNavigate();
    const currentPath = location.pathname;

    const { token, username, logout } = useAuth();

    const handleLogout = () => {
        logout();
        setShowLoginModal(false);
        navigate("/");
    };

    return (
        <div className="layout">
            <header className="banner">
                <div className="banner-title">DrySeq</div>
                <div className="banner-right">
                    {username && <span className="username">{username}</span>}
                    {token ? (
                        <button onClick={handleLogout} className="banner-btn">Logout</button>
                    ) : (
                        <button onClick={() => setShowLoginModal(true)} className="banner-btn">Login</button>
                    )}
                </div>
            </header>

            <div className="main-content">
                <nav className="sidebar">
                    <Link to="/" className={`sidebar-link ${currentPath === "/" ? "active" : ""}`}>
                        <Home size={18} style={{ marginRight: "8px" }} />
                        Home
                    </Link>
                    <Link to="/file-management" className={`sidebar-link ${currentPath === "/file-management" ? "active" : ""}`}>
                        <File size={18} style={{ marginRight: "8px" }} />
                        File Management
                    </Link>
                    <Link to="/upload" className={`sidebar-link ${currentPath === "/upload" ? "active" : ""}`}>
                        <Upload size={18} style={{ marginRight: "8px" }} />
                        Upload
                    </Link>
                    <Link to="/analyze" className={`sidebar-link ${currentPath === "/analyze" ? "active" : ""}`}>
                        <ActivitySquare size={18} style={{ marginRight: "8px" }} />
                        Analyze
                    </Link>
                </nav>

                <main className="content-area">
                    {children}
                </main>
            </div>
            {showLoginModal && (
                <LoginModal
                    onClose={() => setShowLoginModal(false)}
                    onLoginSuccess={() => navigate("/")}
                />
            )}
        </div>
    );
}