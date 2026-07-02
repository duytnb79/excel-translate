import React from 'react';
import { PanelLeftOpen } from 'lucide-react';

export interface PdfToolbarProps {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const PdfToolbar: React.FC<PdfToolbarProps> = ({
  sidebarCollapsed,
  setSidebarCollapsed,
}) => {
  return (
    <div className="top-bar-left">
      {sidebarCollapsed && (
        <button 
          type="button"
          className="toolbar-btn" 
          title="Mở menu" 
          onClick={() => setSidebarCollapsed(false)}
        >
          <PanelLeftOpen size={16} />
        </button>
      )}
    </div>
  );
};
