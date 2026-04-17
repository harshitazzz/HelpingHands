import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send, Bot, Volume2, VolumeX, Loader2, CheckCircle2, AlertTriangle, LogIn,
  Mic, Square, MapPin, Pencil, X, AlertCircle, Users, Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getChatResponse, textToSpeech, getStructuredEmergencyData } from '@/src/lib/gemini';
import { db, auth, signInWithGoogle } from '@/src/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { autoAssignVolunteers } from '@/src/lib/matching';
import { toast } from 'sonner';
import { Paperclip, File } from 'lucide-react';
import { extractTextFromPDF } from '@/src/lib/pdfUtils';

/* ─── Types ─────────────────────────────────────────────── */

interface ParsedReport {
  issue: string;
  location: string;
  affected: string;
  help: string;
}

interface Message {
  id: string;
  role: 'user' | 'bot';
  text: string;
  timestamp: Date;
  report?: ParsedReport; // populated for structured reports
  file?: { name: string; type: string };
}

interface ChatbotProps {
  /** When set, the Chatbot will send this text immediately (used by the voice button in AIAssistant) */
  externalInput?: string | null;
  /** Called after the Chatbot has consumed the externalInput */
  onExternalInputHandled?: () => void;
}

/* ─── Helpers ────────────────────────────────────────────── */

const REPORT_START = '[EMERGENCY_SUMMARY_START]';
const REPORT_END   = '[EMERGENCY_SUMMARY_END]';

function parseReport(text: string): ParsedReport | null {
  const start = text.indexOf(REPORT_START);
  const end   = text.indexOf(REPORT_END);
  if (start === -1 || end === -1) return null;

  const block = text.slice(start + REPORT_START.length, end).trim();
  const get = (key: string) => {
    const match = block.match(new RegExp(`${key}:\\s*(.+)`, 'i'));
    return match ? match[1].trim() : '—';
  };

  return {
    issue:    get('ISSUE'),
    location: get('LOCATION'),
    affected: get('AFFECTED'),
    help:     get('HELP'),
  };
}

function stripReportBlock(text: string): string {
  const start = text.indexOf(REPORT_START);
  const end   = text.indexOf(REPORT_END);
  if (start === -1 || end === -1) return text;
  return (text.slice(0, start) + text.slice(end + REPORT_END.length)).trim();
}

/* ─── Report Card Component ──────────────────────────────── */

