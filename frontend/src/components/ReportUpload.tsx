import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  File,
  FileText,
  HandHelping,
  Loader2,
  MapPin,
  Sparkles,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { getStructuredEmergencyData } from '@/src/lib/gemini';
import { db } from '@/src/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { autoAssignVolunteers } from '@/src/lib/matching';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { extractTextFromPDF } from '@/src/lib/pdfUtils';

export function ReportUpload() {
  const [reportText, setReportText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [structuredData, setStructuredData] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.type.startsWith('text/')) {
      toast.error('Please upload a PDF or text file');
      return;
    }

    setSelectedFile(file);
    setIsProcessing(true);

    try {
      let text = '';
      if (file.type === 'application/pdf') {
        toast.info('Extracting text from PDF...');
        text = await extractTextFromPDF(file);
      } else {
        text = await file.text();
      }

      if (text.trim()) {
        setReportText(text);
        toast.success('File content loaded! Beacon is ready to analyze.');
      } else {
        toast.error('Could not extract text from this file.');
      }
    } catch (error) {
      console.error('File read error:', error);
      toast.error('Failed to read file');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcess = async () => {
    if (!reportText.trim() || isProcessing) return;

    setIsProcessing(true);
    try {
      const data = await getStructuredEmergencyData(reportText);
      setStructuredData(data);
      toast.success('Report analyzed successfully!');
    } catch (error) {
      console.error('Processing error:', error);
      toast.error('Failed to process report');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!structuredData) return;

    try {
      const docRef = await addDoc(collection(db, 'requests'), {
        ...structuredData,
        status: 'pending',
        createdAt: serverTimestamp(),
        assignedVolunteers: [],
        source: 'ngo',
      });

      const matchCount = await autoAssignVolunteers(
        docRef.id,
        structuredData.required_skills || [],
        structuredData.location,
        structuredData.issue
      );

      if (matchCount > 0) {
        toast.success(`Mission created! ${matchCount} volunteers were notified.`);
      } else {
        toast.success('Mission created! The request is live on the dashboard.');
      }

      setStructuredData(null);
      setReportText('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save to database');
    }
  };

  return (
    <Card className="border-none bg-transparent shadow-none">
      <CardHeader className="px-0 pb-6">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[1.4rem] bg-[#e8f4ff] text-[#4e7fa1]">
            <FileText className="h-7 w-7" />
          </div>
          <div>
            <CardTitle className="font-heading text-3xl font-extrabold tracking-tight text-slate-900">NGO report intake</CardTitle>
            <CardDescription className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
              Upload a PDF or paste report text. Beacon extracts key information, previews the structured issue, and submits it for automatic volunteer assignment.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 px-0 lg:grid-cols-[1fr_0.95fr]">
        <div className="space-y-6">
          <div
            className={`relative overflow-hidden rounded-[2.2rem] border-2 border-dashed p-8 text-center transition ${
              selectedFile
                ? 'border-[#9ed7c8] bg-[#effaf6]'
                : 'border-[#d8e9f0] bg-[#f9fcfd] hover:border-[#9ec9dc] hover:bg-white'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf,.txt"
              onChange={handleFileChange}
            />

            {selectedFile ? (
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-white shadow-lg shadow-slate-200/20">
                  <File className="h-10 w-10 text-primary" />
                </div>
                <div>
                  <p className="text-xl font-bold tracking-tight text-slate-900">{selectedFile.name}</p>
                  <p className="mt-1 text-[11px] font-black uppercase tracking-[0.24em] text-primary">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    setReportText('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="rounded-full text-rose-500 hover:bg-rose-50"
                >
                  <X className="mr-2 h-4 w-4" />
                  Remove file
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-white shadow-lg shadow-slate-200/20">
                  <Upload className="h-10 w-10 text-slate-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight text-slate-900">Upload NGO report</p>
                  <p className="mt-2 text-sm text-slate-500">PDF and text files supported</p>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              'Extract issue details',
              'Find important keywords',
              'Auto-assign volunteers',
            ].map((item) => (
              <div key={item} className="rounded-[1.5rem] bg-[#f7fcfb] p-4">
                <p className="text-sm font-semibold leading-6 text-slate-700">{item}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Extracted or pasted text</p>
            <Textarea
              placeholder="Paste the NGO report or let the PDF loader fill this area..."
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              className="min-h-[260px] rounded-[2rem] border-none bg-[#f7fcfb] p-6 text-base leading-7 shadow-inner placeholder:text-slate-300"
            />
          </div>

          <Button
            onClick={handleProcess}
            disabled={isProcessing || !reportText.trim()}
            className="h-14 w-full rounded-full bg-slate-900 text-base text-white hover:bg-slate-800 disabled:bg-slate-300"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Analyzing report
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                Extract intelligence
              </>
            )}
          </Button>
        </div>

        <div className="relative">
          <AnimatePresence mode="wait">
            {structuredData ? (
              <motion.div
                key="results"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                className="soft-panel sticky top-4 rounded-[2.2rem] p-6"
              >
                <div className="flex items-start justify-between gap-4 border-b border-white/60 pb-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Structured summary</p>
                    <h3 className="mt-2 font-heading text-2xl font-extrabold tracking-tight text-slate-900">Ready to submit</h3>
                  </div>
                  <Badge className="rounded-full bg-[#effaf6] px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-[#2d6d63]">
                    {structuredData.urgency || 'pending'}
                  </Badge>
                </div>

                <div className="mt-6 space-y-5">
                  <div className="rounded-[1.6rem] bg-white/75 p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Detected issue</p>
                    <p className="mt-3 text-lg font-bold text-slate-900">{structuredData.issue}</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-[1.6rem] bg-white/75 p-5">
                      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        <MapPin className="h-4 w-4 text-primary" />
                        Location
                      </p>
                      <p className="mt-3 text-sm font-semibold text-slate-800">{structuredData.location}</p>
                    </div>
                    <div className="rounded-[1.6rem] bg-white/75 p-5">
                      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        <Users className="h-4 w-4 text-[#4f7ca1]" />
                        People affected
                      </p>
                      <p className="mt-3 text-sm font-semibold text-slate-800">{structuredData.number_of_people_affected || 'Unknown'}</p>
                    </div>
                  </div>

                  <div className="rounded-[1.6rem] bg-white/75 p-5">
                    <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                      <HandHelping className="h-4 w-4 text-primary" />
                      Volunteers needed
                    </p>
                    <p className="mt-3 text-sm font-semibold text-slate-800">{structuredData.volunteers_needed || 'To be determined'}</p>
                  </div>

                  {structuredData.required_skills?.length ? (
                    <div>
                      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Important keywords / required skills</p>
                      <div className="flex flex-wrap gap-2">
                        {structuredData.required_skills.map((skill: string, index: number) => (
                          <Badge
                            key={`${skill}-${index}`}
                            className="rounded-full bg-[#e8f3ff] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#4d7997]"
                          >
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button onClick={handleSave} className="h-12 rounded-full bg-primary text-white hover:bg-primary/90">
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Submit report
                    </Button>
                    <Button variant="ghost" onClick={() => setStructuredData(null)} className="h-12 rounded-full text-slate-600 hover:bg-white">
                      Discard draft
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                className="rounded-[2.2rem] border border-dashed border-[#d8e9f0] bg-[#f9fcfd] p-8"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-[1.6rem] bg-white text-[#4e7fa1] shadow-lg shadow-slate-200/20">
                  <Sparkles className="h-8 w-8" />
                </div>
                <h3 className="mt-6 font-heading text-2xl font-extrabold tracking-tight text-slate-900">Analysis preview will appear here</h3>
                <p className="mt-3 text-sm leading-7 text-slate-500">
                  Once Beacon extracts the report, this panel will show the issue summary, important keywords, location, affected count, and the exact data that will be sent for volunteer assignment.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}
