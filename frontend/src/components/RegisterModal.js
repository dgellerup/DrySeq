import React, { useState } from "react";
import { toast } from "react-toastify";

import { API_BASE } from "../api";

import "./LoginModal.css"; // reuse styles

export default function RegisterModal({ onClose, onRegisterSuccess }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [password2, setPassword2] = useState("");
    const [inviteCode, setInviteCode] = useState("");

    const [error, setError] = useState("");

    const bothTyped = password.length > 0 && password2.length > 0;
    const passwordsMatch = bothTyped && password === password2;
    const lineColor = !bothTyped ? "#6b7280" : passwordsMatch ? "green" : "crimson";

    const handleRegister = async (e) => {
        e.preventDefault();

        if (!inviteCode.trim()) {
            setError("Invite code is required.");
            toast.info(error);
            return;
        }

        if (!username.trim()) {
            setError("Username is required.");
            toast.info(error);
            return;
        }

        if (!password.trim()) {
            setError("Password is required.");
            toast.info(error);
            return;
        }

        const res = await fetch(`${API_BASE}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, inviteCode }),
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
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        required
                    />
                    
                    <div className="form-row">
                        <input
                            type="password"
                            value={password2}
                            onChange={(e) => setPassword2(e.target.value)}
                            placeholder="Confirm Password"
                            required
                            aria-invalid={bothTyped && !passwordsMatch}
                            aria-describedby="pw-status"
                        />

                        <div id="pw-status" className={`hint ${passwordsMatch ? 'ok' : 'err'}`} aria-live="polite">
                            {passwordsMatch ? "Passwords match" : "Passwords must match"}
                        </div>
                    </div>

                    <input
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value)}
                        placeholder="Invite Code"
                        required
                    />
                    {error && <p className="error">{error}</p>}
                    <div className="modal-buttons">
                        <button type="button" className="modal-cancel" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="modal-login" disabled={!passwordsMatch}>Register</button>
                    </div>
                </form>
            </div>
        </div>
    )
}