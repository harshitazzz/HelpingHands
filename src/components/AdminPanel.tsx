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
      // Try to delete from volunteers first
      await deleteDoc(doc(db, 'volunteers', id));
      
      // Try to delete from users as well (optional, might fail if not exists)
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="bg-green-100 p-3 rounded-xl">
            <ShieldCheck className="w-8 h-8 text-green-600" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight">System Administration</h2>
            <p className="text-sm text-muted-foreground">Authenticated as System Administrator</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={activeTab === 'requests' ? 'default' : 'outline'}
            onClick={() => setActiveTab('requests')}
            className="rounded-full"
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            Manage Requests
          </Button>
          <Button 
            variant={activeTab === 'unsolved' ? 'default' : 'outline'}
            onClick={() => setActiveTab('unsolved')}
            className="rounded-full"
          >
            <ShieldAlert className="w-4 h-4 mr-2" />
            Unsolved Issues
          </Button>
          <Button 
            variant={activeTab === 'volunteers' ? 'default' : 'outline'}
            onClick={() => setActiveTab('volunteers')}
            className="rounded-full"
          >
            <Users className="w-4 h-4 mr-2" />
            Manage Volunteers
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {activeTab === 'requests' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCcw className="w-5 h-5 text-primary" />
                  Emergency Requests Log
                </CardTitle>
                <CardDescription>Monitor and moderate all active help requests.</CardDescription>
              </div>
              <div className="flex gap-2">
                {(['all', 'today', 'week'] as const).map((f) => (
                  <Button
                    key={f}
                    variant={timeFilter === f ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTimeFilter(f)}
                    className="capitalize h-8 text-xs"
                  >
                    {f}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-4">
                  {filterByTime(requests).map((req) => (
                    <div key={req.id} className={`group p-4 border rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-between gap-4 ${selectedRequest?.id === req.id ? 'border-primary ring-1 ring-primary' : ''}`}>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge className={req.urgency === 'critical' ? 'bg-red-600' : 'bg-blue-500'}>
                            {req.urgency.toUpperCase()}
                          </Badge>
                          <h4 className="font-bold text-slate-900">{req.issue}</h4>
                        </div>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {req.location}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge variant="outline" className="text-[10px]">ID: {req.id.slice(0, 8)}</Badge>
                          <Badge variant="outline" className="text-[10px]">Status: {req.status}</Badge>
                          <Badge variant="outline" className="text-[10px]">Raised: {req.createdAt?.toDate().toLocaleDateString()}</Badge>
                          {req.assignedVolunteers && req.assignedVolunteers.length > 0 && (
                            <Badge variant="secondary" className="text-[10px] bg-green-50 text-green-700 border-green-100">
                              <Users className="w-3 h-3 mr-1" />
                              Assigned: {req.assignedVolunteers.length}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant={selectedRequest?.id === req.id ? 'default' : 'outline'}
                          size="sm" 
                          className={selectedRequest?.id === req.id ? '' : 'text-primary hover:bg-primary/5 border-primary/20'}
                          onClick={() => setSelectedRequest(selectedRequest?.id === req.id ? null : req)}
                          title="Select to manually assign"
                        >
                          <UserPlus className="w-4 h-4 mr-2" />
                          {selectedRequest?.id === req.id ? 'Selecting...' : 'Assign'}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-primary hover:bg-primary/5 border-primary/20"
                          onClick={() => handleAutoAssign(req)}
                          title="Trigger Auto-Assignment"
                        >
                          <RefreshCcw className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          onClick={() => handleDeleteRequest(req.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {requests.length === 0 && (
                    <div className="text-center py-12 text-slate-400">
                      <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p>No active emergency requests found in the database.</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {activeTab === 'unsolved' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-600" />
                Unsolved Issues (&gt; 1 Week)
              </CardTitle>
              <CardDescription>Critical issues that haven't been resolved within 7 days.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-4">
                  {requests.filter(r => {
                    if (!r.createdAt) return false;
                    const oneWeekAgo = new Date();
                    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                    return r.createdAt.toDate() < oneWeekAgo && r.status !== 'resolved';
                  }).map((req) => (
                    <div key={req.id} className="p-4 border-2 border-red-100 bg-red-50/30 rounded-xl flex items-center justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive">CRITICAL DELAY</Badge>
                          <h4 className="font-bold text-slate-900">{req.issue}</h4>
                        </div>
                        <p className="text-xs text-slate-600 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {req.location}
                        </p>
                        <p className="text-[10px] text-red-600 font-medium mt-1">
                          Raised on: {req.createdAt?.toDate().toLocaleString()}
                        </p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline" className="text-[10px] bg-white">ID: {req.id.slice(0, 8)}</Badge>
                          <Badge variant="outline" className="text-[10px] bg-white">Status: {req.status}</Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="bg-white border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => handleAutoAssign(req)}
                        >
                          <RefreshCcw className="w-4 h-4 mr-2" /> Re-trigger Matching
                        </Button>
                      </div>
                    </div>
                  ))}
                  {requests.filter(r => {
                    if (!r.createdAt) return false;
                    const oneWeekAgo = new Date();
                    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                    return r.createdAt.toDate() < oneWeekAgo && r.status !== 'resolved';
                  }).length === 0 && (
                    <div className="text-center py-12 text-slate-400">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500 opacity-50" />
                      <p>All recent issues are being handled within the 1-week window.</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {activeTab === 'volunteers' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Volunteer Registry
              </CardTitle>
              <CardDescription>
                {selectedRequest 
                  ? `Select a volunteer to assign to: ${selectedRequest.issue}` 
                  : "Manage registered volunteers and their availability."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-4">
                  {volunteers.map((v) => (
                    <div key={v.id} className={`p-4 border rounded-xl flex items-center justify-between gap-4 ${selectedRequest && v.availability === 'available' ? 'border-green-200 bg-green-50/20' : ''}`}>
                      <div className="flex items-center gap-4">
                        <div className="bg-slate-100 w-10 h-10 rounded-full flex items-center justify-center font-bold text-slate-600">
                          {v.name?.charAt(0)}
                        </div>
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-slate-900">{v.name}</h4>
                          <div className="flex flex-col gap-0.5">
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {v.location}
                            </p>
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                              <Mail className="w-3 h-3" /> {v.email}
                            </p>
                          </div>
                          <div className="flex gap-1 mt-1">
                            {v.skills?.slice(0, 3).map((s: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-[9px] py-0">{s}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={v.availability === 'available' ? 'default' : 'outline'} className="capitalize">
                            {v.availability}
                          </Badge>
                          {selectedRequest && v.availability === 'available' && (
                            <Button 
                              size="sm" 
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleManualAssign(v)}
                              disabled={isAssigning}
                            >
                              <UserPlus className="w-4 h-4 mr-2" />
                              Assign Now
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-blue-500 hover:bg-blue-50"
                            onClick={() => simulateEmail(v.email, "Manual check-in from Administrator", v.name)}
                            title="Send test/manual email"
                          >
                            <Mail className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-500 hover:bg-red-50"
                            onClick={() => handleRemoveVolunteer(v.id)}
                          >
                            <UserMinus className="w-4 h-4" />
                          </Button>
                        </div>
                    </div>
                  ))}
                  {volunteers.length === 0 && (
                    <div className="text-center py-12 text-slate-400">
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p>No registered volunteers found in the database.</p>
                      <p className="text-[10px] mt-1">New volunteers will appear here once they complete the signup form.</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
