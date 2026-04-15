import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Paperclip, X, File, Sparkles } from 'lucide-react';
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
        toast.success('File content loaded! Click "Process Report" to analyze.');
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
      toast.success('Report processed successfully!');
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

      // Auto-assign volunteers
      const matchCount = await autoAssignVolunteers(
        docRef.id, 
        structuredData.required_skills || [], 
        structuredData.location,
        structuredData.issue
      );
      
      if (matchCount > 0) {
        toast.success(`Emergency created! ${matchCount} matching volunteers notified.`);
      } else {
        toast.success('Emergency request created! No immediate matches found.');
      }
      
      setStructuredData(null);
      setReportText('');
      setSelectedFile(null);
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save request');
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setReportText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Card className="w-full shadow-lg border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          NGO Report Upload
        </CardTitle>
        <CardDescription>
          Upload a PDF/Text report or paste raw text. Beacon will extract structured data for volunteer matching.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div 
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${selectedFile ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary/50 hover:bg-slate-50'}`}
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
              <div className="flex flex-col items-center gap-2">
                <div className="bg-primary/10 p-3 rounded-full">
                  <File className="w-8 h-8 text-primary" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{selectedFile.name}</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); removeFile(); }}
                    className="p-1 hover:bg-slate-200 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
                <p className="text-xs text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB • Ready to process</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="bg-slate-100 p-3 rounded-full">
                  <Upload className="w-8 h-8 text-slate-400" />
                </div>
                <p className="font-bold text-slate-700">Click to upload or drag and drop</p>
                <p className="text-xs text-slate-500 text-center">Support for PDF and TXT files. Max size 5MB.</p>
              </div>
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-100"></span>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest">
              <span className="bg-white px-4 text-slate-300">Or Paste Text</span>
            </div>
          </div>

          <Textarea
            placeholder="Example: Flood in Sonipat, 50 people affected, need food and medical help immediately..."
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            className="min-h-[150px] resize-none focus-visible:ring-primary rounded-2xl border-slate-200"
          />
          
          <Button 
            onClick={handleProcess} 
            disabled={isProcessing || !reportText.trim()}
            className="w-full h-12 rounded-2xl font-black shadow-lg shadow-primary/20"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing with Gemini...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Process Report
              </>
            )}
          </Button>
        </div>

        {structuredData && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl border bg-slate-50 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900">Extracted Information</h4>
              <Badge variant={structuredData.urgency === 'critical' ? 'destructive' : 'default'}>
                {structuredData.urgency.toUpperCase()} URGENCY
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase">Issue</p>
                <p className="font-medium">{structuredData.issue}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase">Location</p>
                <p className="font-medium">{structuredData.location}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase">Affected People</p>
                <p className="font-medium">{structuredData.number_of_people_affected || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase">Volunteers Needed</p>
                <p className="font-medium">{structuredData.volunteers_needed || 'TBD'}</p>
              </div>
            </div>

            {structuredData.required_skills && (
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase mb-2">Required Skills</p>
                <div className="flex flex-wrap gap-2">
                  {structuredData.required_skills.map((skill: string, idx: number) => (
                    <Badge key={idx} variant="outline" className="bg-white">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} className="flex-1 bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Confirm & Save to Database
              </Button>
              <Button variant="outline" onClick={() => setStructuredData(null)}>
                Discard
              </Button>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
