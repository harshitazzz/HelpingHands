import React, { useState, useEffect, useRef } from 'react';
import { Chatbot } from './Chatbot';
import { FileUp, MessageSquare, Mic, ShieldCheck, Sparkles, Square, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'motion/react';

export function AIAssistant() {
  const [mode, setMode] = useState<'chat' | 'upload'>('chat');
  const [isRecording, setIsRecording] = useState(false);
  const [pendingVoiceInput, setPendingVoiceInput] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript: string = event.results[0][0].transcript;
        setIsRecording(false);
        // Auto-submit: pass the voice text directly to Chatbot
        setPendingVoiceInput(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }
  }, []);

  const toggleMainMic = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in your browser. Please use Chrome.');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (e) {
        console.error('Failed to start recognition:', e);
      }
    }
  };

  return (
    <div className="space-y-10">
      <section className="mx-auto max-w-5xl space-y-5 px-1">
        <h1 className="max-w-3xl font-heading text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
          We&apos;re here to understand and route help quickly.
        </h1>
        <p className="max-w-3xl text-base leading-8 text-slate-600 md:text-lg">
          Describe the emergency in your own words or upload an NGO report. Helping Assistant reads the
          details, extracts the important parts, and sends the request forward for volunteer
          assignment.
        </p>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.25fr_0.85fr]">
        <div className="space-y-6">
          <div className="rounded-[2.4rem] bg-[#f3f8fb] p-5 shadow-[0_18px_45px_rgba(131,160,180,0.12)]">
            <div className="mb-4 flex items-center justify-between">
              <div className="inline-flex rounded-full bg-white/90 p-1 shadow-sm">
                <button
                  onClick={() => setMode('chat')}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === 'chat' ? 'bg-[#2f6d8e] text-white' : 'text-slate-500 hover:text-slate-900'
                    }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Chat
                  </span>
                </button>
                <button
                  onClick={() => setMode('upload')}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === 'upload' ? 'bg-[#2f6d8e] text-white' : 'text-slate-500 hover:text-slate-900'
                    }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <FileUp className="h-4 w-4" />
                    Upload
                  </span>
                </button>
              </div>
            </div>

            {mode === 'chat' ? (
              <div className="overflow-hidden rounded-[2rem] bg-white shadow-[0_10px_30px_rgba(140,165,181,0.12)]">
                <Chatbot
                  externalInput={pendingVoiceInput}
                  onExternalInputHandled={() => setPendingVoiceInput(null)}
                />
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[2rem] border border-dashed border-[#b8dfd2] bg-[#eefaf4] p-8 text-center"
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#d9f3e8] text-[#4a977d]">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <h3 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Upload Documents</h3>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-slate-600">
                  Upload NGO reports in PDF or text format. Helping Assistant will extract the important
                  keywords, structure the request, and prepare it for submission.
                </p>
                <Button
                  onClick={() => setMode('chat')}
                  variant="outline"
                  className="mt-6 rounded-full border-[#b8dfd2] bg-white px-6 text-slate-800 hover:bg-slate-50"
                >
                  Switch back to chat
                </Button>
              </motion.div>
            )}
          </div>

          {/* Main Voice Button - auto-submits on capture */}
          <div className="flex flex-col items-center justify-center gap-4 py-4">
            <div className="relative">
              {isRecording && (
                <span className="absolute inset-0 animate-ping rounded-full bg-rose-400 opacity-30" />
              )}
              <Button
                variant="outline"
                size="icon"
                className={`relative h-20 w-20 rounded-full border-none shadow-lg transition-all ${isRecording
                  ? 'bg-rose-100 text-rose-600 ring-4 ring-rose-100'
                  : 'bg-[#2f6d8e] text-white hover:bg-[#285f7a]'
                  }`}
                onClick={toggleMainMic}
                title={isRecording ? 'Stop recording' : 'Tap to speak — auto-sends to AI'}
              >
                {isRecording ? <Square className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
              </Button>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold tracking-tight text-[#2f6d8e]">
                {isRecording ? 'Listening...' : 'Tap to speak'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {isRecording
                  ? 'Stop speaking and the message will send automatically.'
                  : 'Your voice is captured and sent directly to the AI.'}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2.2rem] border border-dashed border-[#b8dfd2] bg-[#eefaf4] p-8 text-center shadow-[0_10px_30px_rgba(153,194,175,0.10)]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#d6f2e5] text-[#4d957c]">
              <FileUp className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Upload reports</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              NGO teams can upload PDF reports here. Helping Assistant will organize the issue, detect
              important fields, and push it into the response flow.
            </p>
            <Button
              onClick={() => setMode('upload')}
              className="mt-6 rounded-full bg-[#40765e] px-7 text-white hover:bg-[#36664f]"
            >
              Open upload flow
            </Button>
          </div>

          <div className="rounded-[2.2rem] bg-white p-7 shadow-[0_10px_30px_rgba(140,165,181,0.10)]">
            <h3 className="text-2xl font-bold tracking-tight text-slate-900">How it works</h3>
            <div className="mt-5 space-y-4">
              {[
                'Describe the issue using chat, text, or voice.',
                'Helping Assistant identifies urgency, location, and support needs.',
                'After submission, the platform auto-assigns volunteers.',
              ].map((item, index) => (
                <div key={item} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#dff1fb] text-xs font-black text-[#4d84a7]">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-7 text-slate-600">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] bg-[#e8f7f5] px-6 py-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 h-5 w-5 text-[#4b8f80]" />
              <p className="text-sm italic leading-7 text-slate-600">
                "You can even upload NGO paperwork or typed field notes. Helping Assistant will pull out the
                key information so the request is easier to understand and act on."
              </p>
            </div>
          </div>

          <div className="rounded-[2rem] bg-white/80 p-6 shadow-[0_10px_24px_rgba(140,165,181,0.08)]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8f3ff] text-[#4d84a7]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
                  What happens next
                </p>
                <p className="mt-1 text-sm leading-7 text-slate-600">
                  Once the report is submitted, it appears in the live emergency feed and the
                  matching system starts looking for suitable volunteers.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
