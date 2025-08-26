import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Suppress the noisy ResizeObserver loop error in dev
if (typeof window !== "undefined") {
  const resizeObserverErr = (e) =>
    e.message === "ResizeObserver loop completed with undelivered notifications.";

  window.addEventListener("error", (e) => {
    if (resizeObserverErr(e)) {
      e.stopImmediatePropagation();
    }
  });

  window.addEventListener("unhandledrejection", (e) => {
    if (resizeObserverErr(e.reason)) {
      e.stopImmediatePropagation();
    }
  });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
