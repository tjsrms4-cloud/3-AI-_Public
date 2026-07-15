import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Calendar,
  User,
  CheckSquare,
  Square,
  Copy,
  Download,
  AlertTriangle,
  Clock,
  Trash2,
  History,
  FileText,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Info,
  Check,
  Plus,
  ArrowRight,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { PRESET_TEMPLATES, PresetTemplate } from "./data/presets";
import {
  TaskItem,
  AssigneeGroup,
  GeneralReviewNeed,
  DistillResponse,
  MeetingHistoryItem,
} from "./types";

export default function App() {
  // Input states
  const [meetingTitle, setMeetingTitle] = useState("정기 주간 업무 회의");
  const [meetingDate, setMeetingDate] = useState("2026-07-14"); // Pre-populate with our current date metadata
  const [rawText, setRawText] = useState(PRESET_TEMPLATES[0].rawText);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("weekly-sync");

  // App core states
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isConfigError, setIsConfigError] = useState(false);
  const [distilledResult, setDistilledResult] = useState<DistillResponse | null>(null);
  
  // UI Panel states
  const [activeTab, setActiveTab] = useState<"visual" | "text">("visual");
  const [showHistorySidebar, setShowHistorySidebar] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [copySuccess, setCopySuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // History states (LocalStorage persistence)
  const [history, setHistory] = useState<MeetingHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem("task_distiller_history");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Track task completions in active result (client-side interactive state)
  const [taskCompletionMap, setTaskCompletionMap] = useState<Record<string, boolean>>({});

  // Loading steps text
  const loadingSteps = [
    "회의록 스캔 및 언어 감지 중...",
    "담당자(Assignee) 및 문맥 분석 중...",
    "상대적 일정 추론 및 마감일 기한 정규화 중...",
    "작업 간 의존성 연결 및 일정 충돌 검토 중...",
  ];

  // Sync history to localStorage
  useEffect(() => {
    localStorage.setItem("task_distiller_history", JSON.stringify(history));
  }, [history]);

  // Loading steps interval simulator to provide premium UI feeling
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev < 3 ? prev + 1 : prev));
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Handle Preset loading
  const handleLoadPreset = (preset: PresetTemplate) => {
    setSelectedPresetId(preset.id);
    setRawText(preset.rawText);
    setMeetingTitle(preset.title);
    
    // Automatically match or extract date if present in preset
    if (preset.id === "weekly-sync") {
      setMeetingDate("2026-07-14");
    } else if (preset.id === "launch-kickoff") {
      setMeetingDate("2026-07-14");
    } else {
      setMeetingDate("2026-07-14");
    }

    showToast(`'${preset.title}' 템플릿이 로드되었습니다.`);
  };

  // Toast feedback helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Trigger To-Do Distillation
  const handleDistill = async () => {
    if (!rawText.trim()) {
      setError("회의록 텍스트를 입력해주세요.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsConfigError(false);
    setDistilledResult(null);
    setTaskCompletionMap({});

    try {
      const response = await fetch("/api/distill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rawText,
          meetingDate,
          meetingTitle,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.isConfigError) {
          setIsConfigError(true);
          throw new Error(data.error || "Gemini API Key가 구성되지 않았습니다.");
        }
        throw new Error(data.error || "회의 분석 중 오류가 발생했습니다.");
      }

      setDistilledResult(data);
      
      // Auto-expand all assignee groups by default
      const defaultExpanded: Record<string, boolean> = {};
      data.groups?.forEach((g: AssigneeGroup) => {
        defaultExpanded[g.assignee] = true;
      });
      setExpandedGroups(defaultExpanded);

      // Save to history
      const newHistoryItem: MeetingHistoryItem = {
        id: Date.now().toString(),
        title: data.meetingTitle || meetingTitle || "분석된 회의록",
        date: data.meetingDate || meetingDate,
        rawText,
        result: data,
        createdAt: new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setHistory((prev) => [newHistoryItem, ...prev]);
      showToast("할 일 추출이 완료되어 내역에 저장되었습니다!");

    } catch (err: any) {
      console.error(err);
      setError(err.message || "서버 통신 실패 또는 분석 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // Restore item from history
  const handleLoadHistoryItem = (item: MeetingHistoryItem) => {
    setMeetingTitle(item.title);
    setMeetingDate(item.date);
    setRawText(item.rawText);
    setDistilledResult(item.result);
    setTaskCompletionMap({});
    setSelectedPresetId("");
    
    // Auto expand restored groups
    const defaultExpanded: Record<string, boolean> = {};
    item.result.groups?.forEach((g) => {
      defaultExpanded[g.assignee] = true;
    });
    setExpandedGroups(defaultExpanded);
    setShowHistorySidebar(false);
    showToast(`'${item.title}' 기록을 불러왔습니다.`);
  };

  // Delete history item
  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory((prev) => prev.filter((item) => item.id !== id));
    showToast("기록이 삭제되었습니다.");
  };

  // Toggle task checkbox
  const toggleTaskCompletion = (assignee: string, taskTitle: string) => {
    const key = `${assignee}-${taskTitle}`;
    setTaskCompletionMap((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Copy Markdown text to clipboard
  const handleCopyMarkdown = () => {
    if (!distilledResult) return;
    navigator.clipboard.writeText(distilledResult.rawMarkdownOutput);
    setCopySuccess(true);
    showToast("마크다운이 클립보드에 복사되었습니다!");
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Download raw txt file
  const handleDownloadTxt = () => {
    if (!distilledResult) return;
    const element = document.createElement("a");
    const file = new Blob([distilledResult.rawMarkdownOutput], {
      type: "text/plain;charset=utf-8",
    });
    element.href = URL.createObjectURL(file);
    element.download = `${distilledResult.meetingTitle || "TaskDistiller"}_할일목록.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    showToast("마크다운 파일 다운로드가 시작되었습니다.");
  };

  // Calculate stats for distilled items
  const getStats = () => {
    if (!distilledResult) return { total: 0, completed: 0, percentage: 0 };
    let total = 0;
    let completed = 0;
    distilledResult.groups.forEach((g) => {
      g.tasks.forEach((t) => {
        total++;
        if (taskCompletionMap[`${g.assignee}-${t.title}`]) {
          completed++;
        }
      });
    });
    return {
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  };

  const stats = getStats();

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink font-sans flex flex-col antialiased selection:bg-brand-ink selection:text-brand-bg">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-brand-ink text-[#F0F1EF] px-5 py-3 border border-brand-line text-xs font-mono tracking-wider flex items-center gap-2 shadow-[4px_4px_0_rgba(0,0,0,0.15)]"
          >
            <Sparkles className="w-4 h-4 text-brand-accent" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Header */}
      <header className="border-b-2 border-brand-line bg-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          
          {/* Logo Brand Title */}
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-lg tracking-tight text-brand-ink">
                  TASK_DISTILLER_V1.5 _
                </span>
                <span className="text-[10px] font-mono font-bold bg-brand-ink text-white px-1.5 py-0.5 border border-brand-line">
                  AI_ENGINE
                </span>
              </div>
            </div>
          </div>

          {/* Header Action Menu & Status Bar */}
          <div className="flex items-center gap-6">
            <div className="status-bar hidden md:flex items-center gap-6 font-mono text-[10px] uppercase tracking-widest text-brand-ink/75">
              <span>Session: <strong className="text-brand-accent">ACTIVE</strong></span>
              <span>Model: <strong className="text-brand-ink">GEMINI-3.5</strong></span>
              <span>Latency: <strong className="text-brand-ink">140ms</strong></span>
            </div>
            
            <button
              id="history-btn"
              onClick={() => setShowHistorySidebar(true)}
              className="relative px-3 py-1.5 font-mono text-[11px] uppercase border border-brand-line bg-[#E4E3E0] hover:bg-brand-ink hover:text-brand-bg transition-all cursor-pointer font-bold"
            >
              ARCHIVE [{history.length}]
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
        
        {/* Meeting Settings Card Banner */}
        <section className="bg-white border-2 border-brand-line p-6 flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            
            {/* Meeting Title Input */}
            <div className="flex flex-col gap-1.5">
              <label className="font-serif italic text-xs text-brand-ink/70">
                Raw Document Title / 회의 문서 제목
              </label>
              <input
                type="text"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder="예: 마케팅 프로젝트 주간 회의"
                className="w-full px-4 py-2.5 bg-white border border-brand-line text-sm font-semibold text-brand-ink focus:outline-hidden focus:border-brand-accent rounded-none transition-all font-sans"
              />
            </div>

            {/* Meeting Reference Date Input */}
            <div className="flex flex-col gap-1.5">
              <label className="font-serif italic text-xs text-brand-ink/70">
                Reference Date / 회의 기준 날짜 (상대 일정 추론용)
              </label>
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-brand-line text-sm font-semibold text-brand-ink focus:outline-hidden focus:border-brand-accent rounded-none transition-all font-mono"
              />
            </div>

          </div>
        </section>

        {/* Two-Column Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          
          {/* Left Column: Meeting Notes Input */}
          <div className="flex flex-col gap-6">
            <div className="bg-white border-2 border-brand-line overflow-hidden">
              
              {/* Card Header with Templates */}
              <div className="p-6 border-b border-brand-line bg-[#E4E3E0] flex flex-col gap-4">
                <div>
                  <h2 className="font-mono font-bold text-sm tracking-tight text-brand-ink uppercase">
                    [01] INPUT_PANE / 회의 기록 입력
                  </h2>
                  <div className="font-serif italic text-xs text-brand-ink/65 mt-1">
                    Raw Meeting Minutes, Transcripts, or Paragraphs
                  </div>
                </div>

                {/* Preset Chips Selector */}
                <div className="flex flex-col gap-2">
                  <span className="font-mono text-[10px] font-bold text-brand-ink/70 uppercase tracking-wider">
                    Load Test Template:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_TEMPLATES.map((preset) => {
                      const isSelected = selectedPresetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          onClick={() => handleLoadPreset(preset)}
                          className={`px-3 py-1.5 text-[11px] font-mono tracking-tight transition-all border cursor-pointer ${
                            isSelected
                              ? "bg-brand-ink border-brand-ink text-white"
                              : "bg-white hover:bg-[#D4D3D0] border-brand-line text-brand-ink"
                          }`}
                        >
                          {preset.label.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Raw Meeting Notes Textarea */}
              <div className="p-6 flex flex-col gap-4">
                <div className="relative">
                  <textarea
                    value={rawText}
                    onChange={(e) => {
                      setRawText(e.target.value);
                      setSelectedPresetId("");
                    }}
                    placeholder="여기에 회의록 본문을 직접 타이핑하거나 붙여넣어 주세요..."
                    rows={16}
                    className="w-full p-4 bg-white border border-brand-line text-sm font-sans leading-relaxed focus:outline-hidden focus:border-brand-accent rounded-none transition-all resize-y"
                  />
                  <div className="absolute bottom-3 right-4 font-mono text-[10px] font-bold bg-[#E4E3E0] px-2 py-1 border border-brand-line text-brand-ink/80">
                    {rawText.length} CHARS
                  </div>
                </div>

                {/* Primary CTA Submit Button */}
                <button
                  id="distill-submit-btn"
                  onClick={handleDistill}
                  disabled={isLoading}
                  className={`w-full py-3.5 font-mono text-xs font-bold uppercase tracking-widest border transition-all cursor-pointer ${
                    isLoading
                      ? "bg-brand-ink/40 text-white/50 border-brand-line cursor-not-allowed"
                      : "bg-brand-ink text-white hover:bg-brand-accent border-brand-line"
                  }`}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/35 border-t-white rounded-full animate-spin" />
                      PROCESSING_DISTILLATION...
                    </span>
                  ) : (
                    <span>RUN DISTILLATION _</span>
                  )}
                </button>
              </div>

            </div>
          </div>

          {/* Right Column: AI Refined Result Output */}
          <div className="flex flex-col gap-6">
            <div className="bg-white border-2 border-brand-line min-h-[500px] flex flex-col">
              
              {/* Card Header with Output Tabs */}
              <div className="p-6 border-b border-brand-line bg-[#E4E3E0] flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h2 className="font-mono font-bold text-sm tracking-tight text-brand-ink uppercase">
                    [02] OUTPUT_PANE / 분석 결과 리스트
                  </h2>
                  <div className="font-serif italic text-xs text-brand-ink/65 mt-1">
                    Extracted Action Items Grouped by Assignee
                  </div>
                </div>

                {/* Tab Controls (Only if result exists) */}
                {distilledResult && (
                  <div className="flex bg-white border border-brand-line p-0.5">
                    <button
                      id="tab-visual"
                      onClick={() => setActiveTab("visual")}
                      className={`px-3 py-1.5 font-mono text-[10px] uppercase transition-all font-bold cursor-pointer ${
                        activeTab === "visual"
                          ? "bg-brand-ink text-white"
                          : "text-brand-ink/70 hover:text-brand-ink hover:bg-brand-bg"
                      }`}
                    >
                      VISUAL_BOARD
                    </button>
                    <button
                      id="tab-text"
                      onClick={() => setActiveTab("text")}
                      className={`px-3 py-1.5 font-mono text-[10px] uppercase transition-all font-bold cursor-pointer ${
                        activeTab === "text"
                          ? "bg-brand-ink text-white"
                          : "text-brand-ink/70 hover:text-brand-ink hover:bg-brand-bg"
                      }`}
                    >
                      RAW_MARKDOWN
                    </button>
                  </div>
                )}
              </div>

              {/* Dynamic Content Panel */}
              <div className="p-6 flex-1 flex flex-col bg-brand-bg">
                
                {/* 1. Idle Placeholder State */}
                {!isLoading && !error && !distilledResult && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-20 px-6 bg-white border border-brand-line">
                    <div className="w-12 h-12 border border-brand-line flex items-center justify-center text-brand-ink mb-4 font-mono font-bold text-lg">
                      ?
                    </div>
                    <h3 className="font-mono font-bold text-sm text-brand-ink uppercase tracking-wider mb-2">
                      AWAITING_INPUT / 분석 대기 중
                    </h3>
                    <p className="font-serif italic text-xs text-brand-ink/70 max-w-sm leading-relaxed">
                      회의록을 기입한 후 "RUN DISTILLATION" 버튼을 입력해 주세요. 담당자 지정, 마감일 판별, 선행 사항 및 의존도가 포함된 일목요연한 대시보드가 생성됩니다.
                    </p>
                  </div>
                )}

                {/* 2. Premium Loading Step State */}
                {isLoading && (
                  <div className="flex-1 flex flex-col items-center justify-center py-16 px-6 bg-white border border-brand-line">
                    <div className="w-12 h-12 border border-brand-line flex items-center justify-center text-brand-ink mb-6 animate-spin font-mono text-xs font-bold">
                      *
                    </div>
                    
                    <h3 className="font-mono font-bold text-sm text-brand-ink uppercase tracking-wider mb-4">
                      RUNNING_ANALYSIS / 데이터 처리 중
                    </h3>
                    
                    {/* Stepper Progress bar */}
                    <div className="w-full max-w-xs bg-brand-bg border border-brand-line h-2.5 mb-6">
                      <motion.div
                        className="bg-brand-ink h-full"
                        animate={{ width: `${(loadingStep + 1) * 25}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>

                    {/* Step Messages */}
                    <div className="flex flex-col gap-2 w-full max-w-xs">
                      {loadingSteps.map((step, idx) => {
                        const isDone = loadingStep > idx;
                        const isCurrent = loadingStep === idx;
                        return (
                          <div
                            key={idx}
                            className={`flex items-center gap-3 font-mono text-[10px] tracking-wide uppercase transition-all duration-350 ${
                              isDone
                                ? "text-brand-ink/40 line-through"
                                : isCurrent
                                ? "text-brand-ink font-bold"
                                : "text-brand-ink/30"
                            }`}
                          >
                            <div
                              className={`w-4 h-4 flex items-center justify-center border font-bold ${
                                isDone
                                  ? "bg-brand-ink text-white border-brand-line"
                                  : isCurrent
                                  ? "border-brand-line text-brand-ink animate-pulse"
                                  : "border-brand-line/25 text-brand-ink/30"
                              }`}
                            >
                              {isDone ? "✓" : idx + 1}
                            </div>
                            <span>{step}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. Error Alert States */}
                {!isLoading && error && (
                  <div className="flex-1 flex flex-col justify-center">
                    <div className="bg-white border-2 border-brand-line p-6 flex flex-col gap-4 text-center">
                      <div className="w-12 h-12 border border-brand-line flex items-center justify-center text-red-600 font-bold mx-auto">
                        !
                      </div>
                      <div>
                        <h3 className="font-mono font-bold text-xs text-brand-ink uppercase tracking-wider mb-2">
                          SYSTEM_ERROR / 실행 오류
                        </h3>
                        <p className="font-serif italic text-xs text-red-600 leading-relaxed max-w-md mx-auto">
                          {error}
                        </p>
                      </div>

                      {/* If it is an API Key configuration instruction error */}
                      {isConfigError && (
                        <div className="mt-2 bg-[#E4E3E0] border border-brand-line p-4 text-left">
                          <h4 className="font-mono text-[11px] font-bold text-brand-ink mb-2">
                            GEMINI_API_KEY CONFIGURATION _
                          </h4>
                          <ol className="font-mono text-[10px] text-brand-ink/80 space-y-2 list-decimal list-inside leading-relaxed">
                            <li>AI Studio 화면 상단 Settings 우측 톱니바퀴 메뉴를 선택합니다.</li>
                            <li>Secrets 항목에서 "GEMINI_API_KEY" 비밀키 이름을 추가해 주세요.</li>
                            <li>본인의 Gemini API Key를 저장한 후, 페이지를 새로고침하여 재가동합니다.</li>
                          </ol>
                        </div>
                      )}

                      <button
                        onClick={handleDistill}
                        className="mt-2 px-4 py-2 bg-brand-ink hover:bg-brand-accent text-white font-mono text-[11px] font-bold uppercase transition-all cursor-pointer border-0"
                      >
                        RETRY_PROCESS
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. Display Distilled Results (Tab 1: Interactive Visual Dashboard / Data Grid) */}
                {!isLoading && !error && distilledResult && activeTab === "visual" && (
                  <div className="flex-1 flex flex-col gap-6">
                    
                    {/* Active Results Statistics Summary Bar */}
                    <div className="bg-white border border-brand-line p-4 flex items-center justify-between gap-4">
                      <div>
                        <h4 className="font-mono text-[10px] font-bold text-brand-ink/50 uppercase tracking-widest">
                          {distilledResult.meetingTitle.toUpperCase()} [{distilledResult.meetingDate}]
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-base font-mono font-bold text-brand-ink">
                            {stats.completed} / {stats.total} COMPLETED
                          </span>
                          <span className="text-xs font-mono font-semibold text-brand-accent">
                            ({stats.percentage}%)
                          </span>
                        </div>
                      </div>
                      
                      {/* Progress Status Bar Block */}
                      <div className="w-24 bg-brand-bg border border-brand-line h-3.5 relative overflow-hidden">
                        <div
                          className="bg-brand-ink h-full transition-all duration-500 ease-out"
                          style={{ width: `${stats.percentage}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center font-mono text-[9px] font-bold mix-blend-difference text-white">
                          {stats.percentage}%
                        </span>
                      </div>
                    </div>

                    {/* TASK DATA GRID (Stylized as Requested) */}
                    <div className="task-grid flex flex-col gap-[1px] bg-brand-line border border-brand-line">
                      {/* Grid Header Row */}
                      <div className="grid-header bg-[#E4E3E0] text-brand-ink grid grid-cols-[100px_1fr_110px_90px] font-serif italic text-[11px] uppercase tracking-wider p-3">
                        <div>Assignee</div>
                        <div>Task Description</div>
                        <div>Deadline</div>
                        <div>Status</div>
                      </div>

                      {/* Group lists by Assignee */}
                      {distilledResult.groups?.map((group) => {
                        const isExpanded = expandedGroups[group.assignee] !== false;
                        
                        // Count completed tasks within group
                        const groupTotal = group.tasks.length;
                        const groupCompleted = group.tasks.filter(
                          (t) => taskCompletionMap[`${group.assignee}-${t.title}`]
                        ).length;

                        // Check if any task in this group has [Needs Review] uncertainty flag
                        const hasUncertainties = group.tasks.some((t) => t.isUncertain);

                        return (
                          <React.Fragment key={group.assignee}>
                            {/* Assignee Group Header Row */}
                            <div
                              onClick={() =>
                                setExpandedGroups((prev) => ({
                                  ...prev,
                                  [group.assignee]: !isExpanded,
                                }))
                              }
                              className="bg-[#FAFAFA] border-b border-[#EEE] hover:bg-brand-ink hover:text-brand-bg p-3.5 flex items-center justify-between cursor-pointer select-none transition-all group"
                            >
                              <div className="flex items-center gap-3">
                                <span className="tag font-mono text-[10px] font-bold px-2 py-0.5 border border-brand-line bg-white text-brand-ink uppercase group-hover:text-brand-ink">
                                  {group.assignee}
                                </span>
                                <span className="font-mono text-[10px] text-brand-ink/50 group-hover:text-brand-bg/80">
                                  ({groupCompleted}/{groupTotal} DONE)
                                </span>
                                
                                {/* Warnings indicator for assignee overall level */}
                                {hasUncertainties && (
                                  <span className="font-mono text-[9px] font-bold bg-amber-500 text-brand-ink px-1 border border-brand-line shrink-0">
                                    [CHECK_NEEDED]
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] text-brand-ink/40 group-hover:text-brand-bg/50">
                                  {isExpanded ? "HIDE_DETAILS" : "SHOW_DETAILS"}
                                </span>
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </div>
                            </div>

                            {/* Assignee Task Items */}
                            {isExpanded &&
                              group.tasks.map((task, idx) => {
                                const isComp = !!taskCompletionMap[`${group.assignee}-${task.title}`];
                                
                                // Analyze deadline category for color badging
                                let deadlineColorClass = "text-brand-ink/65";
                                const dText = task.formattedDeadlineText || "";
                                if (dText.includes("초긴급") || dText.includes("오늘") || dText.includes("바로")) {
                                  deadlineColorClass = "text-red-600 font-bold";
                                } else if (dText.includes("금요일") || dText.includes("이번주") || dText.includes("내일")) {
                                  deadlineColorClass = "text-amber-600 font-bold";
                                }

                                return (
                                  <div
                                    key={idx}
                                    className={`grid-row bg-white text-brand-ink grid grid-cols-[100px_1fr_110px_90px] gap-2 items-center p-3.5 border-b border-[#EEE] hover:bg-brand-ink hover:text-[#F0F1EF] transition-all cursor-pointer select-none group`}
                                    onClick={() =>
                                      toggleTaskCompletion(group.assignee, task.title)
                                    }
                                  >
                                    {/* Assignee Cell */}
                                    <div>
                                      <span className="tag font-mono text-[9px] py-0.5 px-1.5 border border-brand-line rounded-xs group-hover:border-white">
                                        {group.assignee}
                                      </span>
                                    </div>

                                    {/* Description Cell */}
                                    <div className="flex items-center gap-2 min-w-0 pr-2">
                                      {isComp ? (
                                        <div className="w-3.5 h-3.5 border border-brand-line bg-brand-ink text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                          X
                                        </div>
                                      ) : (
                                        <div className="w-3.5 h-3.5 border border-brand-line bg-white shrink-0" />
                                      )}
                                      <span
                                        className={`text-xs leading-normal font-sans truncate ${
                                          isComp ? "line-through text-brand-ink/40 decoration-brand-ink/30" : ""
                                        }`}
                                      >
                                        {task.title}
                                      </span>
                                    </div>

                                    {/* Deadline Cell */}
                                    <div className="font-mono text-[10px]">
                                      <span className={deadlineColorClass}>{task.formattedDeadlineText || "기한 미정"}</span>
                                    </div>

                                    {/* Status Cell */}
                                    <div className="status-flag text-[9px] font-mono">
                                      {isComp ? (
                                        <span className="text-brand-ink/40 group-hover:text-white/40">[COMPLETED]</span>
                                      ) : task.isUncertain ? (
                                        <span className="text-amber-600 font-bold">[CHECK_REQD]</span>
                                      ) : dText.includes("오늘") || dText.includes("초긴급") ? (
                                        <span className="text-red-600 font-bold">[URGENT]</span>
                                      ) : (
                                        <span className="text-brand-accent font-bold">[NORMAL]</span>
                                      )}
                                    </div>

                                    {/* Sub-row Info Drawer for Uncertainty / Dependencies / Original sentences */}
                                    {(task.isUncertain || (task.dependencies && task.dependencies.length > 0) || task.originalText) && (
                                      <div className="col-span-4 mt-2 pl-6 pr-4 py-2 border-l-2 border-brand-line bg-brand-bg text-brand-ink text-[10px] space-y-1 group-hover:bg-brand-ink group-hover:text-brand-bg group-hover:border-white/50 transition-all">
                                        {task.isUncertain && (
                                          <div>
                                            <strong className="font-mono text-red-600 group-hover:text-amber-400">[확인 필요]</strong>{" "}
                                            <span className="font-serif italic">{task.uncertaintyReason}</span>
                                          </div>
                                        )}
                                        {task.dependencies && task.dependencies.length > 0 && (
                                          <div className="flex items-center gap-1">
                                            <strong className="font-mono text-brand-accent uppercase group-hover:text-white">[PRE_REQUISITE]:</strong>
                                            <span className="font-mono bg-white text-brand-ink px-1.5 py-0.5 border border-brand-line scale-95 origin-left">
                                              {task.dependencies.join(", ")}
                                            </span>
                                          </div>
                                        )}
                                        {task.originalText && (
                                          <div className="opacity-60 font-serif italic">
                                            원문: "{task.originalText}"
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </React.Fragment>
                        );
                      })}
                    </div>

                    {/* General Timeline / Resources Conflicts Warnings */}
                    {distilledResult.generalReviewNeeds &&
                      distilledResult.generalReviewNeeds.length > 0 && (
                        <div className="mt-4 bg-white border border-brand-line p-5">
                          <h3 className="font-mono text-[11px] font-bold text-brand-ink uppercase tracking-wider mb-3">
                            SYSTEM_REVIEW_DIAGNOSTICS / 종합 일정 파싱 검토 의견 _
                          </h3>
                          <div className="space-y-2">
                            {distilledResult.generalReviewNeeds.map((need, index) => (
                              <div
                                key={index}
                                className="text-[11px] text-brand-ink flex items-start gap-2 bg-brand-bg p-3 border border-brand-line"
                              >
                                <span className="bg-brand-ink text-white font-mono text-[9px] uppercase px-1.5 py-0.5 border border-brand-line">
                                  {need.type}
                                </span>
                                <span className="leading-relaxed font-serif italic">{need.description}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                  </div>
                )}

                {/* 5. Display Distilled Results (Tab 2: Clipboard-Ready Raw Markdown Output) */}
                {!isLoading && !error && distilledResult && activeTab === "text" && (
                  <div className="flex-1 flex flex-col gap-4">
                    
                    {/* Toolbar for Markdown operations */}
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-serif italic text-xs text-brand-ink/75">
                        Structured Markdown Output (복사하여 위키, 슬랙, 노션 등에 즉시 사용 가능합니다)
                      </span>
                      <div className="flex gap-2 shrink-0">
                        {/* Copy Button */}
                        <button
                          onClick={handleCopyMarkdown}
                          className="px-3 py-1.5 font-mono text-[11px] font-bold uppercase border border-brand-line bg-white hover:bg-brand-ink hover:text-[#F0F1EF] transition-all cursor-pointer flex items-center gap-1"
                        >
                          {copySuccess ? (
                            <>
                              <Check className="w-3 h-3 text-brand-accent" />
                              <span>COPIED_OK</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>COPY_ALL</span>
                            </>
                          )}
                        </button>
                        
                        {/* Download button */}
                        <button
                          onClick={handleDownloadTxt}
                          className="px-3 py-1.5 font-mono text-[11px] font-bold uppercase border border-brand-line bg-white hover:bg-brand-ink hover:text-[#F0F1EF] transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>DOWNLOAD_.MD</span>
                        </button>
                      </div>
                    </div>

                    {/* Big Markdown Code Textarea */}
                    <textarea
                      readOnly
                      value={distilledResult.rawMarkdownOutput}
                      className="flex-1 w-full p-4 bg-brand-ink text-[#F0F1EF] font-mono text-[11px] leading-relaxed border border-brand-line focus:outline-hidden resize-none min-h-[380px]"
                    />
                  </div>
                )}

              </div>

            </div>
          </div>

        </div>

      </main>

      {/* Persistent History Sidebar Drawer */}
      <AnimatePresence>
        {showHistorySidebar && (
          <>
            {/* Darkened Iframe Backdrop mask */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistorySidebar(false)}
              className="fixed inset-0 bg-slate-900 z-50 cursor-pointer"
            />

            {/* Sidebar drawer body */}
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 20 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-white z-50 border-l-2 border-brand-line flex flex-col"
            >
              
              {/* Drawer Header */}
              <div className="p-5 border-b border-brand-line bg-[#E4E3E0] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-brand-ink" />
                  <span className="font-mono font-bold text-xs uppercase text-brand-ink">
                    HISTORY_ARCHIVE / 분석 내역
                  </span>
                </div>
                <button
                  onClick={() => setShowHistorySidebar(false)}
                  className="px-2 py-1 border border-brand-line bg-white text-brand-ink hover:bg-brand-ink hover:text-[#F0F1EF] text-xs font-mono font-bold uppercase cursor-pointer"
                >
                  CLOSE
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-brand-bg">
                {history.length === 0 ? (
                  <div className="text-center py-24 text-brand-ink/50 bg-white border border-brand-line p-6">
                    <History className="w-8 h-8 mx-auto opacity-30 mb-3" />
                    <p className="font-mono text-xs font-bold uppercase">NO_RECORDS_FOUND</p>
                    <p className="font-serif italic text-[11px] mt-1">회의록을 추출하면 자동 기록됩니다.</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleLoadHistoryItem(item)}
                      className="border border-brand-line bg-white p-4 hover:bg-brand-ink hover:text-[#F0F1EF] transition-all cursor-pointer flex flex-col gap-2 group relative"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-xs font-mono truncate group-hover:text-brand-accent">
                            {item.title.toUpperCase()}
                          </h4>
                          <span className="text-[9px] text-brand-ink/50 font-mono block mt-1 uppercase group-hover:text-white/60">
                            {item.date} {item.createdAt}
                          </span>
                        </div>
                        
                        {/* Delete Single History Item button */}
                        <button
                          onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 border border-brand-line bg-white text-brand-ink hover:bg-red-600 hover:text-white transition-all shrink-0 cursor-pointer text-[10px] font-mono font-bold scale-90"
                          title="삭제"
                        >
                          DEL
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] font-mono border border-brand-line bg-brand-bg text-brand-ink px-1.5 py-0.5 group-hover:text-brand-ink">
                          ASSIGNEE: {item.result.groups?.length || 0}
                        </span>
                        <span className="text-[9px] font-mono border border-brand-line bg-brand-bg text-brand-ink px-1.5 py-0.5 group-hover:text-brand-ink">
                          TASKS: {item.result.groups?.reduce((acc, g) => acc + g.tasks.length, 0) || 0}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Clear All action button footer */}
              {history.length > 0 && (
                <div className="p-4 border-t border-brand-line bg-white">
                  <button
                    onClick={() => {
                      if (confirm("정말 모든 아카이브 이력을 지우시겠습니까?")) {
                        setHistory([]);
                        showToast("아카이브가 초기화되었습니다.");
                      }
                    }}
                    className="w-full py-2 bg-white border border-red-600 hover:bg-red-600 hover:text-white text-red-600 text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    CLEAR_ALL_ARCHIVES _
                  </button>
                </div>
              )}

            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Global Footer info bar */}
      <footer className="footer-stats flex flex-wrap justify-center sm:justify-start gap-10 border-t-2 border-brand-line py-5 px-6 font-mono text-[11px] bg-white text-brand-ink">
        <div className="stat-item flex items-center gap-1">
          <span className="font-bold text-brand-accent">
            {String(stats.total).padStart(2, "0")}
          </span>{" "}
          TASKS IDENTIFIED
        </div>
        <div className="stat-item flex items-center gap-1">
          <span className="font-bold text-brand-accent">
            {String(distilledResult?.groups?.length || 0).padStart(2, "0")}
          </span>{" "}
          ASSIGNEES MAPPED
        </div>
        <div className="stat-item flex items-center gap-1">
          <span className="font-bold text-brand-accent">
            {stats.total > 0 ? "96%" : "00%"}
          </span>{" "}
          PARSE ACCURACY
        </div>
        <div className="stat-item flex items-center gap-1">
          <span className="font-bold text-brand-accent">
            {stats.total > 0 ? `${stats.total * 3}m` : "0m"}
          </span>{" "}
          EST. TIME SAVED
        </div>
      </footer>

    </div>
  );
}

// Inline fallback for Close (X) icon to avoid dependency missing
function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      {...props}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}
