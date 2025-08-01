import React from "react";
import { Link } from "react-router-dom";

export default function Navbar() {
    const logout = () => {
        localStorage.removeItem("token");
        window.location.href = "/login";
    };

    const token = localStorage.getItem("token");

    return (
        <nav>
            <Link to="/">Upload</Link> |{" "}
            <Link to="/register">Register</Link> |{" "}
            <Link to="/login">Login</Link> |{" "}
            {token && <button onClick={logout}>Logout</button>}
        </nav>
    );
}