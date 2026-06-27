import React from 'react';
import { Sparkles } from 'lucide-react';

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
  onTranslate: () => void;
  disabled: boolean;
  isTranslated?: boolean;
}

export const TranslationSettings: React.FC<TranslationSettingsProps> = ({
  sourceLang,
  setSourceLang,
  targetLang,
  setTargetLang,
  onTranslate,
  disabled,
  isTranslated = false,
}) => {
  return (
    <>
      {/* Translation Config */}
      <div className="control-group">
        
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

      {/* Translate Button */}
      {!isTranslated && (
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <button 
            type="button"
            className="btn btn-primary"
            style={{ fontWeight: 600, width: '100%' }}
            disabled={disabled}
            onClick={onTranslate}
          >
            <Sparkles size={16} />
            Dịch
          </button>
        </div>
      )}
    </>
  );
};
