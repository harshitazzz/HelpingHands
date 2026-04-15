import React, { useState, useEffect } from 'react';
import { db, auth } from '@/src/lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { respondToInvitation } from '@/src/lib/matching';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Mail, Check, X, Clock, MapPin, AlertCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

interface Invitation {
  id: string;
  requestId: string;
  volunteerId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: any;
  requestDetails?: {
    issue: string;
    location: string;
    urgency: string;
  };
}

export function VolunteerInvitations() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setInvitations([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'invitations'),
      where('volunteerId', '==', user.uid),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const invs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Invitation));
      
      const detailedInvs = await Promise.all(invs.map(async (inv) => {
        const reqDoc = await getDoc(doc(db, 'requests', inv.requestId));
        return {
          ...inv,
          requestDetails: reqDoc.exists() ? reqDoc.data() as any : undefined
        };
      }));

      setInvitations(detailedInvs);
      setLoading(false);
    }, (error) => {
      console.error("Invitations error:", error);
      toast.error("Failed to load invitations");
    });

    return () => unsubscribe();
  }, [user]);

  const handleResponse = async (invitationId: string, status: 'accepted' | 'rejected') => {
    try {
      await respondToInvitation(invitationId, status);
      toast.success(`Invitation ${status} successfully!`);
    } catch (error) {
      toast.error(`Failed to ${status} invitation`);
    }
  };

  const resendEmail = async (inv: Invitation) => {
    const loadingToast = toast.loading("Resending mission notification...");
    try {
      const baseUrl = window.location.origin;
      const response = await fetch("/api/send-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email,
          name: user?.displayName || "Volunteer",
          location: inv.requestDetails?.location || "Unknown",
          issue: inv.requestDetails?.issue || "Emergency Response Request",
          acceptLink: `${baseUrl}?accept=${inv.id}`,
          rejectLink: `${baseUrl}?reject=${inv.id}`
        })
      });
      
      const result = await response.json();
      toast.dismiss(loadingToast);
      
      if (result.success) {
        if (result.simulated) {
          toast.info("Notification simulated. Set RESEND_API_KEY for real emails.");
        } else {
          toast.success("High-priority notification resent! Please check your secure inbox.");
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error(`Failed to resend mission data: ${error.message}`);
    }
  };

  if (!user) {
    return (
      <Card className="border-4 border-dashed border-slate-100 rounded-[3rem] bg-white/50 backdrop-blur-md">
        <CardContent className="py-24 text-center space-y-6">
          <div className="bg-slate-50 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto shadow-inner">
            <Mail className="w-12 h-12 text-slate-200" />
          </div>
          <div className="space-y-2">
            <h3 className="text-3xl font-black text-slate-900 tracking-tight">Access Locked</h3>
            <p className="text-slate-400 font-medium">Please sign in to view your assigned mission invitations.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Clock className="w-10 h-10 animate-spin text-primary" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">Retrieving Assignations</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4">
        <div className="space-y-2">
          <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-tight">Active Missions</h2>
          <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px]">Strategic Field Deployment Quota</p>
        </div>
        <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-2xl shadow-xl shadow-slate-100/50 border border-slate-50">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Queue Status</span>
          <Badge className="bg-primary/10 text-primary border-none font-black text-sm px-4 rounded-xl">
            {invitations.length} Pending
          </Badge>
        </div>
      </div>

      <ScrollArea className="h-[600px] pr-6">
        <div className="space-y-8 pb-10">
          <AnimatePresence mode="popLayout">
            {invitations.map((inv) => (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                layout
              >
                <Card className="rounded-[2.5rem] border-white shadow-2xl overflow-hidden bg-white group hover:shadow-primary/5 transition-all duration-500">
                  <CardHeader className="p-10 pb-4">
                    <div className="flex justify-between items-start mb-6">
                      <div className="bg-primary/10 p-4 rounded-2xl group-hover:scale-110 transition-transform">
                        <AlertCircle className="w-6 h-6 text-primary" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 bg-slate-50 px-4 py-2 rounded-full">
                        {inv.createdAt?.toDate().toLocaleDateString()}
                      </span>
                    </div>
                    <CardTitle className="text-3xl font-black text-slate-900 tracking-tighter group-hover:text-primary transition-colors">
                      {inv.requestDetails?.issue || 'Emergency Field Request'}
                    </CardTitle>
                    <div className="flex items-center gap-3 text-slate-500 font-bold tracking-tight mt-4 bg-slate-50/50 w-fit px-4 py-2 rounded-xl">
                      <MapPin className="w-4 h-4 text-primary" />
                      {inv.requestDetails?.location || 'Coordinate Unspecified'}
                    </div>
                  </CardHeader>
                  <CardContent className="p-10 pt-4 space-y-10">
                    <div className="relative">
                      <div className="absolute inset-0 bg-slate-50 rounded-[2rem] -z-10" />
                      <div className="p-8 space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-ping" />
                          <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Intelligence Summary</h5>
                        </div>
                        <p className="text-slate-600 font-medium leading-relaxed text-lg">
                          Strategic algorithm has matched your profile expertise to this humanitarian vector. Immediate intervention is requested.
                        </p>
                        <button 
                          onClick={() => resendEmail(inv)}
                          className="text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/70 transition-colors flex items-center gap-2 pt-2"
                        >
                          <Send className="w-3.5 h-3.5" /> Synchronize secure credentials to mail
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <Button 
                        className="flex-1 h-16 rounded-2xl bg-slate-900 border-none text-white font-black text-lg shadow-2xl shadow-slate-200 active:scale-95 transition-all" 
                        onClick={() => handleResponse(inv.id, 'accepted')}
                      >
                        <Check className="w-6 h-6 mr-3" />
                        Accept Mission
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="flex-1 h-16 rounded-2xl font-black text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all active:scale-95"
                        onClick={() => handleResponse(inv.id, 'rejected')}
                      >
                        <X className="w-6 h-6 mr-3" />
                        Decline Deployment
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>

          {invitations.length === 0 && (
            <div className="text-center py-32 bg-slate-50/50 rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center gap-8">
              <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-100/50">
                <Check className="w-12 h-12 text-green-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">Mission Board Clear</h3>
                <p className="text-slate-400 font-bold uppercase tracking-[0.1em] text-xs">All assignations have been successfully resolved.</p>
              </div>
              <div className="p-6 bg-white/60 backdrop-blur-sm rounded-[2rem] border border-slate-100 max-w-md mx-6 text-left space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Protocol Check</span>
                </div>
                <p className="text-slate-500 text-xs font-medium leading-relaxed">
                  If you are expecting a mission but don't see it, please verify your profile visibility in identity settings and check your secure transit folders (Spam/Promotions).
                </p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
