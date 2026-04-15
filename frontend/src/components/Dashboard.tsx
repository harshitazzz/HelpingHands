import React, { useState, useEffect } from 'react';
import { db } from '@/src/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion, where, deleteDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapPin, Users, AlertCircle, Clock, CheckCircle2, UserCheck, Search, Star, Trash2, HandHelping, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { findMatches, assignVolunteer, Volunteer, completeRequest } from '@/src/lib/matching';
import { auth } from '@/src/lib/firebase';


interface Request {
  id: string;
  issue: string;
  location: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  number_of_people_affected?: number;
  volunteers_needed?: number;
  required_skills?: string[];
  status: 'pending' | 'assigned' | 'completed' | 'resolved';
  createdAt: any;
  assignedVolunteers?: string[];
  source?: string;
  noVolunteersAvailable?: boolean;
  image_keyword?: string;
}

export function Dashboard({ isAdmin = false }: { isAdmin?: boolean }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchingResults, setMatchingResults] = useState<(Volunteer & { score: number, matchingSkills: string[] })[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<Record<string, string[]>>({}); // requestId -> volunteerIds
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((u) => setUser(u));
    
    const q = query(collection(db, 'requests'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Request));
      setRequests(reqs.filter(r => r.status !== 'resolved'));
      setLoading(false);
    }, (error) => {
      console.error("Dashboard error:", error);
      toast.error("Failed to load requests");
    });

    const invQ = query(collection(db, 'invitations'), where('status', '==', 'pending'));
    const unsubscribeInvs = onSnapshot(invQ, (snapshot) => {
      const invMap: Record<string, string[]> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const rid = data.requestId;
        if (!invMap[rid]) invMap[rid] = [];
        invMap[rid].push(data.volunteerId);
      });
      setPendingInvitations(invMap);
    });

    return () => {
      unsubscribeAuth();
      unsubscribe();
      unsubscribeInvs();
    };
  }, []);

  const handleCompleteMission = async (requestId: string) => {
    if (!user) return;
    try {
      await completeRequest(requestId, user.uid);
      toast.success("Mission marked as completed! Thank you for your service.");
    } catch (error) {
      toast.error("Failed to complete mission");
    }
  };

  const handleFindMatches = async (req: Request) => {
    setIsMatching(true);
    try {
      const results = await findMatches(req.id, req.required_skills || [], req.location);
      setMatchingResults(results);
    } catch (error) {
      toast.error("Failed to find matches");
    } finally {
      setIsMatching(false);
    }
  };

  const handleAssign = async (requestId: string, volunteerId: string) => {
    try {
      await assignVolunteer(requestId, volunteerId);
      toast.success("Invitation sent to volunteer!");
    } catch (error) {
      toast.error("Failed to send invitation");
    }
  };

  const handleDeleteRequest = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this request?')) return;
    try {
      await deleteDoc(doc(db, 'requests', id));
      toast.success('Request deleted');
    } catch (error) {
      toast.error('Failed to delete request');
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical': return 'bg-red-100 text-red-700 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="relative">
          <Clock className="w-12 h-12 animate-spin text-primary opacity-20" />
          <HandHelping className="w-6 h-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Loading Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-[3rem] bg-white border border-slate-100 shadow-2xl shadow-slate-200/50">
        <div className="absolute top-0 right-0 w-full h-full pointer-events-none overflow-hidden">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#DCFCE7] rounded-full blur-[100px] opacity-60" />
          <div className="absolute top-1/2 -right-48 w-80 h-80 bg-[#DBEAFE] rounded-full blur-[100px] opacity-40" />
          <div className="absolute -bottom-24 left-1/4 w-64 h-64 bg-[#FEF9C3] rounded-full blur-[100px] opacity-50" />
        </div>
        
        <div className="relative z-10 p-10 md:p-20 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 text-primary mb-6"
          >
            <Sparkles className="w-5 h-5" />
            <span className="text-xs font-black uppercase tracking-[0.2em]">Our Shared Mission</span>
          </motion.div>
          
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-slate-900 leading-[0.85] mb-8">
            Helping <span className="text-primary italic">Hands</span>
          </h1>
          
          <p className="text-2xl md:text-3xl font-medium text-slate-500 mb-12 leading-tight max-w-2xl">
            "Because every need deserves the <span className="text-slate-900 font-bold">right help</span> at the <span className="text-primary font-bold">right time</span>"
          </p>
          
          <div className="flex flex-wrap gap-6">
            <div className="glass p-5 rounded-[2rem] flex items-center gap-4 transition-transform hover:scale-105">
              <div className="bg-[#DCFCE7] p-3 rounded-2xl">
                <Users className="w-6 h-6 text-green-700" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Community</p>
                <p className="text-lg font-black text-slate-900 leading-none">500+ Heroes</p>
              </div>
            </div>
            <div className="glass p-5 rounded-[2rem] flex items-center gap-4 transition-transform hover:scale-105">
              <div className="bg-[#DBEAFE] p-3 rounded-2xl">
                <AlertCircle className="w-6 h-6 text-blue-700" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Response</p>
                <p className="text-lg font-black text-slate-900 leading-none">AI Matching</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {user && requests.some(r => r.assignedVolunteers?.includes(user.uid)) && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-100 p-2 rounded-xl">
              <Star className="w-5 h-5 text-yellow-600 fill-yellow-600" />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-slate-900">Your Active Missions</h2>
          </div>
          <div className="grid gap-4">
            {requests.filter(r => r.assignedVolunteers?.includes(user.uid)).map(req => (
              <Card key={req.id} className="border-none shadow-lg bg-gradient-to-r from-[#DCFCE7]/30 to-white rounded-[2rem] overflow-hidden group">
                <CardContent className="p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Badge className="bg-primary text-white border-none px-3 py-1 rounded-full font-black text-[10px] tracking-widest">ACTIVE</Badge>
                      <h4 className="font-black text-xl text-slate-900">{req.issue}</h4>
                    </div>
                    <p className="text-slate-500 font-medium flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" /> {req.location}
                    </p>
                  </div>
                  <Button 
                    className="bg-primary hover:bg-green-600 text-white shadow-xl shadow-primary/20 w-full md:w-auto rounded-2xl px-10 h-14 font-black text-lg transition-all active:scale-95"
                    onClick={() => handleCompleteMission(req.id)}
                  >
                    <CheckCircle2 className="w-5 h-5 mr-3" />
                    Complete Mission
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <h2 className="text-4xl font-black tracking-tighter text-slate-900">Live Reports</h2>
            <p className="text-slate-500 font-medium text-lg">Real-time emergency monitoring & coordination.</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-white border p-1 rounded-2xl flex gap-1">
              <Badge variant="ghost" className="rounded-xl px-4 py-2 font-black text-slate-600">Total: {requests.length}</Badge>
              <Badge variant="destructive" className="bg-red-50 text-red-600 border-none rounded-xl px-4 py-2 font-black">Critical: {requests.filter(r => r.urgency === 'critical').length}</Badge>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence>
            {requests.map((req) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4 }}
              >
                <Card className="overflow-hidden border-none shadow-xl hover:shadow-2xl transition-all duration-500 rounded-[2.5rem] flex flex-col h-full bg-white group hover:-translate-y-2">
                  <CardContent className="p-8 space-y-6 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-3">
                        <Badge className={`${getUrgencyColor(req.urgency)} border border-transparent shadow-[0_4px_12px_-4px_rgba(0,0,0,0.1)] rounded-full px-4 py-1 font-black text-[10px] tracking-[0.1em]`}>
                          {req.urgency.toUpperCase()}
                        </Badge>
                        <h4 className="font-black text-2xl text-slate-900 leading-tight group-hover:text-primary transition-colors">{req.issue}</h4>
                        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-primary" /> {req.location}
                        </p>
                      </div>
                      
                      {isAdmin && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                          onClick={() => handleDeleteRequest(req.id)}
                        >
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50/80 p-4 rounded-3xl border border-slate-100 flex flex-col gap-1">
                        <Users className="w-5 h-5 text-primary" />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-2">Affected</p>
                        <p className="text-lg font-black text-slate-900">{req.number_of_people_affected || '?'}</p>
                      </div>
                      <div className="bg-slate-50/80 p-4 rounded-3xl border border-slate-100 flex flex-col gap-1">
                        <UserCheck className="w-5 h-5 text-secondary-foreground" />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-2">Volunteers</p>
                        <p className="text-lg font-black text-slate-900">{req.assignedVolunteers?.length || 0}/{req.volunteers_needed || '?'}</p>
                      </div>
                    </div>

                    {req.required_skills && req.required_skills.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {req.required_skills.map((skill, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] font-bold px-3 py-1 rounded-full bg-slate-50 border-slate-100 text-slate-500 italic">
                            #{skill.toLowerCase().replace(/\s/g, '')}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="mt-auto pt-6 flex items-center justify-between border-t border-slate-50">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {[1, 2, 3].map(i => (
                            <div key={i} className={`w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400`}>
                              {i}
                            </div>
                          ))}
                        </div>
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Nearby</span>
                      </div>
                      
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button className="rounded-2xl h-12 px-6 font-black bg-slate-900 text-white hover:bg-slate-800 shadow-lg transition-all active:scale-95">
                            <Search className="w-4 h-4 mr-2" />
                            Coordinate
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
                          <div className="bg-primary p-8 text-white">
                            <DialogHeader>
                              <DialogTitle className="text-2xl font-black">Volunteer Matching</DialogTitle>
                              <DialogDescription className="text-white/70 font-medium">
                                Ranking our heroes based on skills & location.
                              </DialogDescription>
                            </DialogHeader>
                          </div>
                          
                          <div className="p-8">
                            <ScrollArea className="max-h-[400px] pr-4">
                              <div className="space-y-4">
                                {isMatching ? (
                                  <div className="text-center py-12 space-y-4">
                                    <div className="relative mx-auto w-12 h-12">
                                      <Clock className="w-12 h-12 animate-spin text-primary opacity-20" />
                                      <Search className="w-6 h-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                                    </div>
                                    <p className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] animate-pulse">Syncing Database...</p>
                                  </div>
                                ) : matchingResults.length > 0 ? (
                                  matchingResults.map((v) => (
                                    <motion.div 
                                      key={v.uid} 
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      className="p-5 border border-slate-100 rounded-[1.5rem] flex items-center justify-between bg-slate-50/50 hover:bg-white hover:shadow-md transition-all group"
                                    >
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-3">
                                          <p className="font-black text-slate-900">{v.name}</p>
                                          <Badge className="bg-yellow-400 text-white border-none text-[9px] font-black px-2 py-0.5 rounded-full">
                                            {v.score}% MATCH
                                          </Badge>
                                        </div>
                                        <p className="text-xs font-bold text-slate-400 flex items-center gap-1 uppercase tracking-tighter">
                                          <MapPin className="w-3 h-3 text-primary" /> {v.location}
                                        </p>
                                      </div>
                                      <Button 
                                        size="sm" 
                                        className={`rounded-xl h-10 px-4 font-black transition-all ${
                                          req.assignedVolunteers?.includes(v.uid) || pendingInvitations[req.id]?.includes(v.uid)
                                          ? 'bg-slate-100 text-slate-400 border-none'
                                          : 'bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105'
                                        }`}
                                        disabled={req.assignedVolunteers?.includes(v.uid) || pendingInvitations[req.id]?.includes(v.uid)}
                                        onClick={() => handleAssign(req.id, v.uid)}
                                      >
                                        {req.assignedVolunteers?.includes(v.uid) ? 'Assigned' : 
                                         pendingInvitations[req.id]?.includes(v.uid) ? 'Invited' : 'Notify'}
                                      </Button>
                                    </motion.div>
                                  ))
                                ) : (
                                  <div className="text-center py-12 bg-slate-50 rounded-[2rem]">
                                    <div className="bg-white w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                                      <AlertCircle className="w-6 h-6 text-slate-300" />
                                    </div>
                                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No nearby matches</p>
                                  </div>
                                )}
                              </div>
                            </ScrollArea>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {requests.length === 0 && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-32 border-2 border-dashed rounded-[4rem] bg-white border-slate-100 shadow-inner"
        >
          <div className="bg-primary/10 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="w-12 h-12 text-primary" />
          </div>
          <h3 className="text-4xl font-black text-slate-900 tracking-tighter mb-2">System Status: All Clear</h3>
          <p className="text-slate-400 font-medium text-lg max-w-md mx-auto">No active emergency requests. Our community is being well looked after.</p>
        </motion.div>
      )}
    </div>
  );
}
