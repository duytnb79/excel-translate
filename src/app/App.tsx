import React, { useState, useMemo, useEffect, useRef } from 'react';
import ExcelJS from 'exceljs';
import { 
  FileSpreadsheet, 
  FileDown, 
  Loader,
  Trash2,
  PanelLeftClose,
  Settings,
  Upload,
  MessageSquare
} from 'lucide-react';

// Shared Components
import { Toast } from '../shared/components/Toast';
import { ThemeToggle } from '../shared/components/ThemeToggle';
import { SettingsModal } from '../shared/components/SettingsModal';
import { getFirebaseIdToken } from '../shared/services/firebase';

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

// Feature: PDF Viewer & Compiler
import { parsePdfDocument, PdfDocumentData } from '../features/pdf-viewer/utils/pdfParser';
import { compileTranslatedPdf } from '../features/pdf-viewer/utils/pdfCompiler';
import { PdfViewer } from '../features/pdf-viewer/components/PdfViewer';
import { PdfToolbar } from '../features/pdf-viewer/components/PdfToolbar';

// Feature: AI Chat
import { AiChatPanel } from '../features/ai-chat/components/AiChatPanel';
import {
  clearAiAccessKey,
  getAiAccessKey,
  pairAiAccessKey,
} from '../features/ai-chat/services/aiAccess';

// Providers
import { useTheme } from './providers/ThemeProvider';

const clampWorksheetIndex = (index: number, worksheetCount: number): number => {
  if (worksheetCount <= 0) return 0;
  const normalizedIndex = Number.isFinite(index) ? Math.trunc(index) : 0;
  return Math.min(Math.max(normalizedIndex, 0), worksheetCount - 1);
};

const getWorksheetAt = (workbook: ExcelJS.Workbook | null, index: number) => {
  if (!workbook || workbook.worksheets.length === 0) return undefined;
  return workbook.worksheets[clampWorksheetIndex(index, workbook.worksheets.length)];
};

