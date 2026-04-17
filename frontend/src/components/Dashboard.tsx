import React, { useEffect, useMemo, useState } from 'react';
import { db, auth } from '@/src/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, where, deleteDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  HandHelping,
  HeartHandshake,
  MapPin,
  Search,
  Sparkles,
  Star,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { findMatches, assignVolunteer, Volunteer, completeRequest } from '@/src/lib/matching';

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

function toTitleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeAreaName(rawLocation?: string) {
  const fallback = 'Unknown area';
  if (!rawLocation) return fallback;

  const cleaned = rawLocation.trim();
  if (!cleaned) return fallback;

  const parts = cleaned
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const first = parts[0] || cleaned;
  const second = parts[1] || '';
  const lowerFirst = first.toLowerCase();
  const lowerSecond = second.toLowerCase();

  // Fold neighborhood-style labels into the parent city when present.
  if ((lowerFirst.startsWith('sector-') || lowerFirst.startsWith('sector ')) && second) {
    return toTitleCase(second);
  }

  // Prefer the broader city label when the first segment looks hyper-local.
  const localAreaKeywords = ['sector', 'block', 'ward', 'village', 'colony', 'phase'];
  if (localAreaKeywords.some((keyword) => lowerFirst.includes(keyword)) && second) {
    return toTitleCase(second);
  }

  // If both segments are effectively the same city with different casing, collapse them.
  if (second && lowerFirst === lowerSecond) {
    return toTitleCase(first);
  }

  return toTitleCase(first);
}

