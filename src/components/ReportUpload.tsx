import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { getStructuredEmergencyData } from '@/src/lib/gemini';
import { db } from '@/src/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { autoAssignVolunteers } from '@/src/lib/matching';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

export function ReportUpload() {
  const [reportText, setReportText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [structuredData, setStructuredData] = useState<any>(null);

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
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save request');
    }
  };

  return (
    <Card className="w-full shadow-lg border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          NGO Report Upload
        </CardTitle>
        <CardDescription>
          Paste a raw text report and Beacon will extract structured data for volunteer matching.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Textarea
            placeholder="Example: Flood in Sonipat, 50 people affected, need food and medical help immediately..."
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            className="min-h-[150px] resize-none focus-visible:ring-primary"
          />
          <Button 
            onClick={handleProcess} 
            disabled={isProcessing || !reportText.trim()}
            className="w-full"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing with Gemini...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
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
