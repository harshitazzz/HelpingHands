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
        if (error.code === 'auth/popup-closed-by-user') {
          toast.info('Sign in cancelled');
        } else {
          toast.error('Authentication failed');
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
    <Card className="w-full max-w-2xl mx-auto h-[600px] flex flex-col shadow-xl border-t-4 border-t-primary">
      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/30 py-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-2 rounded-full">
            <Bot className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg">Beacon AI Assistant</CardTitle>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Online | Emergency Support
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {messages.length > 2 && (
            <Button 
              variant="default" 
              size="sm" 
              className="bg-green-600 hover:bg-green-700 text-white shadow-lg animate-in fade-in slide-in-from-right-4"
              onClick={handleSubmitReport}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Submit Report
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSpeechEnabled(!isSpeechEnabled)}
            title={isSpeechEnabled ? "Disable Text-to-Speech" : "Enable Text-to-Speech"}
          >
            {isSpeechEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden p-0 relative">
        {!user ? (
          <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="bg-primary/10 p-4 rounded-full">
              <LogIn className="w-10 h-10 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold">Sign in to use Beacon</h3>
              <p className="text-sm text-muted-foreground max-w-[250px]">
                Please sign in with your Google account to report emergencies and coordinate help.
              </p>
            </div>
            <Button 
              onClick={async () => {
                try {
                  await signInWithGoogle();
                } catch (error: any) {
                  if (error.code === 'auth/popup-closed-by-user') {
                    toast.info('Sign in cancelled');
                  } else {
                    toast.error('Authentication failed');
                  }
                }
              }} 
              className="gap-2"
            >
              <LogIn className="w-4 h-4" />
              Sign in with Google
            </Button>
          </div>
        ) : null}
        
        <ScrollArea className="h-full p-4" ref={scrollRef}>
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex gap-3 max-w-[80%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <Avatar className="w-8 h-8 border">
                      {m.role === 'user' ? (
                        <AvatarFallback className="bg-secondary text-secondary-foreground"><User className="w-4 h-4" /></AvatarFallback>
                      ) : (
                        <AvatarFallback className="bg-primary text-primary-foreground"><Bot className="w-4 h-4" /></AvatarFallback>
                      )}
                    </Avatar>
                    <div
                      className={`rounded-2xl px-4 py-2 text-sm shadow-sm ${
                        m.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-tr-none'
                          : 'bg-muted border rounded-tl-none'
                      }`}
                    >
                      {m.text}
                      <p className="text-[10px] opacity-50 mt-1 text-right">
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
                <div className="flex gap-3 items-center bg-muted rounded-2xl px-4 py-2 border rounded-tl-none">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground italic">Beacon is thinking...</span>
                </div>
              </motion.div>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      <CardFooter className="p-4 border-t bg-muted/10 flex flex-col gap-2">
        {selectedFile && (
          <div className="w-full flex items-center justify-between bg-primary/5 p-2 rounded-xl border border-primary/10 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <File className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs font-bold text-slate-700 truncate">{selectedFile.name}</span>
            </div>
            <Button 
              variant="ghost" 
              size="icon-xs" 
              onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              className="h-6 w-6 rounded-full hover:bg-red-50 hover:text-red-500"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex w-full gap-2"
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
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isSubmitting || !user}
            title="Attach PDF or Text"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <Input
            placeholder={user ? "Describe the emergency or ask for help..." : "Please sign in to chat..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading || isSubmitting || !user}
            className="flex-1 focus-visible:ring-primary"
          />
          <Button 
            type="button" 
            variant={isListening ? "destructive" : "outline"} 
            size="icon"
            onClick={toggleListening}
            disabled={isLoading || isSubmitting || !user}
            className={isListening ? "animate-pulse" : ""}
          >
            {isListening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
          <Button type="submit" disabled={isLoading || isSubmitting || (!input.trim() && !selectedFile) || !user} size="icon">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