export function Dashboard({
  isAdmin = false,
  isVolunteer = false,
  onNavigate,
}: {
  isAdmin?: boolean;
  isVolunteer?: boolean;
  onNavigate?: (tab: string) => void;
}) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchingResults, setMatchingResults] = useState<(Volunteer & { score: number; matchingSkills: string[] })[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<Record<string, string[]>>({});
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((nextUser) => setUser(nextUser));

    const requestQuery = query(collection(db, 'requests'), orderBy('createdAt', 'desc'));
    const unsubscribeRequests = onSnapshot(
      requestQuery,
      (snapshot) => {
        const nextRequests = snapshot.docs.map((requestDoc) => ({
          id: requestDoc.id,
          ...requestDoc.data(),
        })) as Request[];

        setRequests(nextRequests);
        setLoading(false);
      },
      (error) => {
        console.error('Dashboard error:', error);
        toast.error('Failed to load requests');
        setLoading(false);
      }
    );

    const invitationsQuery = query(collection(db, 'invitations'), where('status', '==', 'pending'));
    const unsubscribeInvitations = onSnapshot(invitationsQuery, (snapshot) => {
      const invitationMap: Record<string, string[]> = {};
      snapshot.docs.forEach((invitationDoc) => {
        const data = invitationDoc.data();
        const requestId = data.requestId;
        if (!invitationMap[requestId]) invitationMap[requestId] = [];
        invitationMap[requestId].push(data.volunteerId);
      });
      setPendingInvitations(invitationMap);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeRequests();
      unsubscribeInvitations();
    };
  }, []);

  const activeRequests = useMemo(
    () => requests.filter((request) => request.status !== 'completed' && request.status !== 'resolved'),
    [requests]
  );
  const completedRequests = useMemo(
    () => requests.filter((request) => request.status === 'completed' || request.status === 'resolved'),
    [requests]
  );
  const activeMissions = useMemo(
    () => activeRequests.filter((request) => user && request.assignedVolunteers?.includes(user.uid)),
    [activeRequests, user]
  );
  const resolutionInsights = useMemo(() => {
    const resolvedWithTimes = completedRequests.filter((request: any) => request.createdAt && request.resolvedAt);
    const averageResolutionHours = resolvedWithTimes.length
      ? resolvedWithTimes.reduce((sum: number, request: any) => {
        const created = request.createdAt?.toDate?.() ?? null;
        const resolved = request.resolvedAt?.toDate?.() ?? null;
        if (!created || !resolved) return sum;
        return sum + Math.max(0, (resolved.getTime() - created.getTime()) / (1000 * 60 * 60));
      }, 0) / resolvedWithTimes.length
      : 0;

    const locationCounts = completedRequests.reduce((acc: Record<string, number>, request) => {
      const area = normalizeAreaName(request.location);
      acc[area] = (acc[area] || 0) + 1;
      return acc;
    }, {});

    const topAreas = Object.entries(locationCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([name, count]) => ({ name, count }));

    const busiestArea = topAreas[0]?.name || 'No dominant area yet';
    const maxAreaCount = topAreas[0]?.count || 1;

    return {
      totalResolved: completedRequests.length,
      averageResolutionHours,
      busiestArea,
      topAreas,
      maxAreaCount,
    };
  }, [completedRequests]);

  const handleCompleteMission = async (requestId: string) => {
    if (!user) return;
    try {
      await completeRequest(requestId, user.uid);
      toast.success('Mission marked as completed! Thank you for your service.');
    } catch (error) {
      console.error('Complete mission error:', error);
      toast.error('Failed to complete mission');
    }
  };

  const handleFindMatches = async (request: Request) => {
    setIsMatching(true);
    try {
      const results = await findMatches(request.id, request.required_skills || [], request.location);
      setMatchingResults(results);
    } catch (error) {
      console.error('Matching error:', error);
      toast.error('Failed to find matches');
    } finally {
      setIsMatching(false);
    }
  };

  const handleAssign = async (requestId: string, volunteerId: string) => {
    try {
      await assignVolunteer(requestId, volunteerId);
      toast.success('Invitation sent to volunteer!');
    } catch (error) {
      console.error('Assign error:', error);
      toast.error('Failed to send invitation');
    }
  };

  const handleDeleteRequest = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this request?')) return;
    try {
      await deleteDoc(doc(db, 'requests', id));
      toast.success('Request deleted');
    } catch (error) {
      console.error('Delete request error:', error);
      toast.error('Failed to delete request');
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return 'bg-[#fee5e2] text-[#c85d53]';
      case 'high':
        return 'bg-[#fff0df] text-[#b97240]';
      case 'medium':
        return 'bg-[#fff8dc] text-[#9d7b2a]';
      default:
        return 'bg-[#e5f2fe] text-[#48769c]';
    }
  };

  const metrics = [
    {
      label: 'Open now',
      value: activeRequests.length,
      description: 'Fresh emergencies currently visible on the homepage.',
      icon: AlertCircle,
    },
    {
      label: 'Critical now',
      value: activeRequests.filter((request) => request.urgency === 'critical').length,
      description: 'Highest-priority cases needing the quickest response.',
      icon: Clock,
    },
    {
      label: 'Help delivered',
      value: completedRequests.length,
      description: 'Cases that already moved from complaint to response.',
      icon: HeartHandshake,
    },
  ];

  if (loading) {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-4">
        <div className="relative">
          <Clock className="h-12 w-12 animate-spin text-primary/30" />
          <HandHelping className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-primary" />
        </div>
        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Loading community response feed</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-10">
      <section>
        <Card className="mesh-card overflow-hidden rounded-[2.5rem] border-none shadow-[0_20px_60px_rgba(114,149,165,0.14)]">
          <CardContent className="grid gap-8 p-8 lg:grid-cols-[1.35fr_0.95fr] lg:items-center">
            <div className="space-y-6">
              <div className="space-y-4">
                <h2 className="text-balance font-heading text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
                  Because every need deserves the right help at the right time.
                </h2>
                <p className="max-w-2xl text-base leading-8 text-slate-600 md:text-lg">
                  As soon as someone registers a complaint, HelpingHands structures the issue, highlights urgency, and routes it toward the right nearby volunteers. The homepage keeps both open emergencies and already-helped cases visible so trust grows with every response.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  onClick={() => onNavigate?.('assistant')}
                  className="h-14 rounded-full bg-slate-900 px-7 text-white hover:bg-slate-800"
                >
                  Raise a complaint
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onNavigate?.('predictive')}
                  className="h-14 rounded-full border-[#d6e8f2] bg-white/70 px-7 text-slate-800 hover:bg-white"
                >
                  View predictive tags
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
              {metrics.map((metric) => (
                <Card key={metric.label} className="soft-panel rounded-[1.8rem] border-none">
                  <CardContent className="flex items-center justify-between gap-4 p-5">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">{metric.label}</p>
                      <p className="mt-2 font-heading text-3xl font-extrabold tracking-tight text-slate-900">{metric.value}</p>
                      <p className="mt-2 text-xs leading-6 text-slate-600">{metric.description}</p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f6f1] text-primary">
                      <metric.icon className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {activeMissions.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fff4d8] text-[#bc8a35]">
              <Star className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-heading text-2xl font-extrabold tracking-tight text-slate-900">Your active missions</h3>
              <p className="text-sm text-slate-500">Finish your assigned requests directly from the homepage.</p>
            </div>
          </div>

          <div className="grid gap-4">
            {activeMissions.map((request) => (
              <Card key={request.id} className="rounded-[2rem] border-none bg-white/85 shadow-lg shadow-slate-200/30">
                <CardContent className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2">
                    <Badge className="rounded-full bg-[#eaf6ef] px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-[#2d6d62]">
                      Assigned to you
                    </Badge>
                    <h4 className="text-xl font-bold text-slate-900">{request.issue}</h4>
                    <p className="flex items-center gap-2 text-sm text-slate-500">
                      <MapPin className="h-4 w-4 text-primary" />
                      {request.location}
                    </p>
                  </div>
                  <Button
                    onClick={() => handleCompleteMission(request.id)}
                    className="h-12 rounded-full bg-primary px-6 text-white hover:bg-primary/90"
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Mark mission complete
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900">Latest emergencies</h3>
            <p className="text-sm text-slate-500">The most recent open cases that still need coordination and care.</p>
          </div>
          <Badge className="w-fit rounded-full bg-[#ebf4ff] px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-[#44759a]">
            Publicly visible
          </Badge>
        </div>

        {activeRequests.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-[2.5rem] border border-dashed border-white/80 bg-white/65 p-12 text-center shadow-inner"
          >
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#eaf6ef] text-primary">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h4 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900">Community pulse is calm</h4>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">
              No unresolved emergencies are showing right now. The homepage will surface the next complaint here as soon as one arrives.
            </p>
          </motion.div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence>
              {activeRequests.map((request, index) => (
                <motion.div
                  key={request.id}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ delay: index * 0.04 }}
                >
                  <Card className="h-full rounded-[2.25rem] border-none bg-white/90 shadow-xl shadow-slate-200/25 transition duration-300 hover:-translate-y-1.5 hover:shadow-2xl">
                    <CardContent className="flex h-full flex-col gap-6 p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-3">
                          <Badge className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] ${getUrgencyColor(request.urgency)}`}>
                            {request.urgency}
                          </Badge>
                          <h4 className="text-2xl font-bold tracking-tight text-slate-900">{request.issue}</h4>
                          <p className="flex items-center gap-2 text-sm text-slate-500">
                            <MapPin className="h-4 w-4 text-primary" />
                            {request.location}
                          </p>
                        </div>

                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-2xl text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                            onClick={() => handleDeleteRequest(request.id)}
                          >
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-[1.6rem] bg-[#f5fbfa] p-4">
                          <Users className="h-4 w-4 text-[#4a87ac]" />
                          <p className="mt-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">People affected</p>
                          <p className="mt-2 text-2xl font-extrabold text-slate-900">{request.number_of_people_affected || '?'}</p>
                        </div>
                        <div className="rounded-[1.6rem] bg-[#f5fbfa] p-4">
                          <UserCheck className="h-4 w-4 text-primary" />
                          <p className="mt-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Volunteers assigned</p>
                          <p className="mt-2 text-2xl font-extrabold text-slate-900">{request.assignedVolunteers?.length || 0}</p>
                        </div>
                      </div>

                      {request.required_skills?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {request.required_skills.slice(0, 3).map((skill) => (
                            <Badge key={skill} className="rounded-full bg-[#e8f3ff] px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#4d7996]">
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
                        <Badge className="rounded-full bg-[#eff8f4] px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#317063]">
                          Needs coordination
                        </Badge>

                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              onClick={() => handleFindMatches(request)}
                              className="rounded-full bg-slate-900 px-5 text-white hover:bg-slate-800"
                            >
                              Coordinate
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="overflow-hidden rounded-[2rem] border-none p-0 shadow-2xl sm:max-w-lg">
                            <div className="bg-slate-900 px-7 py-6 text-white">
                              <DialogHeader>
                                <DialogTitle className="font-heading text-2xl font-extrabold tracking-tight">Volunteer match room</DialogTitle>
                                <DialogDescription className="text-white/60">
                                  Find the closest and best-fit volunteers for this emergency.
                                </DialogDescription>
                              </DialogHeader>
                            </div>

                            <div className="bg-white p-6">
                              <ScrollArea className="max-h-[24rem] pr-4">
                                <div className="space-y-4">
                                  {isMatching ? (
                                    <div className="py-14 text-center">
                                      <div className="relative mx-auto mb-4 h-12 w-12">
                                        <Clock className="h-12 w-12 animate-spin text-primary/25" />
                                        <Search className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-primary" />
                                      </div>
                                      <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Matching volunteers</p>
                                    </div>
                                  ) : matchingResults.length > 0 ? (
                                    matchingResults.map((volunteer) => (
                                      <div
                                        key={volunteer.uid}
                                        className="flex items-center justify-between gap-4 rounded-[1.4rem] border border-slate-100 bg-[#f8fcfb] p-4"
                                      >
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                            <p className="font-bold text-slate-900">{volunteer.name}</p>
                                            <Badge className="rounded-full bg-[#e7f6f0] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#2f6d63]">
                                              {volunteer.score}%
                                            </Badge>
                                          </div>
                                          <p className="flex items-center gap-1 text-xs text-slate-500">
                                            <MapPin className="h-3 w-3 text-primary" />
                                            {volunteer.location}
                                          </p>
                                        </div>
                                        <Button
                                          size="sm"
                                          className="rounded-full"
                                          disabled={
                                            request.assignedVolunteers?.includes(volunteer.uid) ||
                                            pendingInvitations[request.id]?.includes(volunteer.uid)
                                          }
                                          onClick={() => handleAssign(request.id, volunteer.uid)}
                                        >
                                          {request.assignedVolunteers?.includes(volunteer.uid)
                                            ? 'Assigned'
                                            : pendingInvitations[request.id]?.includes(volunteer.uid)
                                              ? 'Invited'
                                              : 'Notify'}
                                        </Button>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="rounded-[1.6rem] bg-[#f8fbfd] p-10 text-center">
                                      <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">No nearby matches found</p>
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
        )}
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900">Resolution insights</h3>
            <p className="text-sm text-slate-500">A cleaner view of how quickly issues are being closed and where help is concentrated most.</p>
          </div>
          <Badge className="w-fit rounded-full bg-[#eaf6ef] px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-[#2e6b61]">
            Help delivered analytics
          </Badge>
        </div>

        {completedRequests.length === 0 ? (
          <Card className="rounded-[2rem] border-none bg-white/75 shadow-lg shadow-slate-200/25">
            <CardContent className="p-8">
              <p className="text-sm text-slate-500">Resolved-request analytics will appear here once volunteers start completing missions.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <Card className="rounded-[2.2rem] border-none bg-white/90 shadow-xl shadow-slate-200/20">
              <CardContent className="space-y-6 p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[1.8rem] bg-[#f5fbfa] p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Total resolved</p>
                    <p className="mt-3 font-heading text-4xl font-extrabold tracking-tight text-slate-900">
                      {resolutionInsights.totalResolved}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">Requests successfully closed by the network.</p>
                  </div>
                  <div className="rounded-[1.8rem] bg-[#f5fbfa] p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Avg. resolution time</p>
                    <p className="mt-3 font-heading text-4xl font-extrabold tracking-tight text-slate-900">
                      {resolutionInsights.averageResolutionHours > 0
                        ? `${resolutionInsights.averageResolutionHours.toFixed(1)}h`
                        : 'N/A'}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">Measured from complaint registration to closure.</p>
                  </div>
                </div>

                <div className="rounded-[2rem] bg-gradient-to-br from-[#edf7ff] via-[#f7fcff] to-[#eef9f7] p-6">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Highest completed concentration</p>
                  <h4 className="mt-3 font-heading text-3xl font-extrabold tracking-tight text-slate-900">
                    {resolutionInsights.busiestArea}
                  </h4>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    This area currently shows the highest number of resolved issues, which helps visitors understand where the platform has been most active.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[2.2rem] border-none bg-white/90 shadow-xl shadow-slate-200/20">
              <CardContent className="space-y-6 p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Resolved issue map</p>
                    <h4 className="mt-2 font-heading text-2xl font-extrabold tracking-tight text-slate-900">Area activity view</h4>
                  </div>
                  <div className="rounded-full bg-[#eef7ff] px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#4f7ca1]">
                    Map-style ranking
                  </div>
                </div>

                <div className="rounded-[2rem] bg-[#f7fbfd] p-5">
                  <div className="grid gap-4">
                    {resolutionInsights.topAreas.map((area, index) => {
                      const width = `${Math.max(28, (area.count / resolutionInsights.maxAreaCount) * 100)}%`;
                      return (
                        <div key={area.name} className="space-y-2">
                          <div className="flex items-center justify-between gap-4 text-sm">
                            <div className="flex items-center gap-3">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#dff1fb] text-[11px] font-black text-[#4d84a7]">
                                {index + 1}
                              </div>
                              <span className="font-semibold text-slate-800">{area.name}</span>
                            </div>
                            <span className="text-slate-500">{area.count} resolved</span>
                          </div>
                          <div className="h-3 overflow-hidden rounded-full bg-white">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#76b5da] to-[#98d7e5]"
                              style={{ width }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.6rem] bg-[#f5fbfa] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Coverage note</p>
                    <p className="mt-2 text-sm leading-7 text-slate-600">
                      Location counts are grouped by area name so the dashboard highlights where resolutions are strongest.
                    </p>
                  </div>
                  <div className="rounded-[1.6rem] bg-[#f5fbfa] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Response story</p>
                    <p className="mt-2 text-sm leading-7 text-slate-600">
                      Instead of showing every old incident, this section focuses on closure speed and regional impact.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </section>
    </div>
  );
}
