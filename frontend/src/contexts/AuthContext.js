import { createContext, useContext, useRef, useState, useEffect } from "react";
import { jwtDecode } from "jwt-decode";
import { useNavigate } from "react-router-dom";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState("");
  const logoutTimer = useRef(null);

  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem("token");
    if (stored) {
      try {
        const decoded = jwtDecode(stored);
        const expiryTimeMs = decoded.exp * 1000;
        if (expiryTimeMs > Date.now()) {
          setToken(stored);
          setUsername(decoded.username || "");
          scheduleLogout(decoded);
        } else {
          logout();
        }
      } catch (err) {
        console.error("Invalid token in localStorage:", err);
        logout();
      }
    }
    return () => {
      if (logoutTimer.current) clearTimeout(logoutTimer.current);
    };
  }, []);

  const login = (newToken) => {
    try {
      const decoded = jwtDecode(newToken);
      localStorage.setItem("token", newToken);
      setToken(newToken);
      setUsername(decoded.username || "");
      scheduleLogout(decoded);
    } catch (err) {
      console.error("Invalid token during login:", err);
      logout();
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUsername("");
    if (logoutTimer.current) {
      clearTimeout(logoutTimer.current);
      logoutTimer.current = null;
    }
    navigate("/");
  };

  const scheduleLogout = (decodedToken) => {
    const expiryTimeMs = decodedToken.exp * 1000;
    const now = Date.now();
    const timeUntilExpiry = expiryTimeMs - now;

    if (logoutTimer.current) clearTimeout(logoutTimer.current);

    if (timeUntilExpiry > 0) {
      logoutTimer.current = setTimeout(() => {
        logout();
      }, timeUntilExpiry);
    } else {
      logout(); // Expired
    }
  };

  return (
    <AuthContext.Provider value={{ token, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}