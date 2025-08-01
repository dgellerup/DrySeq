import React, { useState } from "react";
import "./LoginModal.css";
import RegisterModal from "./RegisterModal";
import { useAuth } from "../contexts/AuthContext";

export default function LoginModal({ onClose, onLoginSuccess }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [showRegister, setShowRegister] = useState(false);

    const { login: setToken } = useAuth();

    const handleLogin = async (e) => {
        e.preventDefault();
        const res = await fetch("http://localhost:5000/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });

        const data = await res.json();
        if (res.ok) {
            setToken(data.token);
            onLoginSuccess();
            onClose();
        } else {
            setError(data.error || "Login failed");
        }
    };

    const handleRegister = () => {
        setShowRegister(true);
    }

    return (
        <>
            <div className="modal-overlay">
                <div className="modal">
                    <h2>Login</h2>
                    <form onSubmit={handleLogin}>
                        <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Username"
                            required
                        />
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password"
                            required
                        />
                        {error && <p className="error">{error}</p>}
                        <div className="modal-buttons">
                            <button type="button" className="modal-close" onClick={onClose}>Cancel</button>
                            <button type="submit" className="modal-login">Login</button>
                        </div>
                    </form>
                    <div className="registration">
                        <p>Not a registered user yet?</p>
                        <button type="button" className="modal-register" onClick={handleRegister}>Register</button>
                    </div>
                </div>
            </div>

            {showRegister && (
            <RegisterModal
                onClose={() => setShowRegister(false)}
                onRegisterSuccess={() => {
                    setShowRegister(false);
                    alert("Registration successful. You may now log in.");
                    }}
                />
            )}
        </>     
    );
}