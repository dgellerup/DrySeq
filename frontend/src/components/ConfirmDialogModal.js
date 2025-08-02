import React from "react";
import "./LoginModal.css"; // reuse modal styles

export default function ConfirmDialogModal({ isOpen, onConfirm, onCancel, message }) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal">
                <p>{message}</p>
                <div className="modal-buttons">
                    <button type="button" className="modal-cancel" onClick={onCancel}>Cancel</button>
                    <button type="button" className="modal-login" onClick={onConfirm}>Delete</button>
                </div>
            </div>
        </div>
    );
}