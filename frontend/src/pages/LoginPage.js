import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        const res = await login(username, password);
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem("token", data.token);
            navigate("/");
        } else {
            alert(data.error);
        }
    };

    return (
        <form onSubmit={handleLogin}>
            <h2>Login</h2>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" required />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" required />
            <button type="submit">Login</button>
        </form>   
    );
}