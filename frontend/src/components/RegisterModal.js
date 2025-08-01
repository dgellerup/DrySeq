import React, { useState } from "react";
import "./LoginModal.css"; // reuse styles

export default function RegisterModal({ onClose, onRegisterSuccess }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleRegister = async (e) => {
        e.preventDefault();

        const res = await fetch("http://localhost:5000/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });

        const data = await res.json();
        if (res.ok) {
            onRegisterSuccess(); // e.g., show login modal again
            onClose();
        } else {
            setError(data.error || "Registration failed");
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <h2>Register</h2>
                <form onSubmit={handleRegister}>
                    <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Username"
                        required
                    />
                    <input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        required
                    />
                    {error && <p className="error">{error}</p>}
                    <div className="modal-buttons">
                        <button type="button" className="modal-cancel" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="modal-login">Register</button>
                    </div>
                </form>
            </div>
        </div>
    )
}