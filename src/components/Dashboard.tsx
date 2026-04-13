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
    <div className="space-y-6">
      {user && requests.some(r => r.assignedVolunteers?.includes(user.uid)) && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            <h2 className="text-xl font-bold tracking-tight">My Active Missions</h2>
          </div>
          <div className="grid gap-4">
            {requests.filter(r => r.assignedVolunteers?.includes(user.uid)).map(req => (
              <Card key={req.id} className="border-l-4 border-l-green-500 bg-green-50/30">
                <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-600">ACTIVE MISSION</Badge>
                      <h4 className="font-bold">{req.issue}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {req.location}
                    </p>
                  </div>
                  <Button 
                    className="bg-green-600 hover:bg-green-700 w-full md:w-auto"
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

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Active Emergencies</h2>
          <p className="text-sm text-muted-foreground">Real-time monitoring of reported issues and volunteer assignments.</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="bg-white">Total: {requests.length}</Badge>
          <Badge variant="destructive">Critical: {requests.filter(r => r.urgency === 'critical').length}</Badge>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <AnimatePresence>
          {requests.map((req) => (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Card className="overflow-hidden border-l-4 h-full flex flex-col" style={{ borderLeftColor: req.urgency === 'critical' ? '#dc2626' : req.urgency === 'high' ? '#f97316' : '#3b82f6' }}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <Badge className={getUrgencyColor(req.urgency)}>
                      {req.urgency.toUpperCase()}
                    </Badge>
                    <Badge variant={req.status === 'completed' ? 'secondary' : 'outline'}>
                      {req.status.toUpperCase()}
                    </Badge>
                    {isAdmin && (
                      <Button 
                        variant="ghost" 
                        size="icon-xs" 
                        className="text-red-500 hover:bg-red-50 ml-2"
                        onClick={() => handleDeleteRequest(req.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <CardTitle className="text-lg mt-2">{req.issue}</CardTitle>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {req.location}</span>
                    <Badge 
                      variant={req.source === 'chatbot' ? 'default' : 'outline'} 
                      className={`text-[10px] h-5 px-1.5 font-medium ${req.source === 'chatbot' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200' : 'bg-slate-50 text-slate-600'}`}
                    >
                      {req.source === 'chatbot' ? 'AI Chatbot' : 'NGO Report'}
                    </Badge>
                  </div>
                {req.noVolunteersAvailable && req.status === 'pending' && (
                  <div className="mt-2 p-2 bg-orange-50 border border-orange-100 rounded-lg flex items-center gap-2 text-[10px] text-orange-700">
                    <AlertCircle className="w-3 h-3" />
                    <span>No volunteers available at this moment. We will connect to you soon.</span>
                  </div>
                )}
              </CardHeader>
                <CardContent className="space-y-4 flex-1">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                      <Users className="w-4 h-4 text-slate-500" />
                      <span>{req.number_of_people_affected || 'N/A'} Affected</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                      <UserCheck className="w-4 h-4 text-slate-500" />
                      <span>{req.assignedVolunteers?.length || 0} / {req.volunteers_needed || '?'} Assigned</span>
                    </div>
                  </div>

                  {req.required_skills && req.required_skills.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {req.required_skills.slice(0, 4).map((skill, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {skill}
                        </Badge>
                      ))}
                      {req.required_skills.length > 4 && <span className="text-[10px] text-muted-foreground">+{req.required_skills.length - 4} more</span>}
                    </div>
                  )}

                  <Dialog>
                    <DialogTrigger render={<Button variant="outline" size="sm" className="w-full mt-4" onClick={() => handleFindMatches(req)} />}>
                      <Search className="w-3 h-3 mr-2" />
                      Find Matching Volunteers
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
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
                              <div key={v.uid} className="p-3 border rounded-xl flex items-center justify-between bg-slate-50/50">
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
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {v.matchingSkills.map((s, i) => (
                                      <Badge key={i} variant="outline" className="text-[9px] py-0 px-1 border-green-200 text-green-700 bg-green-50">
                                        {s}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                                <Button 
                                  size="sm" 
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
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
      {requests.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed rounded-2xl bg-slate-50">
          <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900">All clear!</h3>
          <p className="text-slate-500">No active emergency requests at the moment.</p>
        </div>
      )}
    </div>
  );
}
