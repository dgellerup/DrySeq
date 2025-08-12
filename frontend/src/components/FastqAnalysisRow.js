import React, { useState } from "react";

import { ChevronDown, ChevronRight, Download, Trash2 } from "lucide-react";

import "./FastqDrawer.css";

const FastqAnalysisRow = ({ analysis, onDelete, onDownload }) => {
    const [open, setOpen] = useState(false);

  return (
    <>
      {/* Main row */}
      <tr
        className="border-t cursor-pointer hover:bg-gray-100"
        onClick={() => setOpen((prev) => !prev)}
      >
        <td className="p-2 border-r border-gray-300 flex items-center space-x-2">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span>{analysis.analysisName}</span>
        </td>
        <td className="p-2 border">{analysis.sequenceCount}</td>
        <td className="p-2 border space-x-2">
          <button
            title="Download"
            className="download-button"
            onClick={(e) => {
              e.stopPropagation(); // Prevent row toggle
              onDownload();
            }}
          >
            <Download size={18} />
          </button>
          <button
            title="Delete"
            className="delete-button"
            onClick={(e) => {
              e.stopPropagation(); // Prevent row toggle
              onDelete();
            }}
          >
            <Trash2 size={18} />
          </button>
        </td>
      </tr>

      {/* Drawer row */}
      {open && (
        <tr className="border-t bg-gray-50">
          <td colSpan={3} className="p-4">
            <div className="text-sm space-y-1">
              <div>
                <strong>R1 File:</strong> {analysis.fastqFileR1?.filename}
              </div>
              <div>
                <strong>R2 File:</strong> {analysis.fastqFileR2?.filename}
              </div>
              <div>
                <strong>PCR File:</strong> {analysis.pcrFilename}
              </div>
              <div>
                <strong>Created:</strong>{" "}
                {new Date(analysis.createdAt).toLocaleString()}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

export default FastqAnalysisRow;