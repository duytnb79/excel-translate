import React from 'react';
import { Sparkles } from 'lucide-react';
import { TranslationMode } from '../utils/translator';
import { ToggleSwitch } from '../../../shared/components/ToggleSwitch';

const LANGUAGES = [
  { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'zh', name: '中文 (简体)', flag: '🇨🇳' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' }
];

const SOURCE_LANGUAGES = [
  { code: 'auto', name: 'Tự động phát hiện', flag: '🔍' },
  ...LANGUAGES
];

export interface TranslationSettingsProps {
  sourceLang: string;
  setSourceLang: (lang: string) => void;
  targetLang: string;
  setTargetLang: (lang: string) => void;
  translationMode: TranslationMode;
  setTranslationMode: (mode: TranslationMode) => void;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  showGridlines: boolean;
  setShowGridlines: (show: boolean) => void;
  onTranslate: () => void;
  disabled: boolean;
}

export const TranslationSettings: React.FC<TranslationSettingsProps> = ({
  sourceLang,
  setSourceLang,
  targetLang,
  setTargetLang,
  translationMode,
  setTranslationMode,
  geminiApiKey,
  setGeminiApiKey,
  showGridlines,
  setShowGridlines,
  onTranslate,
  disabled,
}) => {
  return (
    <>
      {/* Translation Config */}
      <div className="control-group">
        <span className="section-title">Ngôn ngữ dịch</span>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="control-group">
            <label>Nguồn:</label>
            <select 
              className="input-field"
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
            >
              {SOURCE_LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label>Đích:</label>
            <select 
              className="input-field"
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
            >
              {LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Engine Selection */}
      <div className="control-group">
        <span className="section-title">Công cụ dịch</span>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
          <button 
            type="button"
            className={`btn btn-secondary ${translationMode === 'google' ? 'btn-primary' : ''}`}
            style={{ flex: 1, padding: '6px', fontSize: '11px' }}
            onClick={() => setTranslationMode('google')}
          >
            Google Free
          </button>
          <button 
            type="button"
            className={`btn btn-secondary ${translationMode === 'gemini' ? 'btn-primary' : ''}`}
            style={{ flex: 1, padding: '6px', fontSize: '11px' }}
            onClick={() => setTranslationMode('gemini')}
          >
            Gemini AI
          </button>
        </div>

        {translationMode === 'gemini' && (
          <div className="control-group">
            <label>Gemini API Key:</label>
            <input 
              type="password"
              className="input-field"
              placeholder="Nhập API Key..."
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              style={{ fontSize: '11px' }}
            />
            <div className="info-alert">
              API Key được lưu trữ cục bộ trên trình duyệt của bạn.
            </div>
          </div>
        )}
      </div>

      {/* View Options */}
      <div className="control-group">
        <span className="section-title">Cấu hình hiển thị</span>
        <ToggleSwitch 
          label="Đường lưới (Gridlines)"
          checked={showGridlines}
          onChange={setShowGridlines}
        />
      </div>

      {/* Translate Button */}
      <button 
        type="button"
        className="btn btn-primary"
        style={{ marginTop: 'auto', fontWeight: 600 }}
        disabled={disabled}
        onClick={onTranslate}
      >
        <Sparkles size={16} />
        Dịch Ngay
      </button>
    </>
  );
};
