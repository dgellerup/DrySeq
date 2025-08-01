import React, { useState } from "react";
import { register } from "../api";

export default function RegisterPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const handleRegister = async (e) => {
        e.preventDefault();
        const res = await register(username, password);
        const data = await res.json();
        if (res.ok) {
            alert("Registration successful, now log in.");
        } else {
            alert(data.error);
        }
    };

    return (
        <form onSubmit={handleRegister}>
            <h2>Register</h2>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" required />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" required />
            <button type="submit">Register</button>
        </form>
    );
}