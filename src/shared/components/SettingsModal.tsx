import React, { useEffect } from 'react';
import { X, Sparkles, Settings, Eye, KeyRound, Loader } from 'lucide-react';
import { ToggleSwitch } from './ToggleSwitch';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  translationMode: 'google' | 'gemini';
  setTranslationMode: (mode: 'google' | 'gemini') => void;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  aiAccessKey: string;
  setAiAccessKey: (key: string) => void;
  aiAccessStatus: 'idle' | 'pairing' | 'connected' | 'error';
  onPairAiAccess: () => void;
  showGridlines: boolean;
  setShowGridlines: (show: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  translationMode,
  setTranslationMode,
  geminiApiKey,
  setGeminiApiKey,
  aiAccessKey,
  setAiAccessKey,
  aiAccessStatus,
  onPairAiAccess,
  showGridlines,
  setShowGridlines
}) => {
  // Listen for Escape key to close the modal
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-container" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title">
            <Settings size={16} />
            <span>Cấu hình hệ thống</span>
          </div>
          <button 
            type="button" 
            className="btn-icon" 
            onClick={onClose}
            title="Đóng cài đặt"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="modal-content">
          {/* Section 1: Translation Engine */}
          <div className="modal-section">
            <h3 className="modal-section-title">
              <Sparkles size={14} style={{ color: 'var(--accent)' }} />
              Công cụ dịch thuật
            </h3>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button 
                type="button"
                className={`btn ${translationMode === 'google' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                onClick={() => setTranslationMode('google')}
              >
                Google Free (Mặc định)
              </button>
              <button 
                type="button"
                className={`btn ${translationMode === 'gemini' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                onClick={() => setTranslationMode('gemini')}
              >
                Gemini AI (Đề xuất)
              </button>
            </div>

            {translationMode === 'gemini' && (
              <div className="control-group" style={{ animation: 'fadeIn 0.15s ease-out' }}>
                <label style={{ fontWeight: 600, fontSize: '11px' }}>Gemini API Key:</label>
                <input 
                  type="password"
                  className="input-field"
                  placeholder="Nhập API Key cá nhân của bạn..."
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  style={{ fontSize: '12px', marginTop: '4px' }}
                />
                <div className="info-alert" style={{ marginTop: '6px' }}>
                  API Key chỉ được lưu tạm thời trong bộ nhớ RAM (In-Memory) của ứng dụng. Key sẽ tự động xóa sạch hoàn toàn khi tải lại trang hoặc tắt tab.
                </div>
              </div>
            )}
          </div>

          <div className="modal-section">
            <h3 className="modal-section-title">
              <KeyRound size={14} style={{ color: 'var(--accent)' }} />
              Quyền truy cập AI Chat
            </h3>
            <div className="control-group">
              <label style={{ fontWeight: 600, fontSize: '11px' }}>Secret key:</label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Nhập secret key do quản trị viên cấp..."
                  value={aiAccessKey}
                  onChange={(e) => setAiAccessKey(e.target.value)}
                  style={{ flex: 1, minWidth: 0, fontSize: '12px' }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!aiAccessKey.trim() || aiAccessStatus === 'pairing'}
                  onClick={onPairAiAccess}
                  style={{ minWidth: '88px', padding: '6px 10px', fontSize: '11px' }}
                >
                  {aiAccessStatus === 'pairing' && <Loader size={13} className="spinner" />}
                  {aiAccessStatus === 'connected' ? 'Đã kết nối' : 'Kết nối'}
                </button>
              </div>
              <div className={`ai-access-status ${aiAccessStatus}`}
              style={{ minWidth: '88px', padding: '6px 10px', fontSize: '11px' }}>
                {aiAccessStatus === 'connected'
                  ? 'Secret key đã được xác thực. Bạn có thể sử dụng AI Chat.'
                  : aiAccessStatus === 'error'
                    ? 'Không thể xác thực secret key. Vui lòng kiểm tra lại.'
                    : 'AI Chat chỉ hoạt động sau khi secret key được backend xác thực.'}
              </div>
            </div>
          </div>

          {/* Section 2: Display Configuration */}
          <div className="modal-section">
            <h3 className="modal-section-title">
              <Eye size={14} style={{ color: 'var(--accent)' }} />
              Cấu hình hiển thị
            </h3>
            
            <div className="switch-control" style={{ padding: '4px 0' }}>
              <span style={{ fontSize: '12px', fontWeight: 500 }}>Đường lưới bảng tính (Gridlines)</span>
              <ToggleSwitch 
                label=""
                checked={showGridlines}
                onChange={setShowGridlines}
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={onClose}
            style={{ padding: '6px 16px', fontSize: '12px' }}
          >
            Hoàn tất
          </button>
        </div>
      </div>
    </div>
  );
};
