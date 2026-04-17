import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Paperclip, X, File, Sparkles, HandHelping } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
        toast.success(`Mission created! ${matchCount} heroes notified.`);
      } else {
        toast.success('Mission created! Our team will handle coordination.');
      }

      setStructuredData(null);
      setReportText('');
      setSelectedFile(null);
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save to database');
    }
  };

  return (
    <Card className="w-full shadow-none border-none bg-transparent">
      <CardHeader className="px-0 pb-8">
        <div className="flex items-center gap-4 mb-2">
          <div className="bg-primary/10 p-3 rounded-2xl">
            <FileText className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-3xl font-black text-slate-900 tracking-tight">Report Intelligence</CardTitle>
        </div>
        <CardDescription className="text-lg font-medium text-slate-500 max-w-2xl">
          Beacon extracts structured mission data from your raw reports for instant volunteer coordination.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8 px-0">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div
              className={`border-4 border-dashed rounded-[2.5rem] p-12 text-center transition-all cursor-pointer group relative overflow-hidden ${selectedFile ? 'border-primary bg-primary/5 shadow-inner' : 'border-slate-100 hover:border-primary/30 hover:bg-slate-50'}`}
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
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white p-6 rounded-[2rem] shadow-xl shadow-primary/10"
                  >
                    <File className="w-12 h-12 text-primary" />
                  </motion.div>
                  <div className="space-y-1">
                    <p className="font-black text-xl text-slate-900 line-clamp-1 px-4">{selectedFile.name}</p>
                    <p className="text-xs font-black text-primary uppercase tracking-[0.2em]">{(selectedFile.size / 1024).toFixed(1)} KB • Document Verified</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setReportText(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="rounded-xl hover:bg-red-50 hover:text-red-500 font-bold"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Remove File
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 py-8">
                  <div className="bg-white p-6 rounded-[2rem] shadow-lg shadow-slate-100 group-hover:scale-110 transition-transform">
                    <Upload className="w-12 h-12 text-slate-300 group-hover:text-primary transition-colors" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-black text-xl text-slate-900 tracking-tight">Upload NGO Report</p>
                    <p className="text-sm font-medium text-slate-400">PDF or TXT documents supported</p>
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-100"></span>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-[#FCFDF7] px-6 text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">Coordination Intelligence</span>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Text Context</p>
              <Textarea
                placeholder="Paste the raw report content here for Beacon to analyze..."
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                className="min-h-[220px] p-6 resize-none focus-visible:ring-primary rounded-[2rem] border-slate-100 bg-white text-base font-medium placeholder:text-slate-300 shadow-sm"
              />
            </div>

            <Button
              onClick={handleProcess}
              disabled={isProcessing || !reportText.trim()}
              className="w-full h-16 rounded-2xl font-black text-lg shadow-2xl shadow-primary/30 transition-all active:scale-95 disabled:shadow-none"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                  Analyzing Report...
                </>
              ) : (
                <>
                  <Sparkles className="w-6 h-6 mr-3" />
                  Extract Intelligence
                </>
              )}
            </Button>
          </div>

          <div className="relative">
            <AnimatePresence mode="wait">
              {structuredData ? (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="glass p-10 rounded-[3rem] space-y-8 border-white shadow-2xl sticky top-4"
                >
                  <div className="flex items-center justify-between border-b border-white pb-6">
                    <div className="space-y-1">
                      <h4 className="text-2xl font-black text-slate-900 tracking-tight">Analysis Results</h4>
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest">Confidence: High</p>
                    </div>
                    <Badge className={structuredData.urgency === 'critical' ? 'bg-red-100 text-red-600 border-none px-4 py-2 rounded-xl font-black' : 'bg-primary/10 text-primary border-none px-4 py-2 rounded-xl font-black'}>
                      {structuredData.urgency.toUpperCase()}
                    </Badge>
                  </div>

                  <div className="grid gap-6">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Identified Issue</p>
                      <p className="text-xl font-black text-slate-900 leading-tight">{structuredData.issue}</p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Location Accuracy</p>
                      <p className="text-xl font-black text-slate-900 flex items-center justify-end gap-2">
                        <MapPin className="w-5 h-5 text-primary" /> {structuredData.location}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/50 p-6 rounded-[2rem] border border-white space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" /> Affected
                      </p>
                      <p className="text-2xl font-black text-slate-900">{structuredData.number_of_people_affected}</p>
                    </div>
                    <div className="bg-white/50 p-6 rounded-[2rem] border border-white space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <HandHelping className="w-4 h-4 text-primary" /> Needed
                      </p>
                      <p className="text-2xl font-black text-slate-900">{structuredData.volunteers_needed}</p>
                    </div>
                  </div>

                  {structuredData.required_skills && (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Skill Requirements</p>
                      <div className="flex flex-wrap gap-2">
                        {structuredData.required_skills.map((skill: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="bg-white border-none shadow-sm px-4 py-2 rounded-xl text-slate-700 font-bold">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-4 pt-4">
                    <Button onClick={handleSave} className="flex-1 h-14 rounded-2xl bg-primary hover:bg-green-600 font-black shadow-xl shadow-primary/20 transition-all active:scale-95">
                      <CheckCircle2 className="w-5 h-5 mr-2" />
                      Create Mission
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setStructuredData(null)}
                      className="h-14 px-8 rounded-2xl font-black text-slate-400 hover:text-red-500 transition-colors"
                    >
                      Discard
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <div className="bg-slate-50/50 rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center p-20 text-center space-y-6 h-full min-h-[500px]">
                  <div className="bg-white p-6 rounded-[2rem] shadow-sm">
                    <Sparkles className="w-10 h-10 text-slate-200" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-2xl font-black text-slate-900 tracking-tight leading-none">Intelligence Engine Ready</p>
                    <p className="text-slate-400 font-medium max-w-xs">Analysis will appear here once you process your report.</p>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
