import React, { useState, useEffect } from 'react';
import { db } from '@/src/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion, where, deleteDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapPin, Users, AlertCircle, Clock, CheckCircle2, UserCheck, Search, Star, Trash2, HandHelping, Sparkles, Heart, MessageSquare } from 'lucide-react';
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

export function Dashboard({ isAdmin = false, onNavigate }: { isAdmin?: boolean, onNavigate?: (tab: string) => void }) {
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
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest animate-pulse">Syncing Community Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-24 pb-20">
      {/* 🚀 Hero Section - Full Width Impact */}
      <section className="relative -mx-4 md:-mx-8 lg:-mx-12 overflow-hidden bg-white border-y border-slate-100 min-h-[70vh] flex items-center">
        <div className="absolute inset-0 pointer-events-none">
          {/* Dynamic Background Elements */}
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
              rotate: [0, 90, 0]
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute top-[-20%] right-[-10%] w-[60%] h-[120%] bg-gradient-to-br from-[#DCFCE7] to-[#FEF9C3] rounded-full blur-[120px]"
          />
          <motion.div 
            animate={{ 
              scale: [1, 1.3, 1],
              opacity: [0.2, 0.4, 0.2],
              x: [0, 50, 0]
            }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-[-10%] left-[-5%] w-[50%] h-[100%] bg-gradient-to-tr from-[#DBEAFE] to-[#DCFCE7] rounded-full blur-[100px]"
          />
        </div>

        <div className="container mx-auto px-6 lg:px-12 relative z-10 grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="space-y-8"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full border border-primary/20">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Crowdsourced Emergency Response</span>
            </div>

            <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-slate-900 leading-[0.85]">
              Connecting <span className="text-primary italic">Hearts</span>,<br />
              Saving <span className="text-blue-600">Lives</span>.
            </h1>

            <p className="text-xl md:text-2xl font-medium text-slate-500 leading-relaxed max-w-xl">
              Helping Hands instantly bridges the gap between those in urgent need and local heroes ready to help. Real-time, AI-powered, and community-driven.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                onClick={() => onNavigate?.('assistant')}
                className="h-16 px-10 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 text-lg font-black shadow-2xl shadow-slate-900/40 transition-all hover:scale-105 active:scale-95"
              >
                Raise a Help Request
                <Search className="w-5 h-5 ml-3" />
              </Button>
              <Button 
                variant="outline"
                onClick={() => onNavigate?.('profile')}
                className="h-16 px-10 rounded-2xl border-2 border-slate-100 hover:border-primary/50 text-slate-900 text-lg font-black transition-all hover:bg-white"
              >
                Become a Hero
              </Button>
            </div>
          </motion.div>

          {/* Impact Stats Overlay */}
          <div className="relative">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.2 }}
              className="grid grid-cols-2 gap-6"
            >
              <div className="bg-white/80 backdrop-blur-md p-8 rounded-[3rem] border border-white shadow-xl flex flex-col items-center text-center transform hover:-translate-y-2 transition-transform duration-500">
                <div className="bg-primary/10 p-4 rounded-2xl mb-4">
                  <Users className="w-8 h-8 text-primary" />
                </div>
                <p className="text-4xl font-black text-slate-900 tracking-tighter">500+</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Verified Heroes</p>
              </div>
              <div className="bg-white/80 backdrop-blur-md p-8 rounded-[3rem] border border-white shadow-xl flex flex-col items-center text-center transform translate-y-8 hover:translate-y-6 transition-transform duration-500">
                <div className="bg-blue-100 p-4 rounded-2xl mb-4">
                  <Heart className="w-8 h-8 text-blue-600" />
                </div>
                <p className="text-4xl font-black text-slate-900 tracking-tighter">1.2K</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Lives Impacted</p>
              </div>
              <div className="bg-white/80 backdrop-blur-md p-8 rounded-[3rem] border border-white shadow-xl flex flex-col items-center text-center transform -translate-y-4 hover:-translate-y-6 transition-transform duration-500">
                <div className="bg-yellow-100 p-4 rounded-2xl mb-4">
                  <CheckCircle2 className="w-8 h-8 text-yellow-600" />
                </div>
                <p className="text-4xl font-black text-slate-900 tracking-tighter">98%</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Resolution Rate</p>
              </div>
              <div className="bg-white/80 backdrop-blur-md p-8 rounded-[3rem] border border-white shadow-xl flex flex-col items-center text-center transform translate-y-4 hover:translate-y-2 transition-transform duration-500">
                <div className="bg-green-100 p-4 rounded-2xl mb-4">
                  <Clock className="w-8 h-8 text-green-600" />
                </div>
                <p className="text-4xl font-black text-slate-900 tracking-tighter">8m</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Avg. Response</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* 🛤️ Roadmap Section - How It Works */}
      <section className="space-y-16">
        <div className="text-center space-y-4">
          <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-slate-900">How It Works</h2>
          <p className="text-slate-500 font-medium text-lg max-w-2xl mx-auto">Our streamlined process ensures help arrives exactly when it's needed most.</p>
        </div>

        <div className="relative grid md:grid-cols-3 gap-12">
          {/* Connector Line */}
          <div className="hidden md:block absolute top-1/2 left-0 w-full h-px bg-slate-200 -translate-y-1/2 z-0" />
          
          {[
            { 
              step: "01", 
              title: "Raise Request", 
              desc: "User reports an emergency via our AI-powered Chatbot. Location and urgency are automatically analyzed.",
              icon: MessageSquare,
              color: "bg-blue-500"
            },
            { 
              step: "02", 
              title: "Auto-Assignment", 
              desc: "The system instantly identifies and notifies the most qualified local volunteers based on skills and proximity.",
              icon: Users,
              color: "bg-primary"
            },
            { 
              step: "03", 
              title: "Rapid Action", 
              desc: "Volunteers receive details and navigate to the site to resolve the issue and mark it as completed.",
              icon: CheckCircle2,
              color: "bg-slate-900"
            }
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2 }}
              className="relative z-10 bg-white/50 backdrop-blur-sm p-10 rounded-[2.5rem] border border-white shadow-lg space-y-6 group hover:shadow-2xl transition-all duration-500"
            >
              <div className={`w-14 h-14 ${item.color} rounded-2xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform`}>
                <item.icon className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-black text-primary uppercase tracking-[0.3em]">{item.step}</p>
                <h3 className="text-2xl font-black text-slate-900">{item.title}</h3>
                <p className="text-slate-500 font-medium leading-relaxed">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 📊 Active Missions - Contextual Feedback */}
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
              <Card key={req.id} className="border-none shadow-lg bg-white/80 backdrop-blur-md rounded-[2rem] overflow-hidden group">
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

      {/* 📡 Live Reports - Clean & Modern Grid */}
      <div className="space-y-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <h2 className="text-4xl font-black tracking-tighter text-slate-900">Live Reports</h2>
            <p className="text-slate-500 font-medium text-lg">Real-time community needs awaiting coordination.</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-white border-2 border-slate-100 p-1 rounded-2xl flex gap-1 shadow-sm">
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
                <Card className="overflow-hidden border-none shadow-xl hover:shadow-2xl transition-all duration-500 rounded-[2.5rem] flex flex-col h-full bg-white/90 backdrop-blur-sm group hover:-translate-y-2">
                  <CardContent className="p-8 space-y-6 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-3">
                        <Badge className={`${getUrgencyColor(req.urgency)} border border-transparent shadow-sm rounded-full px-4 py-1 font-black text-[10px] tracking-[0.1em]`}>
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
                      <div className="bg-slate-50/80 p-5 rounded-[2rem] border border-slate-100 flex flex-col gap-1">
                        <Users className="w-5 h-5 text-blue-500" />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-2">Affected</p>
                        <p className="text-xl font-black text-slate-900">{req.number_of_people_affected || '?'}</p>
                      </div>
                      <div className="bg-slate-50/80 p-5 rounded-[2rem] border border-slate-100 flex flex-col gap-1">
                        <UserCheck className="w-5 h-5 text-primary" />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-2">Assigned</p>
                        <p className="text-xl font-black text-slate-900">{req.assignedVolunteers?.length || 0}</p>
                      </div>
                    </div>

                    <div className="mt-auto pt-6 flex items-center justify-between border-t border-slate-50">
                      <div className="flex items-center gap-2">
                         <Badge className="bg-blue-50 text-blue-600 border-none font-black text-[10px] px-3 py-1 rounded-full uppercase">
                           Awaiting Heroes
                         </Badge>
                      </div>

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            className="rounded-2xl h-12 px-6 font-black bg-slate-900 text-white hover:bg-slate-800 shadow-lg transition-all active:scale-95"
                            onClick={() => handleFindMatches(req)}
                          >
                            Coordinate
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
                          <div className="bg-slate-900 p-8 text-white">
                            <DialogHeader>
                              <DialogTitle className="text-2xl font-black text-white">Emergency Response</DialogTitle>
                              <DialogDescription className="text-white/50 font-medium">
                                System matching: finding local heroes with required expertise.
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
                                          <Badge className="bg-primary text-white border-none text-[9px] font-black px-2 py-0.5 rounded-full">
                                            {v.score}%
                                          </Badge>
                                        </div>
                                        <p className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                          <MapPin className="w-3 h-3 text-primary" /> {v.location}
                                        </p>
                                      </div>
                                      <Button
                                        size="sm"
                                        className={`rounded-xl h-10 px-4 font-black transition-all ${req.assignedVolunteers?.includes(v.uid) || pendingInvitations[req.id]?.includes(v.uid)
                                            ? 'bg-slate-100 text-slate-400'
                                            : 'bg-primary text-white hover:scale-105'
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
                                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No nearby matches found</p>
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

      {requests.length === 0 && (loading === false) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-32 border-4 border-dashed rounded-[4rem] bg-white/50 border-white shadow-inner"
        >
          <div className="bg-primary/10 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="w-12 h-12 text-primary" />
          </div>
          <h3 className="text-4xl font-black text-slate-900 tracking-tighter mb-2">Comunity Pulse: Healthy</h3>
          <p className="text-slate-400 font-medium text-lg max-w-md mx-auto">No urgent emergency requests detected. Everything is under control.</p>
        </motion.div>
      )}
    </div>
  );
}
