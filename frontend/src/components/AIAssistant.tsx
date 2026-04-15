import React, { useState, useRef, useEffect } from 'react';
import { Chatbot } from './Chatbot';
import { ReportUpload } from './ReportUpload';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, FileUp, Mic, Send, Paperclip, Sparkles, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export function AIAssistant() {
  const [mode, setMode] = useState<'chat' | 'upload'>('chat');
  const [isRecording, setIsRecording] = useState(false);

  const handleVoiceRecord = () => {
    if (!isRecording) {
      setIsRecording(true);
      toast.info("Listening... (Speech-to-Text Simulation)");
      setTimeout(() => {
        setIsRecording(false);
        toast.success("Voice captured! Processing...");
      }, 3000);
    } else {
      setIsRecording(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gradient-to-br from-blue-50 to-green-50 p-8 rounded-3xl border border-blue-100/50 shadow-sm">
        <div className="flex items-center gap-4 mb-4">
          <div className="bg-white p-3 rounded-2xl shadow-sm">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-900">Helping Hands AI</h2>
            <p className="text-slate-500 text-sm">Tell me what's happening or upload a report. I'll handle the rest.</p>
          </div>
        </div>

        <div className="flex gap-2 bg-white/50 p-1 rounded-2xl w-fit border border-white">
          <button
            onClick={() => setMode('chat')}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${mode === 'chat' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Chat Support
            </div>
          </button>
          <button
            onClick={() => setMode('upload')}
            className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${mode === 'upload' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center gap-2">
              <FileUp className="w-4 h-4" />
              Upload Report
            </div>
          </button>
        </div>
      </div>

      <div className="relative">
        <AnimatePresence mode="wait">
          {mode === 'chat' ? (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden min-h-[600px] flex flex-col"
            >
              <div className="flex-1 overflow-hidden">
                <Chatbot />
              </div>
              
              {/* Voice & Quick Actions Bar */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className={`rounded-full h-12 w-12 transition-all ${isRecording ? 'bg-red-50 text-red-500 border-red-200 animate-pulse' : 'hover:bg-primary/10 hover:text-primary'}`}
                  onClick={handleVoiceRecord}
                >
                  <Mic className="w-5 h-5" />
                </Button>
                <div className="flex-1 text-xs text-slate-400 font-medium px-2">
                  {isRecording ? "Recording in progress..." : "Click the mic to speak your request"}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-500 hover:text-primary"
                  onClick={() => setMode('upload')}
                >
                  <Paperclip className="w-4 h-4 mr-2" />
                  Attach PDF
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8"
            >
              <ReportUpload />
              <div className="mt-8 pt-8 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3 text-slate-400">
                  <Volume2 className="w-5 h-5" />
                  <p className="text-xs italic">Prefer talking? Switch back to chat mode for voice input.</p>
                </div>
                <Button variant="ghost" className="text-primary font-bold" onClick={() => setMode('chat')}>
                  Back to Chat
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
