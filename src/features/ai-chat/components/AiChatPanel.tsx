import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Send, Square, X, Info, Plus, Trash2, ChevronDown } from 'lucide-react';
import { useAiChat } from '../hooks/useAiChat';
import { getConversations, deleteConversation } from '../services/chatApi';

interface AiChatPanelProps {
  workbook: any;
  activeSheetIndex: number;
  projectId: string;
  fileName: string;
  conversationId: string | null;
  onConversationCreated: (conversationId: string) => void | Promise<void>;
  onClose: () => void;
  selectionMode?: 'idle' | 'selecting';
  selectedRanges?: Array<{ startRow: number; startCol: number; endRow: number; endCol: number }>;
  onSelectionModeChange?: (mode: 'idle' | 'selecting') => void;
  onSelectionChange?: (ranges: Array<{ startRow: number; startCol: number; endRow: number; endCol: number }>) => void;
  onConversationSelected?: (conversationId: string) => void | Promise<void>;
  onConversationReset?: () => void | Promise<void>;
}

function getColLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp > 0) {
    let tempCol = (temp - 1) % 26;
    letter = String.fromCharCode(tempCol + 65) + letter;
    temp = Math.floor((temp - tempCol - 1) / 26);
  }
  return letter;
}

function estimateCost(inputTokens: number, outputTokens: number, model?: string): string {
  let inputPricePerM = 0.075;
  let outputPricePerM = 0.30;

  const lowerModel = (model || '').toLowerCase();
  if (lowerModel.includes('pro')) {
    inputPricePerM = 1.25;
    outputPricePerM = 5.00;
  }

  const inputCost = (inputTokens / 1_000_000) * inputPricePerM;
  const outputCost = (outputTokens / 1_000_000) * outputPricePerM;
  const totalCost = inputCost + outputCost;

  if (totalCost === 0) return '$0.00';
  if (totalCost < 0.0001) return '< $0.0001';
  return `$${totalCost.toFixed(5)}`;
}

type ScopeMode = SheetScope['type'];

