import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function Navbar() {
    const { isAuthenticated, logout } = useAuth();

    return (
        <nav>
            <Link to="/">Upload</Link> |{" "}
            <Link to="/register">Register</Link> |{" "}
            {!isAuthenticated && <Link to="/login">Login</Link>} |{" "}
            {isAuthenticated && <button onClick={logout}>Logout</button>}
        </nav>
    );
}