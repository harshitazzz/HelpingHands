import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, User, Bot, Volume2, VolumeX, Loader2, CheckCircle2, AlertTriangle, LogIn, Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getChatResponse, textToSpeech, getStructuredEmergencyData } from '@/src/lib/gemini';
import { db, auth, signInWithGoogle } from '@/src/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { autoAssignVolunteers } from '@/src/lib/matching';
import { toast } from 'sonner';
import { Paperclip, X, File } from 'lucide-react';
import { extractTextFromPDF } from '@/src/lib/pdfUtils';

interface Message {
  id: string;
  role: 'user' | 'bot';
  text: string;
  timestamp: Date;
  file?: {
    name: string;
    type: string;
  };
}

export function Chatbot() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'bot',
      text: "Hello! I'm Beacon, your AI emergency assistant. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSpeechEnabled, setIsSpeechEnabled] = useState(true);
  const [user, setUser] = useState(auth.currentUser);
  const [isListening, setIsListening] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => setUser(u));
    
    // Initialize Speech Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error !== 'no-speech') {
          toast.error(`Speech recognition error: ${event.error}`);
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    return () => unsubscribe();
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      toast.error("Speech recognition is not supported in your browser.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        console.error("Failed to start recognition:", error);
      }
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

  const handleSend = async () => {
    if ((!input.trim() && !selectedFile) || isLoading) return;

    let messageText = input;
    let fileInfo = undefined;

    if (selectedFile) {
      fileInfo = {
        name: selectedFile.name,
        type: selectedFile.type
      };
      
      setIsLoading(true);
      try {
        let extractedText = '';
        if (selectedFile.type === 'application/pdf') {
          extractedText = await extractTextFromPDF(selectedFile);
        } else {
          extractedText = await selectedFile.text();
        }
        
        messageText = input 
          ? `${input}\n\n[Attached File: ${selectedFile.name}]\n${extractedText}`
          : `[Attached File: ${selectedFile.name}]\n${extractedText}`;
      } catch (error) {
        console.error('File extraction error:', error);
        toast.error('Failed to read attached file');
        setIsLoading(false);
        return;
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input || `Uploaded ${selectedFile?.name}`,
      timestamp: new Date(),
      file: fileInfo
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsLoading(true);

    try {
      const history = messages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }],
      }));

      const botResponse = await getChatResponse(messageText, history);
      
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: botResponse || "I'm sorry, I couldn't process that. Please try again.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMessage]);

      if (isSpeechEnabled && botResponse) {
        await textToSpeech(botResponse);
      }
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Failed to get response from AI');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!user) {
      toast.error("Please sign in to submit a report");
      try {
        await signInWithGoogle();
      } catch (error: any) {
        console.error('Chatbot login error:', error);
        const errorCode = error.code || 'unknown';
        const errorMessage = error.message || 'No specific error message available';

        if (errorCode === 'auth/popup-closed-by-user') {
          toast.info('Sign in cancelled: Log in to submit a report.');
        } else if (errorCode === 'auth/operation-not-allowed') {
          toast.error('Google sign-in is not enabled in Firebase.');
        } else if (errorCode === 'auth/unauthorized-domain') {
          toast.error(`Domain '${window.location.hostname}' is not authorized.`);
        } else {
          toast.error(`Authentication failed (${errorCode})`);
        }
        return;
      }
    }

    if (messages.length < 3 || isSubmitting) return;

    setIsSubmitting(true);
    const loadingToast = toast.loading("Beacon is processing your report...");
    
    try {
      const conversationText = messages
        .map((m) => `${m.role.toUpperCase()}: ${m.text}`)
        .join('\n');

      const structuredData = await getStructuredEmergencyData(conversationText);
      
      const docRef = await addDoc(collection(db, 'requests'), {
        ...structuredData,
        status: 'pending',
        createdAt: serverTimestamp(),
        assignedVolunteers: [],
        source: 'chatbot',
        reportedBy: user?.uid || 'anonymous'
      });

      // Auto-assign volunteers
      const matchCount = await autoAssignVolunteers(
        docRef.id, 
        structuredData.required_skills || [], 
        structuredData.location,
        structuredData.issue
      );
      
      toast.dismiss(loadingToast);
      if (matchCount > 0) {
        toast.success(`Emergency reported! ${matchCount} volunteers automatically notified.`);
      } else {
        toast.success('Emergency reported! No immediate matches found, but it is now on the dashboard.');
      }
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'bot',
        text: "I've successfully submitted your emergency report. You can now see it on the Dashboard. Help is being coordinated.",
        timestamp: new Date()
      }]);
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Submission error:', error);
      toast.error('Failed to save report to database');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full mx-auto h-full flex flex-col shadow-none border-none bg-transparent overflow-hidden">
      <div className="p-6 border-b glass flex flex-row items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-xl font-black text-slate-900 tracking-tight">Beacon AI</CardTitle>
            <p className="text-[10px] uppercase font-black tracking-widest text-primary flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span>
              Emergency Assistant
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {messages.length > 2 && (
            <Button 
              variant="default" 
              size="sm" 
              className="bg-primary hover:bg-green-600 text-white shadow-xl shadow-primary/20 rounded-xl font-black h-10 px-4 transition-all active:scale-95"
              onClick={handleSubmitReport}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Submit
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl hover:bg-primary/10 hover:text-primary transition-colors"
            onClick={() => setIsSpeechEnabled(!isSpeechEnabled)}
            title={isSpeechEnabled ? "Disable Voice" : "Enable Voice"}
          >
            {isSpeechEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </Button>
        </div>
      </div>
      
      <CardContent className="flex-1 overflow-hidden p-0 relative bg-slate-50/30">
        {!user ? (
          <div className="absolute inset-0 z-10 bg-white/40 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center space-y-6">
            <div className="bg-primary/10 p-6 rounded-[2rem] shadow-inner">
              <LogIn className="w-12 h-12 text-primary" />
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Access Secure Support</h3>
              <p className="text-slate-500 font-medium max-w-[300px] text-lg">
                Sign in to coordinate help and receive AI assistance.
              </p>
            </div>
            <Button 
              onClick={async () => {
                try {
                  await signInWithGoogle();
                } catch (error: any) {
                  console.error('Chatbot overlay login error:', error);
                  const errorCode = error.code || 'unknown';
                  const errorMessage = error.message || 'No specific error message available';

                  if (errorCode === 'auth/popup-closed-by-user') {
                    toast.info('Sign in cancelled');
                  } else {
                    toast.error(`Sign-in failed (${errorCode})`);
                  }
                }
              }} 
              className="gap-3 h-14 px-10 rounded-2xl shadow-xl shadow-primary/20 font-black text-lg transition-all active:scale-95"
            >
              <LogIn className="w-5 h-5" />
              Sign in with Google
            </Button>
          </div>
        ) : null}
        
        <ScrollArea className="h-full p-8" ref={scrollRef}>
          <div className="space-y-8">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex gap-4 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <Avatar className="w-10 h-10 border-2 border-white shadow-md">
                      {m.role === 'user' ? (
                        <AvatarFallback className="bg-slate-200 text-slate-600 font-black tracking-tight">
                          {user?.displayName?.charAt(0) || 'U'}
                        </AvatarFallback>
                      ) : (
                        <AvatarFallback className="bg-primary text-white font-black"><Bot className="w-5 h-5" /></AvatarFallback>
                      )}
                    </Avatar>
                    <div className="space-y-1">
                      <div
                        className={`rounded-[1.5rem] px-5 py-3 text-base font-medium shadow-sm transition-all ${
                          m.role === 'user'
                            ? 'bg-primary text-white rounded-tr-none shadow-primary/10'
                            : 'bg-white border text-slate-700 rounded-tl-none border-slate-100 shadow-slate-100/50'
                        }`}
                      >
                        {m.text}
                      </div>
                      <p className={`text-[9px] font-black uppercase tracking-widest text-slate-300 ${m.role === 'user' ? 'text-right mr-1' : 'text-left ml-1'}`}>
                        {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="flex gap-4 items-center bg-white rounded-2xl px-5 py-3 border border-slate-100 rounded-tl-none shadow-sm shadow-slate-100/30">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Beacon is thinking...</span>
                </div>
              </motion.div>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      <CardFooter className="p-6 border-t glass flex flex-col gap-4">
        {selectedFile && (
          <div className="w-full flex items-center justify-between bg-primary/5 p-3 rounded-2xl border border-primary/10 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="bg-white p-2 rounded-xl border border-primary/10">
                <File className="w-4 h-4 text-primary shrink-0" />
              </div>
              <span className="text-sm font-black text-slate-700 truncate">{selectedFile.name}</span>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              className="h-8 w-8 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
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
            className="rounded-2xl h-14 w-14 border-slate-200 text-slate-400 hover:text-primary hover:border-primary/30 transition-all active:scale-95"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isSubmitting || !user}
            title="Attach Document"
          >
            <Paperclip className="w-5 h-5" />
          </Button>
          <div className="flex-1 relative">
            <Input
              placeholder={user ? "Describe the emergency..." : "Please sign in..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading || isSubmitting || !user}
              className="h-14 px-6 rounded-2xl bg-white border-slate-200 focus-visible:ring-primary font-medium text-slate-700 placeholder:text-slate-300"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
               <Button 
                type="button" 
                variant="ghost"
                size="icon"
                onClick={toggleListening}
                disabled={isLoading || isSubmitting || !user}
                className={`rounded-xl h-10 w-10 transition-all ${isListening ? "bg-red-50 text-red-500 animate-pulse" : "text-slate-400 hover:text-primary hover:bg-primary/5"}`}
              >
                {isListening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <Button 
            type="submit" 
            disabled={isLoading || isSubmitting || (!input.trim() && !selectedFile) || !user} 
            className="rounded-2xl h-14 w-14 shadow-xl shadow-primary/20 transition-all active:scale-95"
            size="icon"
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
