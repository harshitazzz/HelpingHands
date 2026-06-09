// Simplified ReportUpload component for file upload forwarding
import React, { useRef, useState } from 'react';
import { File as FileIcon, FileText, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

/** Props for ReportUpload component */
interface ReportUploadProps {
  /** Callback invoked when a file is selected; parent should handle sending */
  onFileSelect: (file: File) => void;
}

export function ReportUpload({ onFileSelect }: ReportUploadProps) {
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.type.startsWith('text/')) {
      toast.error('Please upload a PDF or text file');
      return;
    }
    // Immediately forward the file to Chatbot via callback
    onFileSelect(file);
    // Reset the file input for future uploads
    if (fileInputRef.current) fileInputRef.current.value = '';
    toast.success(`Uploaded ${file.name} and sent to assistant.`);
  };

  return (
    <Card className="border-none bg-transparent shadow-none">
      <CardHeader className="px-0 pb-6">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[1.4rem] bg-[#e8f4ff] text-[#4e7fa1]">
            <FileIcon className="h-7 w-7" />
          </div>
          <div>
            <CardTitle className="font-heading text-3xl font-extrabold tracking-tight text-slate-900">
              Upload NGO Report
            </CardTitle>
            <CardDescription className="mt-2 max-w-xl text-base leading-7 text-slate-600">
              Select a PDF or text file. The report will be sent directly to the assistant for analysis.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 px-0 lg:grid-cols-[1fr]">
        <Button
          onClick={() => fileInputRef.current?.click()}
          className="mb-4 h-10 px-4 rounded-full bg-primary text-white hover:bg-primary/90"
        >
          Upload file
        </Button>
        <div
          className="relative overflow-hidden rounded-[2.2rem] border-2 border-dashed p-8 text-center hover:border-[#9ec9dc] hover:bg-white"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".pdf,.txt"
            onChange={handleFileChange}
          />
          <div className="flex flex-col items-center gap-4 py-8">
            <Upload className="h-10 w-10 text-slate-300" />
            <h3 className="text-2xl font-bold tracking-tight text-slate-900">Upload NGO report</h3>
            <p className="mt-2 text-sm text-slate-500">PDF and text files supported</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