function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  const flushList = (key: number) => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${key}`} style={{ paddingLeft: '20px', margin: '8px 0', listStyleType: 'disc' }}>
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  const parseInline = (line: string): React.ReactNode[] => {
    const inlineParts: React.ReactNode[] = [];
    let currentText = '';
    let i = 0;

    while (i < line.length) {
      if (line.startsWith('**', i)) {
        if (currentText) {
          inlineParts.push(currentText);
          currentText = '';
        }
        const endIdx = line.indexOf('**', i + 2);
        if (endIdx !== -1) {
          const boldText = line.slice(i + 2, endIdx);
          inlineParts.push(<strong key={`bold-${i}`}>{boldText}</strong>);
          i = endIdx + 2;
          continue;
        }
      }

      if (line.startsWith('`', i)) {
        if (currentText) {
          inlineParts.push(currentText);
          currentText = '';
        }
        const endIdx = line.indexOf('`', i + 1);
        if (endIdx !== -1) {
          const codeText = line.slice(i + 1, endIdx);
          inlineParts.push(
            <code key={`code-${i}`} style={{
              backgroundColor: 'rgba(0,0,0,0.06)',
              padding: '2px 4px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '0.9em'
            }}>
              {codeText}
            </code>
          );
          i = endIdx + 1;
          continue;
        }
      }

      currentText += line[i];
      i++;
    }

    if (currentText) {
      inlineParts.push(currentText);
    }
    return inlineParts;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushList(index);
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-block-${index}`} style={{
            backgroundColor: 'var(--bg-app-header, #0f172a)',
            border: '1px solid var(--border-subtle, #334155)',
            borderRadius: '6px',
            padding: '8px 12px',
            overflowX: 'auto',
            margin: '8px 0',
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#f8fafc',
            whiteSpace: 'pre-wrap'
          }}>
            <code>{codeBlockContent.join('\n')}</code>
          </pre>
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      return;
    }

    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushList(index);
      elements.push(
        <hr 
          key={`hr-${index}`} 
          style={{ 
            border: 'none', 
            borderTop: '1px solid var(--border-subtle, #334155)', 
            margin: '12px 0' 
          }} 
        />
      );
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      flushList(index);
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const fontSize = level === 1 ? '1.35em' : level === 2 ? '1.2em' : '1.05em';
      elements.push(
        <div 
          key={`h-${index}`} 
          style={{ 
            fontSize, 
            fontWeight: 'bold', 
            marginTop: '10px', 
            marginBottom: '4px',
            color: 'var(--text-main)' 
          }}
        >
          {parseInline(content)}
        </div>
      );
      return;
    }

    if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      const content = line.replace(/^\s*[\*\-]\s/, '');
      listItems.push(<li key={`li-${index}`} style={{ margin: '4px 0' }}>{parseInline(content)}</li>);
      return;
    }

    const numberedMatch = trimmed.match(/^(\d+)\.\s(.*)/);
    if (numberedMatch) {
      flushList(index);
      const num = numberedMatch[1];
      const content = numberedMatch[2];
      elements.push(
        <div key={`num-${index}`} style={{ margin: '6px 0', display: 'flex', gap: '6px' }}>
          <strong style={{ minWidth: '18px' }}>{num}.</strong>
          <div>{parseInline(content)}</div>
        </div>
      );
      return;
    }

    flushList(index);
    if (trimmed === '') {
      elements.push(<div key={`br-${index}`} style={{ height: '8px' }} />);
    } else {
      elements.push(<div key={`p-${index}`} style={{ margin: '6px 0' }}>{parseInline(line)}</div>);
    }
  });

  flushList(lines.length);

  if (inCodeBlock && codeBlockContent.length > 0) {
    elements.push(
      <pre key="code-block-unfinished" style={{
        backgroundColor: 'var(--bg-app-header, #0f172a)',
        border: '1px solid var(--border-subtle, #334155)',
        borderRadius: '6px',
        padding: '8px 12px',
        overflowX: 'auto',
        margin: '8px 0',
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#f8fafc',
        whiteSpace: 'pre-wrap'
      }}>
        <code>{codeBlockContent.join('\n')}</code>
      </pre>
    );
  }

  return <div style={{ whiteSpace: 'normal' }}>{elements}</div>;
}

export function AiChatPanel({
  workbook,
  activeSheetIndex,
  projectId,
  fileName,
  conversationId,
  onConversationCreated,
  onClose,
  selectionMode = 'idle',
  selectedRanges = [],
  onSelectionModeChange,
  onSelectionChange,
  onConversationSelected,
  onConversationReset
}: AiChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [scopeMode, setScopeMode] = useState<ScopeMode>('current');
  const [selectedSheetIndices, setSelectedSheetIndices] = useState<number[]>([activeSheetIndex]);
  const messageListRef = useRef<HTMLDivElement>(null);
  const [historyList, setHistoryList] = useState<Array<{ id: string; title?: string; updatedAt: string }>>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsHistoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const loadHistory = React.useCallback(() => {
    getConversations(projectId)
      .then(list => {
        setHistoryList(list.map(item => ({
          id: item.id,
          title: item.title,
          updatedAt: item.updatedAt
        })));
      })
      .catch(() => {});
  }, [projectId]);

  const chat = useAiChat({
    workbook,
    projectId,
    fileName,
    conversationId,
    onConversationCreated: async (id) => {
      await onConversationCreated(id);
      loadHistory();
    },
  });

  useEffect(() => {
    loadHistory();
  }, [loadHistory, conversationId]);

  useEffect(() => {
    if (scopeMode === 'current') setSelectedSheetIndices([activeSheetIndex]);
  }, [activeSheetIndex, scopeMode]);

  useEffect(() => {
    const element = messageListRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [chat.messages]);

  const { totalTokens, totalCost } = useMemo(() => {
    let tokens = 0;
    let cost = 0;
    chat.messages.forEach(msg => {
      if (msg.usage) {
        tokens += msg.usage.inputTokens + msg.usage.outputTokens;
        
        let inputPricePerM = 0.075;
        let outputPricePerM = 0.30;
        const lowerModel = (msg.usage.model || '').toLowerCase();
        if (lowerModel.includes('pro')) {
          inputPricePerM = 1.25;
          outputPricePerM = 5.00;
        }
        cost += (msg.usage.inputTokens / 1_000_000) * inputPricePerM + (msg.usage.outputTokens / 1_000_000) * outputPricePerM;
      }
    });
    return { totalTokens: tokens, totalCost: cost };
  }, [chat.messages]);

  const scope = useMemo<SheetScope>(() => {
    if (scopeMode === 'all') return { type: 'all' };
    if (scopeMode === 'selected') {
      return { type: 'selected', sheetIndices: selectedSheetIndices };
    }
    if (scopeMode === 'range') {
      return {
        type: 'range',
        sheetIndex: activeSheetIndex,
        ranges: selectedRanges
      };
    }
    return { type: 'current', sheetIndex: activeSheetIndex };
  }, [activeSheetIndex, scopeMode, selectedSheetIndices, selectedRanges]);

  const submit = () => {
    if (!draft.trim()) return;
    if (scopeMode === 'selected' && selectedSheetIndices.length === 0) return;
    if (scopeMode === 'range' && selectedRanges.length === 0) return;
    const content = draft;
    setDraft('');
    void chat.sendMessage(content, scope);
  };

  const DEFAULT_WIDTH = 380;
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const isResizing = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      const minW = 300;
      const maxW = Math.floor(window.innerWidth * 0.75);
      if (newWidth >= minW && newWidth <= maxW) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleDoubleClick = () => {
    setWidth(DEFAULT_WIDTH);
  };

  const handleDeleteConversation = async (id: string, title: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa cuộc trò chuyện "${title}" không? Toàn bộ lịch sử tin nhắn sẽ bị xóa vĩnh viễn.`)) {
      try {
        await deleteConversation(id);
        if (id === conversationId && onConversationReset) {
          await onConversationReset();
        }
        loadHistory();
      } catch {
        alert('Không thể xóa cuộc trò chuyện này.');
      }
    }
  };

  const toggleSheet = (index: number) => {
    setSelectedSheetIndices(current => (
      current.includes(index)
        ? current.filter(item => item !== index)
        : [...current, index].sort((a, b) => a - b)
    ));
  };

  return (
    <aside className="ai-chat-panel" style={{ width: `${width}px`, position: 'relative' }}>
      <div 
        className="ai-chat-resize-handle"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        title="Kéo để thay đổi kích thước, Nhấp đúp để đặt lại mặc định"
      />
      <div className="ai-chat-header" style={{ paddingRight: '6px', height: 'auto', minHeight: '52px', padding: '8px 12px', alignItems: 'flex-start' }}>
        <div className="ai-chat-title-group" style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }} ref={dropdownRef}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)' }}>
            <Bot size={17} style={{ flexShrink: 0 }} />
            <strong style={{ fontSize: '13px', color: 'var(--text-main)', fontWeight: 700 }}>Phân tích bảng tính</strong>
          </div>
          {historyList.length > 0 && (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button 
                type="button" 
                onClick={() => setIsHistoryOpen(!isHistoryOpen)} 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted, #64748b)',
                  cursor: 'pointer',
                  padding: '2px 0',
                  fontSize: '11px',
                  fontWeight: 500,
                  textAlign: 'left',
                  outline: 'none'
                }}
              >
                <span style={{ 
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis',
                  maxWidth: '180px'
                }}>
                  {`Phiên: ${(() => {
                    if (!conversationId) return 'Hội thoại mới';
                    const activeIdx = historyList.findIndex(h => h.id === conversationId);
                    if (activeIdx === -1) return 'Hội thoại mới';
                    const activeItem = historyList[activeIdx];
                    return activeItem.title && activeItem.title !== 'Hội thoại mới' 
                      ? activeItem.title 
                      : `Hội thoại ${historyList.length - activeIdx}`;
                  })()}`}
                </span>
                <ChevronDown size={12} style={{ opacity: 0.7, flexShrink: 0 }} />
              </button>

              {isHistoryOpen && (
                <div 
                  className="card-shadow"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    width: '260px',
                    background: 'var(--bg-panel, #ffffff)',
                    border: '1px solid var(--border-subtle, #cbd5e1)',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    zIndex: 50,
                    maxHeight: '220px',
                    overflowY: 'auto',
                    padding: '4px 0'
                  }}
                >
                  {historyList.map((item, idx) => {
                    const date = new Date(item.updatedAt);
                    const titleStr = item.title && item.title !== 'Hội thoại mới' ? item.title : `Hội thoại ${historyList.length - idx}`;
                    const isSelected = item.id === conversationId;
                    return (
                      <div 
                        key={item.id} 
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 12px 6px 9px',
                          fontSize: '11px',
                          color: isSelected ? 'var(--accent, #3b82f6)' : 'var(--text-main, #0f172a)',
                          background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                          borderLeft: isSelected ? '3px solid var(--accent, #3b82f6)' : '3px solid transparent',
                          cursor: 'pointer',
                          transition: 'background 0.15s'
                        }}
                        onClick={() => {
                          if (onConversationSelected) onConversationSelected(item.id);
                          setIsHistoryOpen(false);
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'var(--bg-app, #f1f5f9)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1, textAlign: 'left' }}>
                          <span style={{ fontWeight: isSelected ? 700 : 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {titleStr}
                          </span>
                          <span style={{ fontSize: '9px', color: 'var(--text-muted, #64748b)' }}>
                            {date.toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        
                        <button
                          type="button"
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--text-muted, #64748b)',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '4px',
                            marginLeft: '8px',
                            flexShrink: 0
                          }}
                          onClick={async (e) => {
                            e.stopPropagation();
                            await handleDeleteConversation(item.id, titleStr);
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#ef4444';
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--text-muted)';
                            e.currentTarget.style.background = 'transparent';
                          }}
                          title="Xóa cuộc hội thoại"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {conversationId && (
            <button 
              type="button" 
              className="btn-icon" 
              onClick={onConversationReset} 
              title="Tạo cuộc hội thoại mới"
              style={{ color: 'var(--accent)' }}
            >
              <Plus size={16} />
            </button>
          )}
          <button type="button" className="btn-icon" onClick={onClose} title="Đóng trợ lý AI">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="ai-chat-controls">
        <label className="ai-scope-control">
          Phạm vi dữ liệu
          <select
            className="input-field"
            value={scopeMode}
            disabled={chat.isStreaming}
            onChange={event => setScopeMode(event.target.value as ScopeMode)}
          >
            <option value="current">Sheet hiện tại</option>
            <option value="selected">Chọn nhiều sheet</option>
            <option value="all">Tất cả sheet</option>
            <option value="range">Vùng chọn hiện tại</option>
          </select>
        </label>

        {scopeMode === 'range' && (
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Vùng chọn ({selectedRanges.length}):</span>
                {selectedRanges.length > 0 && (
                  <button
                    type="button"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--accent, #3b82f6)',
                      fontSize: '10px',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0
                    }}
                    onClick={() => onSelectionChange?.([])}
                  >
                    Xóa tất cả
                  </button>
                )}
              </div>
              {selectedRanges.length > 0 && (
                <div style={{ 
                  maxHeight: '60px', 
                  overflowY: 'auto', 
                  fontSize: '10px', 
                  color: 'var(--text-muted, #94a3b8)', 
                  fontFamily: 'monospace',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  padding: '2px 0'
                }}>
                  {selectedRanges.map((r, i) => {
                    const rText = `${getColLetter(Math.min(r.startCol, r.endCol))}${Math.min(r.startRow, r.endRow)}:${getColLetter(Math.max(r.startCol, r.endCol))}${Math.max(r.startRow, r.endRow)}`;
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-app, #f1f5f9)', color: 'var(--text-main, #0f172a)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle, #cbd5e1)' }}>
                        <span>Vùng {i + 1}: {rText}</span>
                        <button
                          type="button"
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--accent, #3b82f6)',
                            fontSize: '10px',
                            cursor: 'pointer',
                            padding: '0 4px',
                            fontWeight: 'bold',
                            lineHeight: 1
                          }}
                          onClick={() => {
                            if (onSelectionChange) {
                              onSelectionChange(selectedRanges.filter((_, idx) => idx !== i));
                            }
                          }}
                          title="Xóa vùng chọn này"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              type="button"
              className={`btn ${selectionMode === 'selecting' ? 'btn-secondary' : 'btn-primary'}`}
              style={{ width: '100%', padding: '6px 12px', fontSize: '11px' }}
              onClick={() => onSelectionModeChange?.(selectionMode === 'selecting' ? 'idle' : 'selecting')}
            >
              {selectionMode === 'selecting' ? 'Đang quét chọn...' : 'Chọn vùng dữ liệu'}
            </button>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
              * Giữ Ctrl/Cmd khi kéo chuột để chọn nhiều vùng
            </div>
          </div>
        )}

        {scopeMode === 'selected' && (
          <div className="ai-sheet-picker">
            {workbook.worksheets.map((sheet, index) => (
              <label key={sheet.id} className="ai-sheet-option">
                <input
                  type="checkbox"
                  checked={selectedSheetIndices.includes(index)}
                  disabled={chat.isStreaming}
                  onChange={() => toggleSheet(index)}
                />
                <span title={sheet.name}>{sheet.name}</span>
              </label>
            ))}
          </div>
        )}

      </div>

      <div ref={messageListRef} className="ai-chat-messages">
        {chat.isLoadingHistory ? (
          <div className="ai-chat-status">Đang tải cuộc trò chuyện...</div>
        ) : chat.messages.length === 0 ? (
          <div className="ai-chat-empty" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <Bot size={32} strokeWidth={1.5} style={{ color: 'var(--accent, #3b82f6)' }} />
              <strong style={{ fontSize: '13px' }}>Hỏi AI về dữ liệu trong sheet</strong>
              <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', textAlign: 'center' }}>
                Chọn một câu hỏi gợi ý bên dưới hoặc tự nhập câu hỏi ở ô chat
              </span>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: '8px', 
              width: '100%', 
              marginTop: '8px'
            }}>
              {[
                { 
                  title: '📊 Tóm tắt', 
                  desc: 'Tóm tắt sheet hiện tại',
                  prompt: 'Hãy tóm tắt các thông tin chính của sheet hiện tại.' 
                },
                { 
                  title: '🔍 Lọc lỗi', 
                  desc: 'Tìm các dòng lỗi hoặc trống',
                  prompt: 'Hãy tìm giúp tôi các giá trị bất thường, bị lỗi hoặc ô trống trong sheet này.' 
                },
                { 
                  title: '🏆 Tìm Max/Min', 
                  desc: 'Tìm dòng giá trị lớn nhất',
                  prompt: 'Hãy phân tích sheet này và chỉ ra dòng/cột có giá trị lớn nhất.' 
                },
                { 
                  title: '💡 Tối ưu hóa', 
                  desc: 'Gợi ý tối ưu công thức',
                  prompt: 'Hãy gợi ý cách tối ưu hóa các công thức trong bảng tính này.' 
                }
              ].map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setDraft(item.prompt);
                    const inputEl = document.getElementById('ai-chat-input');
                    if (inputEl) inputEl.focus();
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '4px',
                    padding: '10px 12px',
                    background: 'var(--bg-app, #f1f5f9)',
                    border: '1px solid var(--border-subtle, #cbd5e1)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'left',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent, #3b82f6)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle, #cbd5e1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: '11px', color: 'var(--text-main, #0f172a)' }}>
                    {item.title}
                  </span>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted, #64748b)' }}>
                    {item.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {chat.hasMoreMessages && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', padding: '4px 8px', fontSize: '11px', marginBottom: '12px' }}
                disabled={chat.isLoadingMore}
                onClick={chat.loadMoreMessages}
              >
                {chat.isLoadingMore ? 'Đang tải...' : 'Tải tin nhắn cũ hơn'}
              </button>
            )}
            {chat.messages.map(message => (
              <div key={message.id} className={`ai-message ${message.role}`}>
                <div className="ai-message-role">
                  {message.role === 'user' ? 'Bạn' : 'AI'}
                </div>
                <div className="ai-message-content">
                  {message.content ? renderMarkdown(message.content) : (
                    chat.isStreaming && (
                      <div className="ai-loading-dots">
                        <div className="dot"></div>
                        <div className="dot"></div>
                        <div className="dot"></div>
                      </div>
                    )
                  )}
                </div>
                {message.usage && (
                  <div className="ai-message-usage" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <span>{message.usage.model} · {(message.usage.inputTokens + message.usage.outputTokens).toLocaleString()} tokens</span>
                    <div className="ai-usage-tooltip-trigger" style={{ display: 'inline-flex', cursor: 'pointer', position: 'relative' }}>
                      <Info size={11} style={{ color: 'var(--text-muted)' }} />
                      <div className="ai-usage-tooltip">
                        <div style={{ fontWeight: 600, marginBottom: '4px' }}>Chi tiết sử dụng:</div>
                        <div>Input: {message.usage.inputTokens.toLocaleString()} tokens</div>
                        <div>Output: {message.usage.outputTokens.toLocaleString()} tokens</div>
                        <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '4px', paddingTop: '4px', fontWeight: 600 }}>
                          Chi phí ước tính: {estimateCost(message.usage.inputTokens, message.usage.outputTokens, message.usage.model)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {totalTokens > 0 && (
        <div className="ai-chat-total-usage">
          <span>Tổng lượng hội thoại:</span>
          <span>
            <strong>{totalTokens.toLocaleString()} tokens</strong> (~{totalCost === 0 ? '$0.00' : totalCost < 0.0001 ? '< $0.0001' : `$${totalCost.toFixed(5)}`})
          </span>
        </div>
      )}

      <div className="ai-chat-composer">
        {chat.error && <div className="ai-chat-error">{chat.error}</div>}
        {scopeMode === 'selected' && selectedSheetIndices.length === 0 && (
          <div className="ai-chat-error">Vui lòng chọn ít nhất một sheet.</div>
        )}
        {scopeMode === 'range' && selectedRanges.length === 0 && (
          <div className="ai-chat-error">Vui lòng bấm nút chọn vùng và quét vùng ô trên sheet.</div>
        )}
        <div className="ai-chat-input-row">
          <textarea
            id="ai-chat-input"
            value={draft}
            disabled={chat.isStreaming}
            placeholder="Hỏi về dữ liệu trong bảng tính..."
            rows={3}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          {chat.isStreaming ? (
            <button type="button" className="ai-send-button stop" onClick={chat.stop} title="Dừng phản hồi">
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              className="ai-send-button"
              disabled={!draft.trim() || (scopeMode === 'selected' && selectedSheetIndices.length === 0)}
              onClick={submit}
              title="Gửi câu hỏi"
            >
              <Send size={16} />
            </button>
          )}
        </div>
        <div className="ai-chat-composer-options">
          <select
            className="input-field"
            aria-label="Chọn model AI"
            value={chat.selectedModel}
            disabled={chat.isStreaming || chat.models.length === 0}
            onChange={event => chat.setSelectedModel(event.target.value)}
          >
            {chat.models.map(model => (
              <option key={model.id} value={model.id}>{model.label}</option>
            ))}
          </select>
          <span className="ai-chat-hint">Enter để gửi · Shift + Enter để xuống dòng</span>
        </div>
      </div>
    </aside>
  );
}