function ReportCard({
  report,
  onEdit,
  onSubmit,
  isSubmitting,
}: {
  report: ParsedReport;
  onEdit: (updated: ParsedReport) => void;
  onSubmit: (r: ParsedReport) => void;
  isSubmitting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ParsedReport>(report);

  const handleSave = () => {
    onEdit(draft);
    setEditing(false);
  };

  const fields: { label: string; key: keyof ParsedReport; icon: React.ReactNode }[] = [
    { label: 'Issue',           key: 'issue',    icon: <AlertCircle className="h-4 w-4 text-rose-500" /> },
    { label: 'Location',        key: 'location', icon: <MapPin       className="h-4 w-4 text-[#4d84a7]" /> },
    { label: 'People Affected', key: 'affected', icon: <Users        className="h-4 w-4 text-amber-500" /> },
    { label: 'Help Needed',     key: 'help',     icon: <Wrench       className="h-4 w-4 text-[#4b8f80]" /> },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-2 w-full max-w-[460px]"
    >
      <div className="overflow-hidden rounded-[2rem] border border-[#d4e8f5] bg-white shadow-xl shadow-slate-200/30">
        {/* Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-[#2f6d8e] to-[#3a7ca5] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 text-white">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/60">Emergency Report</p>
              <p className="text-lg font-extrabold tracking-tight text-white">Ready to Submit</p>
            </div>
          </div>
          <Badge className="rounded-full bg-white/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white">
            AI Verified
          </Badge>
        </div>

        {/* Fields */}
        <div className="divide-y divide-slate-100 px-6">
          {fields.map(({ label, key, icon }) => (
            <div key={key} className="flex items-start gap-4 py-4">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{label}</p>
                {editing ? (
                  <Input
                    value={draft[key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    className="mt-1 h-9 rounded-xl border-[#d4e8f5] bg-[#f6fbff] text-sm font-semibold text-slate-800 focus-visible:ring-[#4d84a7]"
                  />
                ) : (
                  <p className="mt-1 text-sm font-semibold text-slate-800 break-words">{report[key]}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 border-t border-slate-100 bg-[#f9fcfe] px-6 py-4">
          {editing ? (
            <>
              <Button
                onClick={handleSave}
                className="flex-1 rounded-full bg-[#2f6d8e] text-white hover:bg-[#285f7a]"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Save changes
              </Button>
              <Button
                variant="outline"
                onClick={() => { setDraft(report); setEditing(false); }}
                className="rounded-full border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => onSubmit(report)}
                disabled={isSubmitting}
                className="flex-1 h-12 rounded-full bg-[#2f6d8e] text-white hover:bg-[#285f7a] shadow-lg shadow-blue-200/50 transition-all active:scale-95"
              >
                {isSubmitting
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Submit Verified Report
              </Button>
              <Button
                variant="outline"
                title="Edit report"
                onClick={() => setEditing(true)}
                className="h-12 w-12 rounded-full border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-[#2f6d8e]"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Main Chatbot ───────────────────────────────────────── */

export function Chatbot({ externalInput, onExternalInputHandled }: ChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'bot',
      text: "Hello! I'm Helping Assistant, your AI emergency assistant. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput]                       = useState('');
  const [isLoading, setIsLoading]               = useState(false);
  const [isSubmitting, setIsSubmitting]         = useState(false);
  const [isSpeechEnabled, setIsSpeechEnabled]   = useState(true);
  const [user, setUser]                         = useState(auth.currentUser);
  const [isListening, setIsListening]           = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [selectedFile, setSelectedFile]         = useState<File | null>(null);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  const prevUserIdRef = useRef<string | null>(auth.currentUser?.uid ?? null);

  const INITIAL_MESSAGES: Message[] = [
    {
      id: '1',
      role: 'bot',
      text: "Hello! I'm Helping Assistant, your AI emergency assistant. How can I help you today?",
      timestamp: new Date(),
    },
  ];

  /* Auth listener — reset conversation whenever the logged-in user changes */
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u);
      const nextId = u?.uid ?? null;
      // If the user identity changed (new login or logout), wipe the chat
      if (nextId !== prevUserIdRef.current) {
        prevUserIdRef.current = nextId;
        setMessages(INITIAL_MESSAGES.map((m) => ({ ...m, timestamp: new Date() })));
        setInput('');
        setSelectedFile(null);
        setIsLoading(false);
        setIsSubmitting(false);
      }
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Speech recognition (in-chat mic — fills input only, no auto-send) */
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const rec = new SpeechRecognition();
    rec.continuous      = false;
    rec.interimResults  = false;
    rec.lang            = 'en-US';

    rec.onresult = (event: any) => {
      setInput(event.results[0][0].transcript);
      setIsListening(false);
    };
    rec.onerror = (event: any) => {
      if (event.error !== 'no-speech') toast.error(`Mic error: ${event.error}`);
      setIsListening(false);
    };
    rec.onend = () => setIsListening(false);

    recognitionRef.current = rec;
  }, []);

  /* Consume externalInput from AIAssistant's main mic (auto-send) */
  useEffect(() => {
    if (!externalInput) return;
    onExternalInputHandled?.();
    sendMessage(externalInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalInput]);

  /* Auto-scroll */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      toast.error('Speech recognition not supported in this browser.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error('Failed to start recognition:', e);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.type.startsWith('text/')) {
      toast.error('Please upload a PDF or text file');
      return;
    }
    setSelectedFile(file);
    toast.success(`Attached: ${file.name}`);
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    setIsDetectingLocation(true);
    toast.info('Detecting your location...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          const city  = data.address?.city || data.address?.town || data.address?.village || data.address?.suburb || '';
          const state = data.address?.state   || '';
          const country = data.address?.country || '';
          const loc = [city, state, country].filter(Boolean).join(', ') || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          setInput((prev) => `${prev.trim() ? `${prev.trim()}\n` : ''}My current location is ${loc}.`);
          toast.success(`Location detected: ${loc}`);
        } catch {
          toast.error('Could not reverse geocode the location.');
        } finally {
          setIsDetectingLocation(false);
        }
      },
      () => {
        toast.error('Unable to detect location. Please allow location access.');
        setIsDetectingLocation(false);
      }
    );
  };

  /* Core send logic – extracted so external mic can call it */
  const sendMessage = async (text: string, file?: File | null) => {
    if (!text.trim() && !file) return;

    let messageText = text;
    let fileInfo: Message['file'] | undefined;

    if (file) {
      fileInfo = { name: file.name, type: file.type };
      setIsLoading(true);
      try {
        const extracted = file.type === 'application/pdf'
          ? await extractTextFromPDF(file)
          : await file.text();
        messageText = text ? `${text}\n\n[Attached: ${file.name}]\n${extracted}` : `[Attached: ${file.name}]\n${extracted}`;
      } catch {
        toast.error('Failed to read attached file');
        setIsLoading(false);
        return;
      }
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: text || `Uploaded ${file?.name}`,
      timestamp: new Date(),
      file: fileInfo,
    };

    // Capture messages BEFORE adding the new user message (for history)
    const currentMessages = messages;

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsLoading(true);

    try {
      // Build valid alternating history for Gemini:
      // - Skip the initial bot greeting (id='1') since it makes 'model' the first entry
      // - Map roles correctly
      const rawHistory = currentMessages
        .filter((m) => m.id !== '1') // skip initial bot greeting
        .map((m) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }],
        }));

      // Ensure history starts with 'user' and alternates correctly
      const validHistory: { role: string; parts: { text: string }[] }[] = [];
      let lastRole = '';
      for (const item of rawHistory) {
        if (validHistory.length === 0 && item.role === 'model') continue;
        if (item.role === lastRole) continue;
        validHistory.push(item);
        lastRole = item.role;
      }
      // History must end with 'model' — drop any orphaned trailing 'user' entry
      // (can happen if a previous AI call failed with no bot response added)
      if (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
        validHistory.pop();
      }

      const raw = await getChatResponse(messageText, validHistory);
      const parsed = parseReport(raw || '');
      const displayText = parsed ? stripReportBlock(raw || '') : (raw || "I'm sorry, I couldn't process that. Please try again.");

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: displayText,
        timestamp: new Date(),
        report: parsed ?? undefined,
      };

      setMessages((prev) => [...prev, botMsg]);

      if (isSpeechEnabled && displayText) {
        await textToSpeech(displayText);
      }
    } catch (e: any) {
      const detail = e?.message || e?.status || JSON.stringify(e) || 'Unknown error';
      console.error('Chat error — full details:', e);
      toast.error(`AI error: ${detail}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    if ((!input.trim() && !selectedFile) || isLoading) return;
    sendMessage(input, selectedFile);
  };

  /* Update a report in-place when user edits it */
  const handleEditReport = (msgId: string, updated: ParsedReport) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, report: updated } : m))
    );
  };

  const handleSubmitReport = async (report: ParsedReport) => {
    if (!user) {
      toast.error('Please sign in to submit a report');
      try {
        await signInWithGoogle();
      } catch (e: any) {
        const code = e.code || 'unknown';
        if (code === 'auth/popup-closed-by-user') toast.info('Sign in cancelled.');
        else toast.error(`Authentication failed (${code})`);
      }
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);
    const tid = toast.loading('Preparing your emergency report…');

    try {
      /* Build a plain-text version for structured extraction */
      const conversationText = `ISSUE: ${report.issue}\nLOCATION: ${report.location}\nAFFECTED: ${report.affected}\nHELP NEEDED: ${report.help}`;
      const structured = await getStructuredEmergencyData(conversationText);

      const docRef = await addDoc(collection(db, 'requests'), {
        ...structured,
        status: 'pending',
        createdAt: serverTimestamp(),
        assignedVolunteers: [],
        source: 'chatbot',
        reportedBy: user?.uid || 'anonymous',
      });

      const matchCount = await autoAssignVolunteers(
        docRef.id,
        structured.required_skills || [],
        structured.location,
        structured.issue
      );

      toast.dismiss(tid);
      toast.success(
        matchCount > 0
          ? `Emergency reported! ${matchCount} volunteers notified.`
          : 'Emergency reported! It is now live on the dashboard.'
      );

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'bot',
          text: "✅ Your emergency report has been submitted successfully. You can track it on the Dashboard. Help is being coordinated.",
          timestamp: new Date(),
        },
      ]);
    } catch (e: any) {
      toast.dismiss(tid);
      const detail = e?.message || e?.status || JSON.stringify(e) || 'Unknown error';
      console.error('Submission error — full details:', e);
      // Distinguish AI errors from Firestore errors for clearer user feedback
      if (detail.includes('quota') || detail.includes('NOT_FOUND') || detail.includes('model') || detail.includes('API')) {
        toast.error(`AI processing failed: ${detail.slice(0, 120)}`);
      } else if (detail.includes('permission') || detail.includes('PERMISSION_DENIED')) {
        toast.error('Permission denied — please make sure you are signed in.');
      } else {
        toast.error(`Submission failed: ${detail.slice(0, 120)}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ─── Render ─────────────────────────────────────────── */
  return (
    <Card className="mx-auto flex h-full w-full flex-col overflow-hidden border-none bg-transparent shadow-none">
      {/* Header */}
      <div className="flex flex-row items-center justify-between border-b border-slate-100 bg-[#f8fbfd] p-6">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-[#dff1fb] p-3 text-[#4d84a7]">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-xl font-black tracking-tight text-slate-900">Helping Assistant</CardTitle>
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#4d84a7]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4d84a7]" />
              Emergency assistant
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-xl hover:bg-[#e8f3ff] hover:text-[#4d84a7]"
          onClick={() => setIsSpeechEnabled(!isSpeechEnabled)}
          title={isSpeechEnabled ? 'Disable voice' : 'Enable voice'}
        >
          {isSpeechEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </Button>
      </div>

      {/* Body */}
      <CardContent className="relative flex-1 overflow-hidden bg-[#f7fafc] p-0">
        {/* Sign-in gate */}
        {!user && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-white/55 p-8 text-center backdrop-blur-md">
            <div className="rounded-[2rem] bg-[#e7f4fb] p-6 shadow-inner">
              <LogIn className="h-12 w-12 text-[#4d84a7]" />
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-black tracking-tight text-slate-900">Access Secure Support</h3>
              <p className="max-w-[300px] text-lg font-medium text-slate-500">
                Sign in to coordinate help and receive AI assistance.
              </p>
            </div>
            <Button
              onClick={async () => {
                try { await signInWithGoogle(); }
                catch (e: any) {
                  const code = e.code || 'unknown';
                  if (code === 'auth/popup-closed-by-user') toast.info('Sign in cancelled');
                  else toast.error(`Sign-in failed (${code})`);
                }
              }}
              className="h-14 gap-3 rounded-full px-10 text-lg font-black shadow-xl shadow-slate-200 transition-all active:scale-95 bg-[#2f6d8e] hover:bg-[#285f7a]"
            >
              <LogIn className="h-5 w-5" />
              Sign in with Google
            </Button>
          </div>
        )}

        <ScrollArea className="h-full p-8" ref={scrollRef}>
          <div className="space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex max-w-[90%] gap-4 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <Avatar className="h-10 w-10 shrink-0 border-2 border-white shadow-md">
                      {m.role === 'user' ? (
                        <AvatarFallback className="bg-slate-200 font-black tracking-tight text-slate-600">
                          {user?.displayName?.charAt(0) || 'U'}
                        </AvatarFallback>
                      ) : (
                        <AvatarFallback className="bg-[#dff1fb] font-black text-[#4d84a7]">
                          <Bot className="h-5 w-5" />
                        </AvatarFallback>
                      )}
                    </Avatar>

                    <div className="space-y-1">
                      {/* If bot message has a parsed report → show card */}
                      {m.role === 'bot' && m.report ? (
                        <>
                          {m.text && (
                            <div className="mb-3 rounded-[1.5rem] rounded-tl-none border border-slate-100 bg-white px-5 py-3 text-base font-medium text-slate-700 shadow-sm">
                              {m.text}
                            </div>
                          )}
                          <ReportCard
                            report={m.report}
                            onEdit={(updated) => handleEditReport(m.id, updated)}
                            onSubmit={handleSubmitReport}
                            isSubmitting={isSubmitting}
                          />
                        </>
                      ) : (
                        <div
                          className={`rounded-[1.5rem] px-5 py-3 text-base font-medium shadow-sm ${
                            m.role === 'user'
                              ? 'rounded-tr-none bg-[#a7d5fb] text-[#214863] shadow-blue-100'
                              : 'rounded-tl-none border border-slate-100 bg-white text-slate-700 shadow-slate-100/50'
                          }`}
                        >
                          {m.file && (
                            <div className="mb-2 flex items-center gap-2 rounded-xl bg-slate-50 p-2 text-xs font-semibold text-slate-500">
                              <File className="h-3.5 w-3.5" />
                              {m.file.name}
                            </div>
                          )}
                          {m.text}
                        </div>
                      )}
                      <p className={`text-[9px] font-black uppercase tracking-widest text-slate-300 ${m.role === 'user' ? 'mr-1 text-right' : 'ml-1 text-left'}`}>
                        {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="flex items-center gap-4 rounded-2xl rounded-tl-none border border-slate-100 bg-white px-5 py-3 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-[#4d84a7]" />
                  <span className="text-xs font-black uppercase tracking-widest text-slate-400">Helping Assistant is thinking…</span>
                </div>
              </motion.div>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      {/* Footer */}
      <CardFooter className="flex flex-col gap-4 border-t border-slate-100 bg-white p-6">
        {selectedFile && (
          <div className="flex w-full animate-in fade-in slide-in-from-bottom-2 items-center justify-between rounded-2xl border border-[#d7ece6] bg-[#eef7f5] p-3">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="rounded-xl border border-[#d7ece6] bg-white p-2">
                <File className="h-4 w-4 shrink-0 text-[#40765e]" />
              </div>
              <span className="truncate text-sm font-black text-slate-700">{selectedFile.name}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              className="h-8 w-8 rounded-full hover:bg-red-50 hover:text-red-500"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex w-full gap-3"
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".pdf,.txt"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-14 w-14 rounded-2xl border-slate-200 text-slate-400 transition-all hover:border-[#c6dceb] hover:text-[#4d84a7] active:scale-95"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isSubmitting || !user}
            title="Attach Document"
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-14 w-14 rounded-2xl border-slate-200 text-slate-400 transition-all hover:border-[#c6dceb] hover:text-[#4d84a7] active:scale-95"
            onClick={handleDetectLocation}
            disabled={isLoading || isSubmitting || !user || isDetectingLocation}
            title="Detect Location"
          >
            {isDetectingLocation ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPin className="h-5 w-5" />}
          </Button>

          <div className="relative flex-1">
            <Input
              placeholder={user ? 'Describe the emergency…' : 'Please sign in…'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading || isSubmitting || !user}
              className="h-14 rounded-2xl border-slate-200 bg-[#f8fbfd] px-6 pr-14 font-medium text-slate-700 placeholder:text-slate-300 focus-visible:ring-[#4d84a7]"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleListening}
                disabled={isLoading || isSubmitting || !user}
                className={`h-10 w-10 rounded-xl transition-all ${
                  isListening
                    ? 'animate-pulse bg-red-50 text-red-500'
                    : 'text-slate-400 hover:bg-[#e8f3ff] hover:text-[#4d84a7]'
                }`}
                title={isListening ? 'Stop listening' : 'Tap to speak (fills text only)'}
              >
                {isListening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading || isSubmitting || (!input.trim() && !selectedFile) || !user}
            className="h-14 w-14 rounded-2xl bg-[#2f6d8e] shadow-xl shadow-slate-200 transition-all hover:bg-[#285f7a] active:scale-95"
            size="icon"
          >
            <Send className="h-5 w-5" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
