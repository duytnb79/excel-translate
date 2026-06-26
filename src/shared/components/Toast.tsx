import React from 'react';
import { Info } from 'lucide-react';

export interface ToastProps {
  message: string;
  type: 'success' | 'error';
}

export const Toast: React.FC<ToastProps> = ({ message, type }) => {
  return (
    <div className={`toast ${type}`}>
      <Info size={16} />
      <span>{message}</span>
    </div>
  );
};
