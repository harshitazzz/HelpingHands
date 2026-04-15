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
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-[#DBEAFE]/30 via-[#DCFCE7]/30 to-[#FEF9C3]/30 blur-3xl -z-10 opacity-50 transition-opacity group-hover:opacity-100" />
        <div className="glass p-10 rounded-[2.5rem] border-white/50 shadow-2xl shadow-slate-200/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="bg-primary p-4 rounded-[1.5rem] shadow-xl shadow-primary/20 rotate-3 group-hover:rotate-0 transition-transform">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-4xl font-black tracking-tighter text-slate-900 leading-none mb-2">Helping Hands AI</h2>
                <p className="text-slate-500 font-medium text-lg leading-tight">Intelligent coordination for every emergency.</p>
              </div>
            </div>

            <div className="flex gap-2 bg-slate-100/50 p-1.5 rounded-2xl w-fit border border-slate-200/50 backdrop-blur-sm">
              <button
                onClick={() => setMode('chat')}
                className={`px-8 py-3 rounded-xl text-sm font-black transition-all ${mode === 'chat' ? 'bg-white shadow-lg text-primary scale-105' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Chat
                </div>
              </button>
              <button
                onClick={() => setMode('upload')}
                className={`px-8 py-3 rounded-xl text-sm font-black transition-all ${mode === 'upload' ? 'bg-white shadow-lg text-primary scale-105' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <div className="flex items-center gap-2">
                  <FileUp className="w-4 h-4" />
                  Report
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="relative">
        <AnimatePresence mode="wait">
          {mode === 'chat' ? (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5 }}
              className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden min-h-[650px] flex flex-col group"
            >
              <div className="flex-1 overflow-hidden">
                <Chatbot />
              </div>
              
              {/* Voice & Quick Actions Bar */}
              <div className="p-6 bg-slate-50/80 backdrop-blur-md border-t border-slate-100 flex items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  className={`rounded-2xl h-16 w-16 transition-all shadow-lg active:scale-90 ${isRecording ? 'bg-red-50 text-red-600 border-red-200 animate-pulse ring-4 ring-red-50' : 'bg-white hover:bg-primary/10 hover:text-primary hover:border-primary/30 border-slate-200'}`}
                  onClick={handleVoiceRecord}
                >
                  <Mic className="w-6 h-6" />
                </Button>
                <div className="flex-1">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
                    {isRecording ? "Listening closely..." : "Voice Input"}
                  </p>
                  <p className="text-sm font-medium text-slate-500">
                    {isRecording ? "I'm capturing your request..." : "Tap the microphone to speak your emergency report"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="rounded-xl h-12 px-6 font-black text-slate-400 hover:text-primary hover:bg-primary/5 transition-all"
                  onClick={() => setMode('upload')}
                >
                  <Paperclip className="w-4 h-4 mr-2" />
                  Attach Report
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5 }}
              className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 p-12"
            >
              <ReportUpload />
              <div className="mt-12 pt-12 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4 text-slate-400 bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100">
                  <Volume2 className="w-6 h-6 text-primary" />
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Prefer talking? <span className="text-primary cursor-pointer hover:underline" onClick={() => setMode('chat')}>Switch to Chat</span></p>
                </div>
                <Button 
                  variant="ghost" 
                  className="rounded-2xl h-14 px-10 font-black text-slate-900 hover:bg-slate-50 transition-all border border-slate-100" 
                  onClick={() => setMode('chat')}
                >
                  Back to Assistant
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
