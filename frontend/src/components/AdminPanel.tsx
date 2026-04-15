import React, { useState, useEffect } from 'react';
import { db, auth } from '@/src/lib/firebase';
import { collection, query, onSnapshot, doc, deleteDoc, updateDoc, getDocs, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ShieldCheck, 
  Trash2, 
  UserMinus, 
  Mail, 
  AlertTriangle, 
  Users, 
  Lock, 
  CheckCircle2,
  RefreshCcw,
  Search,
  MapPin,
  Phone,
  UserPlus,
  ShieldAlert
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

import { autoAssignVolunteers } from '@/src/lib/matching';

export function AdminPanel() {
  const [requests, setRequests] = useState<any[]>([]);
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'requests' | 'volunteers' | 'unsolved'>('requests');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week'>('all');
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    const unsubRequests = onSnapshot(collection(db, 'requests'), (snapshot) => {
      const allReqs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setRequests(allReqs.filter((r: any) => r.status !== 'resolved'));
    }, (error) => {
      console.error("AdminPanel requests error:", error);
      toast.error("Failed to load requests log");
    });

    const unsubVolunteers = onSnapshot(collection(db, 'volunteers'), (snapshot) => {
      setVolunteers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (error) => {
      console.error("AdminPanel volunteers error:", error);
      toast.error("Failed to load volunteer registry");
      setLoading(false);
    });

    return () => {
      unsubRequests();
      unsubVolunteers();
    };
  }, []);

  const handleAutoAssign = async (req: any) => {
    const loadingToast = toast.loading(`Triggering auto-assignment for ${req.location}...`);
    try {
      const count = await autoAssignVolunteers(
        req.id, 
        req.required_skills || [], 
        req.location, 
        req.issue
      );
      toast.dismiss(loadingToast);
      if (count > 0) {
        toast.success(`Successfully notified ${count} matching volunteers!`);
      } else {
        toast.info("No matching available volunteers found for this request.");
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error("Manual auto-assign error:", error);
      toast.error("Failed to trigger auto-assignment");
    }
  };

  const handleManualAssign = async (volunteer: any) => {
    if (!selectedRequest) return;
    setIsAssigning(true);
    const loadingToast = toast.loading(`Assigning ${volunteer.name}...`);
    try {
      await simulateEmail(volunteer.email, selectedRequest.issue, volunteer.name);
      toast.dismiss(loadingToast);
      toast.success(`Invitation sent to ${volunteer.name}`);
      setIsAssigning(false);
      setSelectedRequest(null);
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error("Failed to assign volunteer");
      setIsAssigning(false);
    }
  };

  const filterByTime = (reqs: any[]) => {
    if (timeFilter === 'all') return reqs;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    return reqs.filter(r => {
      if (!r.createdAt) return false;
      const date = r.createdAt.toDate();
      if (timeFilter === 'today') return date >= startOfToday;
      if (timeFilter === 'week') return date >= oneWeekAgo;
      return true;
    });
  };

  const handleDeleteRequest = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this request?')) return;
    try {
      await deleteDoc(doc(db, 'requests', id));
      toast.success('Request deleted');
    } catch (error: any) {
      console.error('Delete request error:', error);
      toast.error(`Failed to delete request: ${error.message || 'Unknown error'}`);
    }
  };

  const handleRemoveVolunteer = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this volunteer?')) return;
    try {
      await deleteDoc(doc(db, 'volunteers', id));
      try {
        await deleteDoc(doc(db, 'users', id));
      } catch (userErr) {
        console.warn('Could not delete user record, might not exist:', userErr);
      }
      toast.success('Volunteer removed');
    } catch (error: any) {
      console.error('Remove volunteer error:', error);
      toast.error(`Failed to remove volunteer: ${error.message || 'Unknown error'}`);
    }
  };

  const simulateEmail = async (volunteerEmail: string, issue: string, volunteerName: string = "Volunteer") => {
    const baseUrl = window.location.origin;
    const mockId = "manual_" + Math.random().toString(36).substr(2, 9);
    const acceptLink = `${baseUrl}?accept=${mockId}`;
    const rejectLink = `${baseUrl}?reject=${mockId}`;
    
    const loadingToast = toast.loading(`Sending invitation to ${volunteerEmail}...`);
    
    try {
      const response = await fetch("/api/send-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: volunteerEmail,
          name: volunteerName,
          location: "Manual Assignment",
          issue: issue,
          acceptLink,
          rejectLink
        })
      });
      
      const result = await response.json();
      toast.dismiss(loadingToast);
      
      if (result.success) {
        if (result.simulated) {
          toast.info(`Email simulated for ${volunteerEmail}`, {
            description: "Set RESEND_API_KEY in secrets for real emails.",
            duration: 6000
          });
        } else {
          toast.success(`Invitation email sent to ${volunteerEmail}!`, {
            description: "Note: Resend free tier only delivers to your own account email unless you verify a domain.",
            duration: 8000
          });
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast.dismiss(loadingToast);
      console.error("Email error:", error);
      toast.error(`Failed to send email: ${error.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="space-y-12">
      <div className="relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-[#DCFCE7]/30 to-[#FEF9C3]/30 blur-3xl -z-10 opacity-60" />
        <div className="glass p-10 rounded-[3rem] border-white/50 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="bg-slate-900 p-4 rounded-[1.5rem] shadow-2xl rotate-3 group-hover:rotate-0 transition-transform">
              <ShieldCheck className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h2 className="text-4xl font-black tracking-tighter text-slate-900 leading-none mb-2">Command Center</h2>
              <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px]">L4 Systems Administrator</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 bg-slate-100/50 p-1.5 rounded-[2rem] border border-slate-200/50 backdrop-blur-sm">
            <button 
              onClick={() => setActiveTab('requests')}
              className={`px-8 py-3 rounded-2xl text-sm font-black transition-all ${activeTab === 'requests' ? 'bg-white shadow-lg text-primary scale-105' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Missions
              </div>
            </button>
            <button 
              onClick={() => setActiveTab('unsolved')}
              className={`px-8 py-3 rounded-2xl text-sm font-black transition-all ${activeTab === 'unsolved' ? 'bg-white shadow-lg text-red-500 scale-105' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                Alerts
              </div>
            </button>
            <button 
              onClick={() => setActiveTab('volunteers')}
              className={`px-8 py-3 rounded-2xl text-sm font-black transition-all ${activeTab === 'volunteers' ? 'bg-white shadow-lg text-primary scale-105' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Registry
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-12">
        <AnimatePresence mode="wait">
          {activeTab === 'requests' && (
            <motion.div
              key="missions"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="rounded-[3rem] border-white shadow-2xl overflow-hidden bg-white">
                <CardHeader className="p-10 pb-4 flex flex-row items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-3xl font-black text-slate-900 tracking-tighter">Mission Control</CardTitle>
                    <CardDescription className="font-medium text-slate-500">Global response coordination log</CardDescription>
                  </div>
                  <div className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                    {(['all', 'today', 'week'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setTimeFilter(f)}
                        className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${timeFilter === f ? 'bg-white shadow-md text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="p-10 pt-0">
                  <ScrollArea className="h-[650px] pr-6">
                    <div className="space-y-6">
                      {filterByTime(requests).map((req) => (
                        <motion.div 
                          layout
                          key={req.id} 
                          className={`group p-8 border rounded-[2rem] transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-8 ${selectedRequest?.id === req.id ? 'bg-primary/5 border-primary shadow-2xl shadow-primary/10' : 'bg-slate-50/50 border-slate-100 hover:bg-white hover:shadow-xl hover:border-white'}`}
                        >
                          <div className="space-y-4 flex-1">
                            <div className="flex items-center gap-4">
                              <Badge className={req.urgency === 'critical' ? 'bg-red-50 text-red-500 border-none px-4 py-2 rounded-xl font-black' : 'bg-primary/10 text-primary border-none px-4 py-2 rounded-xl font-black'}>
                                {req.urgency.toUpperCase()}
                              </Badge>
                              <h4 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{req.issue}</h4>
                            </div>
                            <div className="flex flex-wrap gap-6 items-center">
                              <div className="flex items-center gap-2 text-slate-400 font-bold text-sm">
                                <MapPin className="w-4 h-4 text-primary" /> {req.location}
                              </div>
                              <div className="flex items-center gap-2 text-slate-400 font-bold text-sm">
                                <Clock className="w-4 h-4 text-primary" /> {req.createdAt?.toDate().toLocaleDateString()}
                              </div>
                              <Badge variant="outline" className="border-slate-200 text-slate-400 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">#{req.id.slice(0, 8)}</Badge>
                            </div>
                            {req.assignedVolunteers && req.assignedVolunteers.length > 0 && (
                              <div className="flex items-center gap-2 bg-green-500/10 w-fit px-4 py-2 rounded-xl border border-green-500/20">
                                <Users className="w-4 h-4 text-green-600" />
                                <span className="text-xs font-black text-green-700 uppercase tracking-widest">
                                  {req.assignedVolunteers.length} Responders Engaged
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-4 shrink-0">
                            <Button 
                              variant={selectedRequest?.id === req.id ? 'default' : 'outline'}
                              className={`h-14 px-8 rounded-2xl font-black text-sm shadow-xl transition-all active:scale-95 ${selectedRequest?.id === req.id ? 'bg-slate-900 border-none' : 'border-slate-200 hover:border-primary/30 hover:text-primary'}`}
                              onClick={() => setSelectedRequest(selectedRequest?.id === req.id ? null : req)}
                            >
                              <UserPlus className="w-5 h-5 mr-3" />
                              {selectedRequest?.id === req.id ? 'Engaging...' : 'Assign'}
                            </Button>
                            <Button 
                              variant="outline" 
                              className="h-14 w-14 rounded-2xl border-slate-200 text-primary hover:bg-primary/5 hover:border-primary/30 transition-all active:scale-95"
                              onClick={() => handleAutoAssign(req)}
                              title="Smart Match"
                            >
                              <RefreshCcw className="w-5 h-5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              className="h-14 w-14 rounded-2xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all active:scale-95"
                              onClick={() => handleDeleteRequest(req.id)}
                            >
                              <Trash2 className="w-5 h-5" />
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                      {requests.length === 0 && (
                        <div className="text-center py-24 bg-slate-50/50 rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center gap-6">
                          <CheckCircle2 className="w-16 h-16 text-slate-200" />
                          <div className="space-y-1">
                            <p className="text-2xl font-black text-slate-900 tracking-tight">System Clear</p>
                            <p className="text-slate-400 font-medium">All humanitarian vectors are currently stable.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeTab === 'unsolved' && (
            <motion.div
              key="alerts"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="rounded-[3rem] border-red-100 shadow-2xl overflow-hidden bg-white">
                <CardHeader className="p-10 pb-4">
                  <div className="bg-red-50 p-3 rounded-2xl w-fit mb-4">
                    <ShieldAlert className="w-8 h-8 text-red-500 animate-pulse" />
                  </div>
                  <CardTitle className="text-3xl font-black text-slate-900 tracking-tighter">High Latency Issues</CardTitle>
                  <CardDescription className="font-medium text-slate-500">Missions exceeding the 7-day coordination SLA</CardDescription>
                </CardHeader>
                <CardContent className="p-10 pt-0">
                  <ScrollArea className="h-[650px] pr-6">
                    <div className="space-y-6">
                      {requests.filter(r => {
                        if (!r.createdAt) return false;
                        const oneWeekAgo = new Date();
                        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                        return r.createdAt.toDate() < oneWeekAgo && r.status !== 'resolved';
                      }).map((req) => (
                        <div key={req.id} className="p-8 border-2 border-red-50 bg-red-50/20 rounded-[2.5rem] flex flex-col lg:flex-row lg:items-center justify-between gap-8 animate-in zoom-in-95 duration-500">
                          <div className="space-y-4 flex-1">
                            <div className="flex items-center gap-4">
                              <Badge className="bg-red-500 text-white border-none px-4 py-2 rounded-xl font-black shadow-lg shadow-red-200">CRITICAL DELAY</Badge>
                              <h4 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{req.issue}</h4>
                            </div>
                            <div className="flex flex-wrap gap-6 items-center">
                              <div className="flex items-center gap-2 text-slate-500 font-bold text-sm">
                                <MapPin className="w-4 h-4 text-red-500" /> {req.location}
                              </div>
                              <div className="flex items-center gap-2 text-red-600 font-extrabold text-[10px] uppercase tracking-widest bg-white h-8 px-4 rounded-full border border-red-100">
                                Opened: {req.createdAt?.toDate().toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <Button 
                            className="h-16 px-10 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black shadow-2xl shadow-red-200 transition-all active:scale-95"
                            onClick={() => handleAutoAssign(req)}
                          >
                            <RefreshCcw className="w-5 h-5 mr-3" /> Re-trigger Intelligence
                          </Button>
                        </div>
                      ))}
                      {requests.filter(r => {
                        if (!r.createdAt) return false;
                        const oneWeekAgo = new Date();
                        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                        return r.createdAt.toDate() < oneWeekAgo && r.status !== 'resolved';
                      }).length === 0 && (
                        <div className="text-center py-24 bg-green-50/30 rounded-[3rem] border-2 border-dashed border-green-100 flex flex-col items-center gap-6">
                          <ShieldCheck className="w-16 h-16 text-green-200" />
                          <div className="space-y-1">
                            <p className="text-2xl font-black text-slate-900 tracking-tight">SLA Optimized</p>
                            <p className="text-slate-400 font-medium font-bold">All missions are within acceptable time parameters.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeTab === 'volunteers' && (
            <motion.div
              key="volunteers"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="rounded-[3rem] border-white shadow-2xl overflow-hidden bg-white">
                <CardHeader className="p-10 pb-4">
                  <CardTitle className="text-3xl font-black text-slate-900 tracking-tighter">Verified Responders</CardTitle>
                  <CardDescription className="font-medium text-slate-500">
                    {selectedRequest 
                      ? <span className="text-primary font-black uppercase tracking-widest text-[10px]">Filtering for: {selectedRequest.issue}</span> 
                      : "The human network driving global coordination."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-10 pt-0">
                  <ScrollArea className="h-[650px] pr-6">
                    <div className="space-y-6">
                      {volunteers.map((v) => (
                        <div key={v.id} className={`p-8 border rounded-[2.5rem] flex flex-col lg:flex-row lg:items-center justify-between gap-8 transition-all ${selectedRequest && v.availability === 'available' ? 'bg-[#DCFCE7]/20 border-primary ring-2 ring-primary/10' : 'bg-slate-50/50 border-slate-100 hover:bg-white hover:shadow-xl hover:border-white'}`}>
                          <div className="flex flex-col md:flex-row items-center gap-8">
                            <Avatar className="w-20 h-20 border-[4px] border-white shadow-xl ring-2 ring-slate-100">
                              <AvatarFallback className="text-2xl font-black bg-slate-900 text-white">
                                {v.name?.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="space-y-2 text-center md:text-left">
                              <h4 className="text-2xl font-black text-slate-900 tracking-tight leading-none">{v.name}</h4>
                              <div className="flex flex-wrap justify-center md:justify-start gap-4">
                                <div className="flex items-center gap-2 text-slate-500 font-bold text-sm">
                                  <MapPin className="w-4 h-4 text-primary" /> {v.location}
                                </div>
                                <div className="flex items-center gap-2 text-slate-500 font-bold text-sm">
                                  <Mail className="w-4 h-4 text-primary" /> {v.email}
                                </div>
                              </div>
                              <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-4">
                                {v.skills?.slice(0, 3).map((s: string, i: number) => (
                                  <Badge key={i} className="bg-white border-none shadow-sm px-3 py-1 rounded-lg text-slate-700 font-black text-[10px] uppercase tracking-wider">{s}</Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap justify-center lg:justify-end gap-3 shrink-0">
                            <Badge className={`h-12 px-6 rounded-2xl font-black uppercase tracking-widest text-[10px] border-none shadow-lg ${v.availability === 'available' ? 'bg-green-500 text-white shadow-green-100' : 'bg-slate-100 text-slate-400'}`}>
                              {v.availability}
                            </Badge>
                            {selectedRequest && v.availability === 'available' && (
                              <Button 
                                className="h-12 px-8 rounded-2xl bg-primary hover:bg-green-600 text-white font-black shadow-xl shadow-primary/20 transition-all active:scale-95"
                                onClick={() => handleManualAssign(v)}
                                disabled={isAssigning}
                              >
                                <UserPlus className="w-4 h-4 mr-2" />
                                Assign L4
                              </Button>
                            )}
                            <Button 
                              variant="outline" 
                              className="h-12 w-12 rounded-2xl border-slate-100 text-slate-400 hover:text-primary hover:bg-primary/5 transition-all active:scale-95"
                              onClick={() => simulateEmail(v.email, "Manual check-in from Admin HQ", v.name)}
                              title="HQ Check-in"
                            >
                              <Mail className="w-5 h-5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              className="h-12 w-12 rounded-2xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all active:scale-95"
                              onClick={() => handleRemoveVolunteer(v.id)}
                            >
                              <UserMinus className="w-5 h-5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {volunteers.length === 0 && (
                        <div className="text-center py-24 bg-slate-50/50 rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center gap-6">
                           <Users className="w-16 h-16 text-slate-200" />
                           <div className="space-y-1">
                             <p className="text-2xl font-black text-slate-900 tracking-tight">Zero Responders</p>
                             <p className="text-slate-400 font-medium">Coordinate with HQ to onboard new personnel.</p>
                           </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