export const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  // File States
  const [file, setFile] = useState<File | null>(null);
  const [fileSizeStr, setFileSizeStr] = useState<string>('');
  
  // Workbook data
  const [origWorkbook, setOrigWorkbook] = useState<ExcelJS.Workbook | null>(null);
  const [transWorkbook, setTransWorkbook] = useState<ExcelJS.Workbook | null>(null);
  const [spreadsheetTranslationMap, setSpreadsheetTranslationMap] = useState<Map<string, string>>(new Map());
  const [translatedLang, setTranslatedLang] = useState<string | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0);

  // PDF States
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [pdfData, setPdfData] = useState<PdfDocumentData | null>(null);
  const [transPdfBuffer, setTransPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [pdfTranslationMap, setPdfTranslationMap] = useState<Map<string, string> | null>(null);
  const [pdfColorsMap, setPdfColorsMap] = useState<Map<string, { bg: string; text: string }>>(new Map());
  const [pdfPageIndex, setPdfPageIndex] = useState<number>(0);
  
  // Cancellation Reference
  const cancelTranslationRef = useRef<boolean>(false);
  
  // Translation Config States
  const [sourceLang, setSourceLang] = useState<string>('auto');
  const [targetLang, setTargetLang] = useState<string>('vi');
  const [translationMode, setTranslationMode] = useState<TranslationMode>('google');
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [showGridlines, setShowGridlines] = useState<boolean>(true);
  
  // UI Layout States
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'original' | 'translated'>('original');
  const [zoomLevel, setZoomLevel] = useState<number>(0.75);
  const [fontSizeOffset, setFontSizeOffset] = useState<number>(0);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [aiAccessKey, setAiAccessKeyState] = useState(() => getAiAccessKey());
  const [aiAccessStatus, setAiAccessStatus] = useState<'idle' | 'pairing' | 'connected' | 'error'>(
    () => getAiAccessKey() ? 'connected' : 'idle',
  );
  const [selectionMode, setSelectionMode] = useState<'idle' | 'selecting'>('idle');
  const [selectedRanges, setSelectedRanges] = useState<Array<{ startRow: number; startCol: number; endRow: number; endCol: number }>>([]);
  const [isAllAutoFitted, setIsAllAutoFitted] = useState<boolean>(false);
  const sheetViewerRef = React.useRef<any>(null);

  // Derive sheetNames dynamically from the active workbook
  const sheetNames = useMemo(() => {
    const wb = activeTab === 'original' ? origWorkbook : transWorkbook;
    if (!wb) return [];
    return wb.worksheets.map(s => s.name);
  }, [activeTab, origWorkbook, transWorkbook]);

  // Reset auto-fit toggle and range selection when sheet or workbook changes
  useEffect(() => {
    setIsAllAutoFitted(false);
    setSelectedRanges([]);
    setSelectionMode('idle');
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
  const [aiConversationId, setAiConversationId] = useState<string | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // Global Drag & Drop State
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        dragCounter.current++;
        setIsDragActive(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current === 0) {
        setIsDragActive(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragActive(false);

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        const droppedFile = e.dataTransfer.files[0];
        const ext = droppedFile.name.toLowerCase().split('.').pop();
        if (ext === 'xlsx' || ext === 'csv' || ext === 'pdf') {
          handleFileSelect(droppedFile);
        } else {
          showToast('Chỉ hỗ trợ tệp .xlsx, .csv hoặc .pdf', 'error');
        }
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [targetLang]);

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

        const isPdf = meta.fileName.toLowerCase().endsWith('.pdf');

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
              if (isPdf) {
                setTransPdfBuffer(cachedBuffer!);
                setTranslatedLang(targetLang);
              } else {
                const transWb = new ExcelJS.Workbook();
                await transWb.xlsx.load(cachedBuffer!);
                setTransWorkbook(transWb);
                setTranslatedLang(targetLang);
              }
            } catch (err) {
              console.error('Failed to load cached translation:', err);
            } finally {
              setLoading(false);
            }
          }, 50);
        } else {
          if (isPdf) {
            setTransPdfBuffer(null);
          } else {
            setTransWorkbook(null);
          }
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

      const isPdf = meta.fileName.toLowerCase().endsWith('.pdf');
      let restoredOrigWorkbook: ExcelJS.Workbook | null = null;
      let restoredTransWorkbook: ExcelJS.Workbook | null = null;

      if (isPdf) {
        setPdfBuffer(buffers.origBuffer);
        const data = await parsePdfDocument(buffers.origBuffer);
        setPdfData(data);

        // Restore translated PDF buffer if it exists for the current targetLang
        let cachedBuffer: ArrayBuffer | undefined;
        if (buffers.translations && buffers.translations[meta.targetLang]) {
          cachedBuffer = buffers.translations[meta.targetLang];
        } else if (buffers.transBuffer) {
          cachedBuffer = buffers.transBuffer;
        }

        if (cachedBuffer) {
          setTransPdfBuffer(cachedBuffer);
          setTranslatedLang(meta.targetLang);
        } else {
          setTransPdfBuffer(null);
          setTranslatedLang(null);
        }

        setOrigWorkbook(null);
        setTransWorkbook(null);
        setPdfTranslationMap(null);
      } else {
        // Restore original workbook
        const origWb = new ExcelJS.Workbook();
        await origWb.xlsx.load(buffers.origBuffer);
        restoredOrigWorkbook = origWb;
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
          restoredTransWorkbook = transWb;
          setTransWorkbook(transWb);
          setTranslatedLang(meta.targetLang);
        } else {
          setTransWorkbook(null);
          setTranslatedLang(null);
        }

        setPdfBuffer(null);
        setPdfData(null);
        setTransPdfBuffer(null);
        setPdfTranslationMap(null);
      }

      // Restore parameters
      const restoredTab = !isPdf && meta.activeTab === 'translated' && !restoredTransWorkbook
        ? 'original'
        : meta.activeTab;
      const restoredWorkbook = restoredTab === 'translated'
        ? restoredTransWorkbook
        : restoredOrigWorkbook;
      const restoredSheetIndex = isPdf
        ? 0
        : clampWorksheetIndex(meta.activeSheetIndex, restoredWorkbook?.worksheets.length ?? 0);

      setActiveSheetIndex(restoredSheetIndex);
      setPdfPageIndex(0);
      setActiveTab(restoredTab);
      setTargetLang(meta.targetLang);
      setFileSizeStr(meta.fileSizeStr);
      setActiveProjectId(id);
      setAiConversationId(meta.aiConversationId || null);
      setShowAiPanel(false);
      localStorage.setItem('active_project_id', id);
      setZoomLevel(isPdf ? 0.75 : 1.0);

      const mockFile = new File([buffers.origBuffer], meta.fileName, {
        type: isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
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
          setPdfBuffer(null);
          setPdfData(null);
          setTransPdfBuffer(null);
          setPdfTranslationMap(null);
          setActiveProjectId(null);
          setAiConversationId(null);
          setShowAiPanel(false);
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
    const normalizedTab = !pdfBuffer && tab === 'translated' && !transWorkbook
      ? 'original'
      : tab;
    const targetWorkbook = normalizedTab === 'original' ? origWorkbook : transWorkbook;
    const normalizedSheetIndex = pdfBuffer
      ? sheetIndex
      : clampWorksheetIndex(sheetIndex, targetWorkbook?.worksheets.length ?? 0);

    setActiveTab(normalizedTab);
    setActiveSheetIndex(normalizedSheetIndex);

    if (activeProjectId) {
      try {
        const meta = await getProjectMetadata(activeProjectId);
        if (meta) {
          const updatedMeta = {
            ...meta,
            activeSheetIndex: normalizedSheetIndex,
            activeTab: normalizedTab,
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

  // Process selected spreadsheet or PDF file
  const handleFileSelect = async (selectedFile: File) => {
    setLoading(true);
    setProgress(null);
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const isPdf = selectedFile.name.toLowerCase().endsWith('.pdf');

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
      
      if (isPdf) {
        const data = await parsePdfDocument(arrayBuffer);
        setPdfData(data);
        setPdfBuffer(arrayBuffer);
        setTransPdfBuffer(null);
        setPdfTranslationMap(null);
        setPdfColorsMap(new Map());
        setPdfPageIndex(0);
        setOrigWorkbook(null);
        setTransWorkbook(null);
        setSpreadsheetTranslationMap(new Map());
        setZoomLevel(0.75);
      } else {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(arrayBuffer);

        if (wb.worksheets.length === 0) {
          throw new Error('Tệp excel không chứa worksheet nào.');
        }

        setOrigWorkbook(wb);
        setTransWorkbook(null);
        setSpreadsheetTranslationMap(new Map());
        setTranslatedLang(null);
        setPdfBuffer(null);
        setPdfData(null);
        setTransPdfBuffer(null);
        setPdfTranslationMap(null);
        setPdfColorsMap(new Map());
        setPdfPageIndex(0);
        setZoomLevel(1.0);
      }

      await saveProject(newMeta, newBuffers);
      
      const list = await listProjects();
      setHistoryList(list);

      setTranslatedLang(null);
      setActiveSheetIndex(0);
      setActiveTab('original');
      setFile(selectedFile);
      setFileSizeStr(formatBytes(selectedFile.size));
      setActiveProjectId(newId);
      setAiConversationId(null);
      setShowAiPanel(false);
      localStorage.setItem('active_project_id', newId);

      showToast(`Đã tải tệp ${isPdf ? 'PDF' : 'bảng tính'} thành công!`);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Lỗi khi đọc tệp. Hãy kiểm tra định dạng.', 'error');
      setFile(null);
      setOrigWorkbook(null);
      setPdfBuffer(null);
    } finally {
      setLoading(false);
    }
  };

  const handleUrlImport = async (url: string) => {
    if (!url.trim()) return;
    
    setLoading(true);
    setImportLoading(true);
    try {
      const token = await getFirebaseIdToken();
      const response = await fetch(`/api/proxy-sheet?url=${encodeURIComponent(url.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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

  // Clear current document view (deselect/close file, keeping it in history)
  const handleClearFile = () => {
    setFile(null);
    setOrigWorkbook(null);
    setTransWorkbook(null);
    setSpreadsheetTranslationMap(new Map());
    setPdfBuffer(null);
    setPdfData(null);
    setTransPdfBuffer(null);
    setPdfTranslationMap(null);
    setPdfColorsMap(new Map());
    setPdfPageIndex(0);
    setTranslatedLang(null);
    setActiveProjectId(null);
    setAiConversationId(null);
    setShowAiPanel(false);
    localStorage.removeItem('active_project_id');
    showToast('Đã đóng tài liệu.');
  };

  // Run document translation
  const handleTranslate = async () => {
    if ((!origWorkbook && !pdfBuffer) || !file) return;

    if (translationMode === 'gemini' && !geminiApiKey.trim()) {
      showToast('Vui lòng điền Gemini API Key để dịch bằng AI.', 'error');
      return;
    }

    setLoading(true);
    cancelTranslationRef.current = false;
    setProgress({ current: 0, total: 100, percentage: 0 });

    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        if (!pdfBuffer || !pdfData) {
          throw new Error('Dữ liệu PDF chưa được nạp đầy đủ.');
        }

        // Pre-populate with existing translations to resume
        const newPdfTranslationMap = new Map<string, string>(pdfTranslationMap || new Map());

        // 1. Gather all text elements that need translation
        const textsToTranslate: string[] = [];
        pdfData.pages.forEach((page) => {
          page.items.forEach((item) => {
            if (needsTranslation(item.str) && !newPdfTranslationMap.has(item.str)) {
              textsToTranslate.push(item.str);
            }
          });
        });

        if (textsToTranslate.length === 0) {
          setTransPdfBuffer(pdfBuffer);
          setActiveTab('translated');
          showToast('Tài liệu PDF không chứa nội dung chữ cần dịch.');
          setLoading(false);
          return;
        }

        // 2. Execute translation engine
        const translationMap = await translateTexts(
          textsToTranslate,
          sourceLang,
          targetLang,
          translationMode,
          geminiApiKey,
          (progressInfo) => {
            setProgress(progressInfo);
          },
          () => cancelTranslationRef.current
        );

        // Merge translation results
        translationMap.forEach((val, key) => {
          newPdfTranslationMap.set(key, val);
        });

        const isCancelled = cancelTranslationRef.current;

        // Check translation rate
        let translatedCount = 0;
        translationMap.forEach((val, key) => {
          if (val !== key) {
            translatedCount++;
          }
        });

        if (!isCancelled && textsToTranslate.length > 0 && translatedCount === 0 && sourceLang !== targetLang) {
          showToast('Lỗi dịch: Google Dịch đã chặn (Rate Limit) do tài liệu quá lớn. Hãy chuyển sang dùng Gemini API trong phần cấu hình!', 'error');
          setLoading(false);
          return;
        }

        setPdfTranslationMap(newPdfTranslationMap);

        // 3. Compile translated PDF using pdf-lib on-the-fly and save it
        const compiledPdf = await compileTranslatedPdf(pdfBuffer, pdfData, newPdfTranslationMap, pdfColorsMap);
        setTransPdfBuffer(compiledPdf);
        setTranslatedLang(targetLang);
        setActiveTab('translated');

        if (activeProjectId) {
          try {
            const meta = await getProjectMetadata(activeProjectId);
            if (meta) {
              const buffers = await getProjectBuffers(activeProjectId);
              const translations = buffers?.translations || {};
              translations[targetLang] = compiledPdf;

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
                origBuffer: buffers!.origBuffer,
                transBuffer: compiledPdf,
                translations
              });

              const list = await listProjects();
              setHistoryList(list);
            }
          } catch (dbErr) {
            console.error('Failed to update PDF project in database:', dbErr);
          }
        }

        if (isCancelled) {
          showToast('Đã dừng dịch. Đã lưu và hiển thị bản dịch một phần.');
        } else {
          showToast('Dịch tệp PDF thành công!');
        }
      } else {
        // Excel File Translation Flow
        const clonedWb = new ExcelJS.Workbook();
        const originalBuffer = await origWorkbook!.xlsx.writeBuffer();
        await clonedWb.xlsx.load(originalBuffer);

        // Pre-populate with existing translations to resume
        const newSpreadsheetTranslationMap = new Map<string, string>(spreadsheetTranslationMap || new Map());

        // 2. Fetch cell unique text collections and sheet names
        const textsToTranslate: string[] = [];
        clonedWb.eachSheet((sheet) => {
          if (needsTranslation(sheet.name) && !newSpreadsheetTranslationMap.has(sheet.name)) {
            textsToTranslate.push(sheet.name);
          }
          sheet.eachRow((row) => {
            row.eachCell((cell) => {
              const txt = getCellText(cell);
              if (needsTranslation(txt) && !newSpreadsheetTranslationMap.has(txt)) {
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
          },
          () => cancelTranslationRef.current
        );

        // Merge translation results
        translationMap.forEach((val, key) => {
          newSpreadsheetTranslationMap.set(key, val);
        });
        setSpreadsheetTranslationMap(newSpreadsheetTranslationMap);

        const isCancelled = cancelTranslationRef.current;

        // Check translation rate
        let translatedCount = 0;
        translationMap.forEach((val, key) => {
          if (val !== key) {
            translatedCount++;
          }
        });

        if (!isCancelled && textsToTranslate.length > 0 && translatedCount === 0 && sourceLang !== targetLang) {
          showToast('Lỗi dịch: Google Dịch đã chặn (Rate Limit) do tài liệu quá lớn. Hãy chuyển sang dùng Gemini API trong phần cấu hình!', 'error');
          setLoading(false);
          return;
        }

        // 4. Overwrite text values and sheet names in clone workbook
        clonedWb.eachSheet((sheet) => {
          if (newSpreadsheetTranslationMap.has(sheet.name)) {
            const translatedName = newSpreadsheetTranslationMap.get(sheet.name);
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
              if (txt && newSpreadsheetTranslationMap.has(txt)) {
                const translatedVal = newSpreadsheetTranslationMap.get(txt);
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
              const origBuffer = await origWorkbook!.xlsx.writeBuffer();
              const transBuffer = await clonedWb.xlsx.writeBuffer();
              
              const buffers = await getProjectBuffers(activeProjectId);
              const translations = buffers?.translations || {};
              translations[targetLang] = transBuffer;

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

        if (isCancelled) {
          showToast('Đã dừng dịch. Đã lưu và hiển thị bản dịch một phần.');
        } else {
          showToast('Dịch bảng tính thành công!');
        }
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Có lỗi xảy ra trong quá trình dịch.', 'error');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const handlePdfColorsDetected = (colors: Map<string, { bg: string; text: string }>) => {
    setPdfColorsMap(prev => {
      const next = new Map(prev);
      colors.forEach((val, key) => {
        next.set(key, val);
      });
      return next;
    });
  };

  // Download translated file
  const handleDownload = async () => {
    if ((!transWorkbook && !transPdfBuffer) || !file) return;

    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf');
      
      let buffer: ArrayBuffer;
      let mimeType: string;
      let suffix: string;

      if (isPdf) {
        buffer = transPdfBuffer!;
        mimeType = 'application/pdf';
        suffix = `_translated_${targetLang}.pdf`;
      } else {
        buffer = await transWorkbook!.xlsx.writeBuffer();
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const dotIndex = file.name.lastIndexOf('.');
        const ext = dotIndex > -1 ? file.name.slice(dotIndex) : '.xlsx';
        suffix = `_translated_${targetLang}${ext}`;
      }

      const blob = new Blob([buffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      
      const dotIndex = file.name.lastIndexOf('.');
      const name = dotIndex > -1 ? file.name.slice(0, dotIndex) : file.name;
      
      a.href = url;
      a.download = `${name}${suffix}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Đã tải xuống bản dịch thành công!');
    } catch (err) {
      console.error(err);
      showToast('Lỗi khi chuẩn bị tệp tải xuống.', 'error');
    }
  };

  // Resolve current active sheet by its zero-based display position.
  const handleAiAccessKeyChange = (key: string) => {
    setAiAccessKeyState(key);
    setAiAccessStatus('idle');
    clearAiAccessKey();
    setShowAiPanel(false);
  };

  const handlePairAiAccess = async () => {
    setAiAccessStatus('pairing');
    try {
      await pairAiAccessKey(aiAccessKey);
      setAiAccessStatus('connected');
      showToast('Đã kết nối quyền truy cập AI Chat.');
    } catch (error) {
      setAiAccessStatus('error');
      showToast(error instanceof Error ? error.message : 'Không thể xác thực secret key.', 'error');
    }
  };

  const handleAiConversationCreated = async (conversationId: string) => {
    setAiConversationId(conversationId);
    if (!activeProjectId) return;

    const meta = await getProjectMetadata(activeProjectId);
    if (!meta) return;

    await updateProjectMetadata({ ...meta, aiConversationId: conversationId });
    setHistoryList(await listProjects());
  };

  const handleAiConversationReset = async () => {
    setAiConversationId(null);
    if (!activeProjectId) return;

    const meta = await getProjectMetadata(activeProjectId);
    if (!meta) return;

    await updateProjectMetadata({ ...meta, aiConversationId: undefined });
    setHistoryList(await listProjects());
  };

  const activeWorkbook = activeTab === 'original' ? origWorkbook : transWorkbook;
  const effectiveActiveSheetIndex = useMemo(
    () => clampWorksheetIndex(activeSheetIndex, activeWorkbook?.worksheets.length ?? 0),
    [activeSheetIndex, activeWorkbook]
  );
  const activeWorksheet = useMemo(
    () => getWorksheetAt(activeWorkbook, effectiveActiveSheetIndex),
    [activeWorkbook, effectiveActiveSheetIndex]
  );
  const originalWorksheet = useMemo(
    () => getWorksheetAt(origWorkbook, effectiveActiveSheetIndex),
    [origWorkbook, effectiveActiveSheetIndex]
  );
  const translatedWorksheet = useMemo(
    () => getWorksheetAt(transWorkbook, effectiveActiveSheetIndex),
    [transWorkbook, effectiveActiveSheetIndex]
  );

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
                <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                  {pdfBuffer ? 'Đang dịch tài liệu PDF...' : 'Đang dịch bảng tính...'}
                </p>
                <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '12px' }}>
                  {pdfBuffer 
                    ? `Đã dịch ${progress.current}/${progress.total} dòng chữ` 
                    : `Đã dịch ${progress.current}/${progress.total} cụm từ`}
                </p>
              </div>
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${progress.percentage}%` }}></div>
              </div>
              <p style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '16px' }}>{progress.percentage}%</p>
              
              {/* Stop Button */}
              <button
                type="button"
                className="btn btn-secondary"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  fontSize: '12px',
                  padding: '6px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
                onClick={() => {
                  cancelTranslationRef.current = true;
                }}
              >
                Dừng Dịch
              </button>
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
            disabled={
              !(origWorkbook || pdfBuffer) || 
              loading || 
              ((pdfBuffer ? transPdfBuffer !== null : transWorkbook !== null) && targetLang === translatedLang)
            }
            isTranslated={
              (pdfBuffer ? transPdfBuffer !== null : transWorkbook !== null) && targetLang === translatedLang
            }
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
        {(origWorkbook || pdfBuffer) && (
          <div className="global-toolbar">
            {pdfBuffer ? (
              <PdfToolbar 
                sidebarCollapsed={sidebarCollapsed}
                setSidebarCollapsed={setSidebarCollapsed}
              />
            ) : (
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
            )}
            <div className="top-bar-right">
              {/* Download Button */}
              {((transWorkbook && !pdfBuffer) || (transPdfBuffer && pdfBuffer)) && activeTab === 'translated' && (
                <button 
                  type="button"
                  className="btn btn-secondary" 
                  style={{ padding: '4px 10px', height: '28px', fontSize: '12px' }}
                  onClick={handleDownload}
                >
                  <FileDown size={14} />
                  Tải Bản Dịch
                </button>
              )}

              {(pdfBuffer ? pdfData : origWorkbook) && (
                <button
                  type="button"
                  className={`btn btn-secondary ai-chat-toggle ${showAiPanel ? 'active' : ''}`}
                  onClick={() => {
                    if (aiAccessStatus !== 'connected') {
                      setShowSettingsModal(true);
                      return;
                    }
                    setShowAiPanel(current => !current);
                  }}
                  title={aiAccessStatus === 'connected'
                    ? (showAiPanel
                        ? 'Đóng trợ lý AI'
                        : (pdfBuffer ? 'Phân tích tài liệu PDF bằng AI' : 'Phân tích bảng tính bằng AI'))
                    : 'Kết nối secret key để sử dụng AI Chat'}
                >
                  <MessageSquare size={14} />
                  AI Chat
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
        {(origWorkbook || pdfBuffer) && (
          <div className="global-mode-bar">
            <div className="tabs-container">
              <button 
                type="button"
                className={`tab-btn ${activeTab === 'original' ? 'active' : ''}`}
                onClick={() => handleViewChange('original', effectiveActiveSheetIndex)}
              >
                Trước khi dịch
              </button>
              <button 
                type="button"
                className={`tab-btn ${activeTab === 'translated' ? 'active' : ''}`}
                disabled={pdfBuffer ? !transPdfBuffer : !transWorkbook}
                onClick={() => handleViewChange('translated', effectiveActiveSheetIndex)}
                title={!(pdfBuffer ? transPdfBuffer : transWorkbook) ? 'Vui lòng nhấn "Dịch Ngay" trước' : ''}
              >
                Sau khi dịch
              </button>
            </div>
          </div>
        )}

        {/* Document Rendering Workspace */}
        {pdfBuffer ? (
          <PdfViewer
            pdfBuffer={activeTab === 'original' ? pdfBuffer : (transPdfBuffer || pdfBuffer)}
            pdfData={pdfData}
            activeTab={activeTab}
            translationMap={pdfTranslationMap}
            zoomLevel={zoomLevel}
            onZoomChange={setZoomLevel}
            onColorsDetected={handlePdfColorsDetected}
            currentPageIndex={pdfPageIndex}
            onPageChange={setPdfPageIndex}
          />
        ) : activeWorksheet ? (
          <SheetViewer 
            ref={sheetViewerRef}
            worksheet={activeWorksheet}
            originalWorksheet={originalWorksheet}
            translatedWorksheet={translatedWorksheet}
            showGridlines={showGridlines}
            zoomLevel={zoomLevel}
            onZoomChange={setZoomLevel}
            fontSizeOffset={fontSizeOffset}
            onShowToast={showToast}
            selectionMode={selectionMode}
            selectedRanges={selectedRanges}
            onSelectionChange={setSelectedRanges}
            onSelectionModeChange={setSelectionMode}
          />
        ) : origWorkbook ? (
          <div className="sheet-empty-state" style={{ flex: 1 }}>
            <FileSpreadsheet size={48} strokeWidth={1.5} />
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>Không thể hiển thị trang tính</h2>
            <p style={{ maxWidth: '280px', fontSize: '12px' }}>
              Trang tính đã chọn không tồn tại hoặc tệp không chứa trang tính hợp lệ.
            </p>
          </div>
        ) : (
          <div className="sheet-empty-state" style={{ flex: 1 }}>
            <FileSpreadsheet size={48} strokeWidth={1.5} />
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>Chưa tải tài liệu</h2>
            <p style={{ maxWidth: '280px', fontSize: '12px' }}>
              Hãy kéo thả hoặc tải lên một tệp Excel hoặc PDF để dịch và duyệt dữ liệu.
            </p>
          </div>
        )}

        {/* Worksheet selector tabs (Only for Excel) */}
        {!pdfBuffer && sheetNames.length > 0 && (
          <SheetSelector 
            sheetNames={sheetNames}
            activeIndex={effectiveActiveSheetIndex}
            onSelect={(index) => handleViewChange(activeTab, index)}
          />
        )}
      </main>

      {showAiPanel
        && aiAccessStatus === 'connected'
        && activeProjectId
        && file
        && (pdfBuffer ? pdfData : origWorkbook)
        && (
          <AiChatPanel
            workbook={pdfBuffer ? null : origWorkbook}
            activeSheetIndex={effectiveActiveSheetIndex}
            pdfData={pdfBuffer ? pdfData : null}
            activePdfPageIndex={pdfPageIndex}
            projectId={activeProjectId}
            fileName={file.name}
            conversationId={aiConversationId}
            onConversationCreated={handleAiConversationCreated}
            onConversationSelected={handleAiConversationCreated}
            onConversationReset={handleAiConversationReset}
            onClose={() => setShowAiPanel(false)}
            selectionMode={selectionMode}
            selectedRanges={selectedRanges}
            onSelectionChange={setSelectedRanges}
            onSelectionModeChange={setSelectionMode}
          />
        )}

      {/* Settings Configuration Modal */}
      <SettingsModal 
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        translationMode={translationMode}
        setTranslationMode={setTranslationMode}
        geminiApiKey={geminiApiKey}
        setGeminiApiKey={setGeminiApiKey}
        aiAccessKey={aiAccessKey}
        setAiAccessKey={handleAiAccessKeyChange}
        aiAccessStatus={aiAccessStatus}
        onPairAiAccess={handlePairAiAccess}
        showGridlines={showGridlines}
        setShowGridlines={setShowGridlines}
      />

      {/* Global Drag and Drop Overlay */}
      {isDragActive && (
        <div className="global-drag-overlay">
          <div className="global-drag-box">
            <Upload size={48} className="global-drag-icon" />
            <h2 className="global-drag-title">Thả tệp vào đây để tải lên</h2>
            <p className="global-drag-desc">Hỗ trợ tệp bảng tính (.xlsx, .csv) hoặc PDF (.pdf)</p>
          </div>
        </div>
      )}
    </div>
  );
};

