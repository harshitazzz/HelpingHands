import React, { useState, useEffect } from 'react';
import { db } from '@/src/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion, where, deleteDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapPin, Users, AlertCircle, Clock, CheckCircle2, UserCheck, Search, Star, Trash2 } from 'lucide-react';
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

    // Also listen to invitations to show "Invited" status
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
      case 'critical': return 'bg-red-600 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      default: return 'bg-blue-500 text-white';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Clock className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-yellow-50 via-blue-50 to-green-50 border border-white shadow-xl">
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
          <div className="absolute top-10 right-10 w-64 h-64 bg-primary rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-10 right-40 w-48 h-48 bg-blue-400 rounded-full blur-3xl" />
        </div>
        
        <div className="relative z-10 p-8 md:p-16 max-w-3xl">
          <Badge className="bg-primary/10 text-primary border-primary/20 mb-6 px-4 py-1 rounded-full font-bold uppercase tracking-widest text-[10px]">
            Our Motive
          </Badge>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight text-slate-900 leading-[0.9] mb-6">
            Helping Hands
          </h1>
          <p className="text-2xl md:text-3xl font-heading italic text-slate-700 mb-8 leading-tight">
            "Because every need deserves the right help at the right time"
          </p>
          <div className="flex flex-wrap gap-4">
            <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-sm border border-white flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-xl">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Community</p>
                <p className="text-sm font-black">500+ Volunteers</p>
              </div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-sm border border-white flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-xl">
                <AlertCircle className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Response</p>
                <p className="text-sm font-black">AI-Powered Matching</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {user && requests.some(r => r.assignedVolunteers?.includes(user.uid)) && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            <h2 className="text-xl font-bold tracking-tight">My Active Missions</h2>
          </div>
          <div className="grid gap-4">
            {requests.filter(r => r.assignedVolunteers?.includes(user.uid)).map(req => (
              <Card key={req.id} className="border-l-4 border-l-green-500 bg-green-50/30 rounded-3xl overflow-hidden">
                <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-600">ACTIVE MISSION</Badge>
                      <h4 className="font-bold text-lg">{req.issue}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {req.location}
                    </p>
                  </div>
                  <Button 
                    className="bg-green-600 hover:bg-green-700 w-full md:w-auto rounded-full px-8 h-12 font-bold"
                    onClick={() => handleCompleteMission(req.id)}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Mark as Resolved
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black tracking-tight">Latest Emergencies</h2>
            <p className="text-slate-500">Real-time monitoring of reported issues and volunteer assignments.</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-white rounded-full px-4">Total: {requests.length}</Badge>
            <Badge variant="destructive" className="rounded-full px-4">Critical: {requests.filter(r => r.urgency === 'critical').length}</Badge>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {requests.map((req) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Card className="overflow-hidden border-none shadow-lg hover:shadow-2xl transition-all duration-300 rounded-[2rem] flex flex-col h-full group">
                  <CardContent className="p-6 space-y-4 flex-1 flex flex-col">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <Badge className={`${getUrgencyColor(req.urgency)} border-none rounded-full px-3 w-fit`}>
                          {req.urgency.toUpperCase()}
                        </Badge>
                        <h4 className="font-bold text-lg line-clamp-1">{req.issue}</h4>
                        <p className="text-slate-500 text-xs flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {req.location}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant={req.status === 'completed' ? 'secondary' : 'outline'} className="rounded-full">
                          {req.status.toUpperCase()}
                        </Badge>
                        {isAdmin && (
                          <Button 
                            variant="ghost" 
                            size="icon-xs" 
                            className="text-red-500 hover:bg-red-50"
                            onClick={() => handleDeleteRequest(req.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl">
                        <Users className="w-4 h-4 text-primary" />
                        <span>{req.number_of_people_affected || 'N/A'} Affected</span>
                      </div>
                      <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl">
                        <UserCheck className="w-4 h-4 text-primary" />
                        <span>{req.assignedVolunteers?.length || 0}/{req.volunteers_needed || '?'} Help</span>
                      </div>
                    </div>

                    {req.required_skills && req.required_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {req.required_skills.slice(0, 3).map((skill, i) => (
                          <Badge key={i} variant="secondary" className="text-[9px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border-blue-100">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="mt-auto pt-4">
                      <Dialog>
                        <DialogTrigger
                          render={
                            <Button variant="outline" size="sm" className="w-full rounded-full h-10 font-bold border-slate-200 hover:bg-primary hover:text-white hover:border-primary transition-all" onClick={() => handleFindMatches(req)}>
                              <Search className="w-3 h-3 mr-2" />
                              Find Volunteers
                            </Button>
                          }
                        />
                        <DialogContent className="max-w-md rounded-3xl">
                          <DialogHeader>
                            <DialogTitle>Volunteer Matching</DialogTitle>
                            <DialogDescription>
                              Ranked volunteers based on skills and location for "{req.issue}".
                            </DialogDescription>
                          </DialogHeader>
                          <ScrollArea className="max-h-[400px] pr-4">
                            <div className="space-y-3">
                              {isMatching ? (
                                <div className="text-center py-8">
                                  <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                                  <p className="text-sm text-muted-foreground">Scanning volunteer database...</p>
                                </div>
                              ) : matchingResults.length > 0 ? (
                                matchingResults.map((v) => (
                                  <div key={v.uid} className="p-4 border rounded-2xl flex items-center justify-between bg-slate-50/50">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <p className="font-bold text-sm">{v.name}</p>
                                        <Badge variant="secondary" className="text-[10px] bg-yellow-100 text-yellow-800 border-yellow-200">
                                          <Star className="w-2 h-2 mr-1 fill-yellow-600" />
                                          Score: {v.score}
                                        </Badge>
                                      </div>
                                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <MapPin className="w-3 h-3" /> {v.location}
                                      </p>
                                    </div>
                                    <Button 
                                      size="sm" 
                                      className="rounded-full px-4"
                                      disabled={req.assignedVolunteers?.includes(v.uid) || pendingInvitations[req.id]?.includes(v.uid)}
                                      onClick={() => handleAssign(req.id, v.uid)}
                                    >
                                      {req.assignedVolunteers?.includes(v.uid) ? 'Assigned' : 
                                       pendingInvitations[req.id]?.includes(v.uid) ? 'Invited' : 'Assign'}
                                    </Button>
                                  </div>
                                ))
                              ) : (
                                <div className="text-center py-8">
                                  <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                                  <p className="text-sm text-muted-foreground">No available volunteers found matching these criteria.</p>
                                </div>
                              )}
                            </div>
                          </ScrollArea>
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
        <div className="text-center py-24 border-2 border-dashed rounded-[3rem] bg-slate-50 border-slate-200">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4 opacity-50" />
          <h3 className="text-2xl font-black text-slate-900">All clear!</h3>
          <p className="text-slate-500">No active emergency requests at the moment. Our community is safe.</p>
        </div>
      )}
    </div>
  );
}
