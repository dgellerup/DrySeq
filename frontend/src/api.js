const API_BASE = "http://localhost:5000";

export const register = async (username, password) =>
    fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
    });

export const login = async (username, password) =>
    fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
    });

export const uploadFile = async (file, token) => {
    const formData = new FormData();
    formData.append("file", file);

    return fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
    });
};