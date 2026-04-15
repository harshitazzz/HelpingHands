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
      
      // Fetch request details for each invitation
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
    const loadingToast = toast.loading("Resending email notification...");
    try {
      const baseUrl = window.location.origin;
      const response = await fetch("/api/send-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email,
          name: user?.displayName || "Volunteer",
          location: inv.requestDetails?.location || "Unknown",
          issue: inv.requestDetails?.issue || "Emergency Request",
          acceptLink: `${baseUrl}?accept=${inv.id}`,
          rejectLink: `${baseUrl}?reject=${inv.id}`
        })
      });
      
      const result = await response.json();
      toast.dismiss(loadingToast);
      
      if (result.success) {
        if (result.simulated) {
          toast.info("Email simulated. Set RESEND_API_KEY for real emails.");
        } else {
          toast.success("Email notification resent! Please check your inbox and Spam folder.");
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error(`Failed to resend email: ${error.message}`);
    }
  };

  if (!user) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center space-y-4">
          <Mail className="w-12 h-12 text-slate-300 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-lg font-medium">Sign in to view invitations</h3>
            <p className="text-sm text-slate-500">You'll see mission requests here once you're signed in.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Clock className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Mission Invitations</h2>
          <p className="text-sm text-muted-foreground">Accept or reject emergency response requests assigned to you.</p>
        </div>
        <Badge variant="outline" className="bg-white">Pending: {invitations.length}</Badge>
      </div>

      <ScrollArea className="h-[500px] pr-4">
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {invitations.map((inv) => (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                layout
              >
                <Card className="border-l-4 border-l-primary overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100">
                        NEW INVITATION
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {inv.createdAt?.toDate().toLocaleDateString()}
                      </span>
                    </div>
                    <CardTitle className="text-lg mt-2">
                      {inv.requestDetails?.issue || 'Emergency Request'}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      {inv.requestDetails?.location || 'Unknown Location'}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-slate-50 p-3 rounded-lg text-sm">
                      <p className="font-medium text-slate-700">Mission Details:</p>
                      <p className="text-slate-600 mt-1">
                        You have been matched for this mission based on your skills. Your help is needed immediately.
                      </p>
                      <button 
                        onClick={() => resendEmail(inv)}
                        className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" /> Didn't get the email? Resend notification
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        className="flex-1 bg-green-600 hover:bg-green-700" 
                        onClick={() => handleResponse(inv.id, 'accepted')}
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Accept Mission
                      </Button>
                      <Button 
                        variant="outline" 
                        className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleResponse(inv.id, 'rejected')}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Decline
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>

          {invitations.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed rounded-2xl bg-slate-50">
              <Mail className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900">No pending invitations</h3>
              <p className="text-slate-500">You're all caught up! New missions will appear here.</p>
              <div className="mt-6 p-4 bg-blue-50 rounded-xl text-xs text-blue-700 max-w-md mx-auto">
                <p className="font-bold mb-1 flex items-center justify-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Troubleshooting Emails
                </p>
                <p>If you're not receiving emails, check your <strong>Spam</strong> or <strong>Promotions</strong> folder. Note that Resend free tier only sends to your own account email.</p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
