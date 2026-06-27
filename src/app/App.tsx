import React, { useState, useMemo, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { 
  FileSpreadsheet, 
  FileDown, 
  Loader,
  Trash2,
  PanelLeftClose,
  Settings
} from 'lucide-react';

// Shared Components
import { Toast } from '../shared/components/Toast';
import { ThemeToggle } from '../shared/components/ThemeToggle';
import { SettingsModal } from '../shared/components/SettingsModal';

// Shared Utils
import { 
  saveProject, 
  updateProjectMetadata, 
  getProjectMetadata, 
  getProjectBuffers, 
  listProjects, 
  deleteProject,
  ProjectMetadata 
} from '../shared/utils/db';

// Feature: Sheet Viewer
import { SheetViewer } from '../features/sheet-viewer/components/SheetViewer';
import { SheetSelector } from '../features/sheet-viewer/components/SheetSelector';
import { SheetToolbar } from '../features/sheet-viewer/components/SheetToolbar';
import { getCellText, setCellText, needsTranslation } from '../features/sheet-viewer/utils/excelParser';

// Feature: Translator
import { FileUpload } from '../features/translator/components/FileUpload';
import { TranslationSettings } from '../features/translator/components/TranslationSettings';
import { translateTexts, TranslationMode, TranslationProgress } from '../features/translator/utils/translator';

// Providers
import { useTheme } from './providers/ThemeProvider';

export const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  // File States
  const [file, setFile] = useState<File | null>(null);
  const [fileSizeStr, setFileSizeStr] = useState<string>('');
  
  // Workbook data
  const [origWorkbook, setOrigWorkbook] = useState<ExcelJS.Workbook | null>(null);
  const [transWorkbook, setTransWorkbook] = useState<ExcelJS.Workbook | null>(null);
  const [translatedLang, setTranslatedLang] = useState<string | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0);
  
  // Translation Config States
  const [sourceLang, setSourceLang] = useState<string>('auto');
  const [targetLang, setTargetLang] = useState<string>('vi');
  const [translationMode, setTranslationMode] = useState<TranslationMode>('google');
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [showGridlines, setShowGridlines] = useState<boolean>(true);
  
  // UI Layout States
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'original' | 'translated'>('original');
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [fontSizeOffset, setFontSizeOffset] = useState<number>(0);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [isAllAutoFitted, setIsAllAutoFitted] = useState<boolean>(false);
  const sheetViewerRef = React.useRef<any>(null);

  // Derive sheetNames dynamically from the active workbook
  const sheetNames = useMemo(() => {
    const wb = activeTab === 'original' ? origWorkbook : transWorkbook;
    if (!wb) return [];
    return wb.worksheets.map(s => s.name);
  }, [activeTab, origWorkbook, transWorkbook]);

  // Reset auto-fit toggle when sheet or workbook changes
  useEffect(() => {
    setIsAllAutoFitted(false);
  }, [activeSheetIndex, origWorkbook]);

  const handleToggleAutoFitAll = () => {
    if (isAllAutoFitted) {
      sheetViewerRef.current?.resetAll();
      setIsAllAutoFitted(false);
    } else {
      sheetViewerRef.current?.autoFitAll();
      setIsAllAutoFitted(true);
    }
  };
  const [loading, setLoading] = useState<boolean>(false);
  const [importLoading, setImportLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // History States
  const [historyList, setHistoryList] = useState<ProjectMetadata[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // Helper to format language label
  const getLanguageLabel = (langCode: string): string => {
    const langs: { [key: string]: string } = {
      vi: 'Tiếng Việt',
      en: 'Tiếng Anh',
      ja: 'Tiếng Nhật',
      zh: 'Tiếng Trung',
      ko: 'Tiếng Hàn',
    };
    return langs[langCode] || langCode.toUpperCase();
  };

  // Helper to format time ago
  const formatTimeAgo = (timestamp: number): string => {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const date = new Date(timestamp);
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  };

  // Load saved session list and active session on mount
  useEffect(() => {
    const initSession = async () => {
      setLoading(true);
      try {
        const list = await listProjects();
        setHistoryList(list);
        
        const lastActiveId = localStorage.getItem('active_project_id');
        if (lastActiveId) {
          await loadHistoryProject(lastActiveId);
        } else {
          const firstProj = list[0];
          if (firstProj) {
            await loadHistoryProject(firstProj.id);
          }
        }
      } catch (err) {
        console.error('Failed to initialize session list:', err);
      } finally {
        setLoading(false);
      }
    };
    initSession();
  }, []);

  // Load translation cache when targetLang changes for the active project
  useEffect(() => {
    const loadCachedTranslation = async () => {
      if (!activeProjectId) return;
      try {
        const meta = await getProjectMetadata(activeProjectId);
        if (!meta) return;
        
        const buffers = await getProjectBuffers(activeProjectId);
        if (!buffers) return;

        // Check if there is a cached translation for targetLang
        let cachedBuffer: ArrayBuffer | undefined;
        if (buffers.translations && buffers.translations[targetLang]) {
          cachedBuffer = buffers.translations[targetLang];
        } else if (meta.targetLang === targetLang && buffers.transBuffer) {
          cachedBuffer = buffers.transBuffer;
        }

        if (cachedBuffer) {
          setLoading(true);
          // Yield to browser layout/paint so the loading spinner appears before the main thread is blocked
          setTimeout(async () => {
            try {
              const transWb = new ExcelJS.Workbook();
              await transWb.xlsx.load(cachedBuffer!);
              setTransWorkbook(transWb);
              setTranslatedLang(targetLang);
            } catch (err) {
              console.error('Failed to load cached translation:', err);
            } finally {
              setLoading(false);
            }
          }, 50);
        } else {
          setTransWorkbook(null);
          setTranslatedLang(null);
        }
      } catch (err) {
        console.error('Failed to load cached translation:', err);
      }
    };
    loadCachedTranslation();
  }, [targetLang, activeProjectId]);

  // Restore project buffers and parameters from history ID
  const loadHistoryProject = async (id: string) => {
    setLoading(true);
    try {
      const meta = await getProjectMetadata(id);
      if (!meta) return;

      const buffers = await getProjectBuffers(id);
      if (!buffers) return;

      // Restore original workbook
      const origWb = new ExcelJS.Workbook();
      await origWb.xlsx.load(buffers.origBuffer);
      setOrigWorkbook(origWb);

      // Restore translated workbook if it exists for the current targetLang
      let cachedBuffer: ArrayBuffer | undefined;
      if (buffers.translations && buffers.translations[meta.targetLang]) {
        cachedBuffer = buffers.translations[meta.targetLang];
      } else if (buffers.transBuffer) {
        cachedBuffer = buffers.transBuffer;
      }

      if (cachedBuffer) {
        const transWb = new ExcelJS.Workbook();
        await transWb.xlsx.load(cachedBuffer);
        setTransWorkbook(transWb);
        setTranslatedLang(meta.targetLang);
      } else {
        setTransWorkbook(null);
        setTranslatedLang(null);
      }

      // Restore parameters
      setActiveSheetIndex(meta.activeSheetIndex);
      setActiveTab(meta.activeTab);
      setTargetLang(meta.targetLang);
      setFileSizeStr(meta.fileSizeStr);
      setActiveProjectId(id);
      localStorage.setItem('active_project_id', id);

      const mockFile = new File([buffers.origBuffer], meta.fileName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      setFile(mockFile);
    } catch (err) {
      console.error('Failed to load history project:', err);
      showToast('Không thể tải dự án từ lịch sử.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadHistoryProject = async (id: string) => {
    if (id === activeProjectId) return;
    await loadHistoryProject(id);
    showToast('Đã tải dự án từ lịch sử!');
  };

  const handleDeleteHistoryProject = async (id: string) => {
    try {
      await deleteProject(id);
      
      const updatedList = historyList.filter(item => item.id !== id);
      setHistoryList(updatedList);
      
      if (id === activeProjectId) {
        const nextProj = updatedList[0];
        if (nextProj) {
          await loadHistoryProject(nextProj.id);
        } else {
          setFile(null);
          setOrigWorkbook(null);
          setTransWorkbook(null);
          setActiveProjectId(null);
          localStorage.removeItem('active_project_id');
        }
      }
      showToast('Đã xoá dự án khỏi lịch sử.');
    } catch (err) {
      console.error('Failed to delete history project:', err);
      showToast('Lỗi khi xoá dự án khỏi lịch sử.', 'error');
    }
  };

  // Helper to persist view state changes (tab or sheet selection)
  const handleViewChange = async (tab: 'original' | 'translated', sheetIndex: number) => {
    setActiveTab(tab);
    setActiveSheetIndex(sheetIndex);
    
    if (activeProjectId) {
      try {
        const meta = await getProjectMetadata(activeProjectId);
        if (meta) {
          const updatedMeta = {
            ...meta,
            activeSheetIndex: sheetIndex,
            activeTab: tab,
            targetLang
          };
          await updateProjectMetadata(updatedMeta);
          
          const list = await listProjects();
          setHistoryList(list);
        }
      } catch (err) {
        console.error('Failed to update project view metadata:', err);
      }
    }
  };

  // Toast trigger helper
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  // Convert bytes to human readable format
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Process selected spreadsheet file
  const handleFileSelect = async (selectedFile: File) => {
    setLoading(true);
    setProgress(null);
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(arrayBuffer);

      if (wb.worksheets.length === 0) {
        throw new Error('Tệp excel không chứa worksheet nào.');
      }

      // Save new project to database
      const newId = `proj_${Date.now()}`;
      const newMeta = {
        id: newId,
        fileName: selectedFile.name,
        fileSizeStr: formatBytes(selectedFile.size),
        timestamp: Date.now(),
        activeSheetIndex: 0,
        activeTab: 'original' as const,
        targetLang,
        translatedLangs: []
      };
      const newBuffers = {
        id: newId,
        origBuffer: arrayBuffer,
        translations: {}
      };
      
      await saveProject(newMeta, newBuffers);
      
      const list = await listProjects();
      setHistoryList(list);

      setOrigWorkbook(wb);
      setTransWorkbook(null);
      setTranslatedLang(null);
      setActiveSheetIndex(0);
      setActiveTab('original');
      setFile(selectedFile);
      setFileSizeStr(formatBytes(selectedFile.size));
      setActiveProjectId(newId);
      localStorage.setItem('active_project_id', newId);

      showToast('Đã tải tệp bảng tính thành công!');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Lỗi khi đọc tệp Excel. Hãy kiểm tra định dạng.', 'error');
      setFile(null);
      setOrigWorkbook(null);
    } finally {
      setLoading(false);
    }
  };

  const handleUrlImport = async (url: string) => {
    if (!url.trim()) return;
    
    setLoading(true);
    setImportLoading(true);
    try {
      const response = await fetch(`/api/proxy-sheet?url=${encodeURIComponent(url.trim())}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Lỗi tải bảng tính (${response.statusText})`);
      }
      
      const blob = await response.blob();
      
      let fileName = 'Google_Sheet.xlsx';
      const matches = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (matches && matches[1]) {
        fileName = `Google_Sheet_${matches[1].substring(0, 8)}.xlsx`;
      }
      
      const importedFile = new File([blob], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      
      await handleFileSelect(importedFile);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Lỗi khi tải bảng tính từ URL.', 'error');
    } finally {
      setLoading(false);
      setImportLoading(false);
    }
  };

  // Clear current spreadsheet view
  const handleClearFile = async () => {
    if (activeProjectId) {
      try {
        await deleteProject(activeProjectId);
        const list = await listProjects();
        setHistoryList(list);
      } catch (err) {
        console.error('Failed to delete cleared project:', err);
      }
    }
    setFile(null);
    setOrigWorkbook(null);
    setTransWorkbook(null);
    setTranslatedLang(null);
    setActiveProjectId(null);
    localStorage.removeItem('active_project_id');
    showToast('Đã xoá tệp và toàn bộ dữ liệu dịch khỏi thiết bị.');
  };

  // Run cell translation
  const handleTranslate = async () => {
    if (!origWorkbook || !file) return;

    if (translationMode === 'gemini' && !geminiApiKey.trim()) {
      showToast('Vui lòng điền Gemini API Key để dịch bằng AI.', 'error');
      return;
    }

    setLoading(true);
    setProgress({ current: 0, total: 100, percentage: 0 });

    try {
      // 1. Double buffer clone (buffer write/read) to preserve formatting details
      const originalBuffer = await origWorkbook.xlsx.writeBuffer();
      const clonedWb = new ExcelJS.Workbook();
      await clonedWb.xlsx.load(originalBuffer);

      // 2. Fetch cell unique text collections and sheet names
      const textsToTranslate: string[] = [];
      clonedWb.eachSheet((sheet) => {
        if (needsTranslation(sheet.name)) {
          textsToTranslate.push(sheet.name);
        }
        sheet.eachRow((row) => {
          row.eachCell((cell) => {
            const txt = getCellText(cell);
            if (needsTranslation(txt)) {
              textsToTranslate.push(txt);
            }
          });
        });
      });

      if (textsToTranslate.length === 0) {
        setTransWorkbook(clonedWb);
        setActiveTab('translated');
        showToast('Bảng tính không chứa nội dung chữ cần dịch.');
        setLoading(false);
        return;
      }

      // 3. Execute translation engine
      const translationMap = await translateTexts(
        textsToTranslate,
        sourceLang,
        targetLang,
        translationMode,
        geminiApiKey,
        (progressInfo) => {
          setProgress(progressInfo);
        }
      );



      // 4. Overwrite text values and sheet names in clone workbook
      clonedWb.eachSheet((sheet) => {
        if (translationMap.has(sheet.name)) {
          const translatedName = translationMap.get(sheet.name);
          if (translatedName) {
            let sanitized = translatedName.replace(/[\\\/?:*\[\]]/g, '').trim();
            if (sanitized.length > 31) {
              sanitized = sanitized.slice(0, 31);
            }
            if (sanitized && sanitized !== sheet.name) {
              let uniqueName = sanitized;
              let counter = 1;
              while (clonedWb.worksheets.some(w => w.name.toLowerCase() === uniqueName.toLowerCase() && w !== sheet)) {
                const suffix = ` (${counter})`;
                const availableLen = 31 - suffix.length;
                uniqueName = sanitized.slice(0, availableLen) + suffix;
                counter++;
              }
              try {
                sheet.name = uniqueName;
              } catch (e) {
                console.warn('Failed to rename sheet:', e);
              }
            }
          }
        }
        sheet.eachRow((row) => {
          row.eachCell((cell) => {
            const txt = getCellText(cell);
            if (translationMap.has(txt)) {
              const translatedVal = translationMap.get(txt);
              if (translatedVal) {
                setCellText(cell, translatedVal);
              }
            }
          });
        });
      });

      setTransWorkbook(clonedWb);
      setTranslatedLang(targetLang);
      setActiveTab('translated');

      if (activeProjectId) {
        try {
          const meta = await getProjectMetadata(activeProjectId);
          if (meta) {
            const origBuffer = await origWorkbook.xlsx.writeBuffer();
            const transBuffer = await clonedWb.xlsx.writeBuffer();
            
            // Get existing translations or initialize
            const buffers = await getProjectBuffers(activeProjectId);
            const translations = buffers?.translations || {};
            translations[targetLang] = transBuffer;

            // Get existing translated languages or initialize
            const translatedLangs = meta.translatedLangs || [];
            if (!translatedLangs.includes(targetLang)) {
              translatedLangs.push(targetLang);
            }

            const updatedMeta = {
              ...meta,
              activeTab: 'translated' as const,
              targetLang,
              translatedLangs,
              timestamp: Date.now()
            };
            
            await saveProject(updatedMeta, {
              id: activeProjectId,
              origBuffer,
              transBuffer,
              translations
            });
            
            const list = await listProjects();
            setHistoryList(list);
          }
        } catch (dbErr) {
          console.error('Failed to update project with translation in database:', dbErr);
        }
      }

      showToast('Dịch bảng tính thành công!');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Có lỗi xảy ra trong quá trình dịch.', 'error');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  // Download translated file
  const handleDownload = async () => {
    if (!transWorkbook || !file) return;

    try {
      const buffer = await transWorkbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      
      const dotIndex = file.name.lastIndexOf('.');
      const name = dotIndex > -1 ? file.name.slice(0, dotIndex) : file.name;
      const ext = dotIndex > -1 ? file.name.slice(dotIndex) : '.xlsx';
      
      a.href = url;
      a.download = `${name}_translated_${targetLang}${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Đã tải xuống bảng dịch thành công!');
    } catch (err) {
      console.error(err);
      showToast('Lỗi khi chuẩn bị tệp tải xuống.', 'error');
    }
  };

  // Resolve current active sheet to view
  const activeWorksheet = useMemo(() => {
    const wb = activeTab === 'original' ? origWorkbook : transWorkbook;
    if (!wb) return null;
    return wb.getWorksheet(activeSheetIndex + 1);
  }, [activeTab, origWorkbook, transWorkbook, activeSheetIndex]);

  return (
    <div className="app-container">
      
      {/* Shared Toast Alert */}
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Loading Overlay */}
      {loading && (
        <div className="loading-overlay">
          {progress ? (
            <>
              <Loader size={36} className="spinner" />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Đang dịch bảng tính...</p>
                <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '12px' }}>
                  Đã dịch {progress.current}/{progress.total} cụm từ
                </p>
              </div>
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${progress.percentage}%` }}></div>
              </div>
              <p style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>{progress.percentage}%</p>
            </>
          ) : (
            <>
              <Loader size={36} className="spinner" />
              <p style={{ fontWeight: 500 }}>Đang xử lý tệp...</p>
            </>
          )}
        </div>
      )}

      {/* Sidebar Control Panel (Left, 100% height) */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <FileSpreadsheet size={18} />
            <span>Excel Translate</span>
          </div>
          <button 
            type="button"
            className="btn-icon" 
            title="Thu gọn menu" 
            onClick={() => setSidebarCollapsed(true)}
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        <div className="sidebar-content">
          {/* File Upload Zone */}
          <FileUpload 
            file={file}
            fileSizeStr={fileSizeStr}
            onFileSelect={handleFileSelect}
            onClear={handleClearFile}
            onUrlImport={handleUrlImport}
            importLoading={importLoading}
          />

          {/* Translation Settings Form */}
          <TranslationSettings 
            sourceLang={sourceLang}
            setSourceLang={setSourceLang}
            targetLang={targetLang}
            setTargetLang={setTargetLang}
            onTranslate={handleTranslate}
            disabled={!origWorkbook || loading || (transWorkbook !== null && targetLang === translatedLang)}
            isTranslated={transWorkbook !== null && targetLang === translatedLang}
          />

          {/* Recent History List */}
          <div className="history-section">
            <h3 className="section-title">Lịch sử gần đây</h3>
            {historyList.length === 0 ? (
              <p className="history-empty">Chưa có lịch sử dịch thuật</p>
            ) : (
              <div className="history-list">
                {historyList.map((item) => (
                  <div 
                    key={item.id} 
                    className={`history-item ${activeProjectId === item.id ? 'active' : ''}`}
                    onClick={() => handleLoadHistoryProject(item.id)}
                  >
                    <div className="history-item-info">
                      <div className="history-item-name" title={item.fileName}>
                        {item.fileName}
                      </div>
                      <div className="history-item-meta">
                        <span>{item.fileSizeStr}</span>
                        <span>•</span>
                        <span>{getLanguageLabel(item.targetLang)}</span>
                        <span>•</span>
                        <span>{formatTimeAgo(item.timestamp)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="history-item-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteHistoryProject(item.id);
                      }}
                      title="Xoá khỏi lịch sử"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Panel Viewport (Right side of sidebar) */}
      <main className="main-panel">
        {/* Row 1: Global Toolbar inside main panel */}
        {origWorkbook && (
          <div className="global-toolbar">
            <SheetToolbar 
              sidebarCollapsed={sidebarCollapsed}
              setSidebarCollapsed={setSidebarCollapsed}
              hasWorkbook={!!origWorkbook}
              zoomLevel={zoomLevel}
              onZoomChange={setZoomLevel}
              isAllAutoFitted={isAllAutoFitted}
              onToggleAutoFitAll={handleToggleAutoFitAll}
              fontSizeOffset={fontSizeOffset}
              onFontSizeOffsetChange={setFontSizeOffset}
            />
            <div className="top-bar-right">
              {/* Download Button */}
              {transWorkbook && activeTab === 'translated' && (
                <button 
                  type="button"
                  className="btn btn-secondary" 
                  style={{ padding: '4px 10px', height: '28px', fontSize: '12px' }}
                  onClick={handleDownload}
                >
                  <FileDown size={14} />
                  Tải Bảng Dịch
                </button>
              )}

              {/* Settings Button */}
              <button 
                type="button"
                className="btn-icon" 
                title="Cấu hình hệ thống" 
                onClick={() => setShowSettingsModal(true)}
              >
                <Settings size={16} />
              </button>

              {/* Light/Dark Toggle */}
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
          </div>
        )}

        {/* Row 2: Mode Tab Bar inside main panel */}
        {origWorkbook && (
          <div className="global-mode-bar">
            <div className="tabs-container">
              <button 
                type="button"
                className={`tab-btn ${activeTab === 'original' ? 'active' : ''}`}
                onClick={() => handleViewChange('original', activeSheetIndex)}
              >
                Trước khi dịch
              </button>
              <button 
                type="button"
                className={`tab-btn ${activeTab === 'translated' ? 'active' : ''}`}
                disabled={!transWorkbook}
                onClick={() => handleViewChange('translated', activeSheetIndex)}
                title={!transWorkbook ? 'Vui lòng nhấn "Dịch Ngay" trước' : ''}
              >
                Sau khi dịch
              </button>
            </div>
          </div>
        )}

        {/* Spreadsheet rendering workspace */}
        {activeWorksheet ? (
          <SheetViewer 
            ref={sheetViewerRef}
            worksheet={activeWorksheet}
            originalWorksheet={origWorkbook?.getWorksheet(activeSheetIndex + 1) || undefined}
            translatedWorksheet={transWorkbook?.getWorksheet(activeSheetIndex + 1) || undefined}
            showGridlines={showGridlines}
            zoomLevel={zoomLevel}
            fontSizeOffset={fontSizeOffset}
            onShowToast={showToast}
          />
        ) : (
          <div className="sheet-empty-state" style={{ flex: 1 }}>
            <FileSpreadsheet size={48} strokeWidth={1.5} />
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>Chưa tải bảng tính</h2>
            <p style={{ maxWidth: '280px', fontSize: '12px' }}>
              Hãy kéo thả hoặc tải lên một tệp Excel để dịch và duyệt dữ liệu.
            </p>
          </div>
        )}

        {/* Worksheet selector tabs */}
        <SheetSelector 
          sheetNames={sheetNames}
          activeIndex={activeSheetIndex}
          onSelect={(index) => handleViewChange(activeTab, index)}
        />
      </main>

      {/* Settings Configuration Modal */}
      <SettingsModal 
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        translationMode={translationMode}
        setTranslationMode={setTranslationMode}
        geminiApiKey={geminiApiKey}
        setGeminiApiKey={setGeminiApiKey}
        showGridlines={showGridlines}
        setShowGridlines={setShowGridlines}
      />
    </div>
  );
};

