import { db } from './firebase';
import { collection, query, where, getDocs, updateDoc, doc, arrayUnion, addDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import {
  extractLocationObject,
  getLocationDisplay,
  haversineDistance,
  LocationObject,
} from './geocoding';

// ── Volunteer type (location is now a structured object) ──────────────────────
export interface Volunteer {
  uid: string;
  name: string;
  skills: string[];
  location: LocationObject | string; // accept both for backward compat
  availability: string;
  email: string;
}

// ── Text vectorisation for cosine similarity ──────────────────────────────────
function getVector(text: string): Record<string, number> {
  const words = text.toLowerCase().split(/[\s,]+/).filter(w => w.length > 1);
  const vector: Record<string, number> = {};
  words.forEach(word => {
    vector[word] = (vector[word] || 0) + 1;
  });
  return vector;
}

function calculateCosineSimilarity(
  vec1: Record<string, number>,
  vec2: Record<string, number>
): number {
  const intersection = Object.keys(vec1).filter(key => key in vec2);
  let dotProduct = 0;
  intersection.forEach(key => { dotProduct += vec1[key] * vec2[key]; });
  let mag1 = 0;
  Object.values(vec1).forEach(val => (mag1 += val * val));
  mag1 = Math.sqrt(mag1);
  let mag2 = 0;
  Object.values(vec2).forEach(val => (mag2 += val * val));
  mag2 = Math.sqrt(mag2);
  if (mag1 === 0 || mag2 === 0) return 0;
  return dotProduct / (mag1 * mag2);
}

// ── Distance bonus using Haversine formula ────────────────────────────────────
function distanceBonus(
  volunteerLoc: LocationObject | string | null | undefined,
  requestLoc: LocationObject | string | null | undefined
): number {
  const vLoc = extractLocationObject(volunteerLoc);
  const rLoc = extractLocationObject(requestLoc);

  if (
    vLoc.latitude !== null && vLoc.longitude !== null &&
    rLoc.latitude !== null && rLoc.longitude !== null
  ) {
    const dist = haversineDistance(vLoc.latitude, vLoc.longitude, rLoc.latitude, rLoc.longitude);
    console.log(`[DISTANCE] Volunteer "${vLoc.address}" → Request "${rLoc.address}": ${dist.toFixed(1)} km`);
    if (dist < 10)  return 0.5;
    if (dist < 25)  return 0.3;
    if (dist < 50)  return 0.1;
    return 0;
  }

  // Fallback: text-based match when coords unavailable
  const vAddr = getLocationDisplay(volunteerLoc).toLowerCase();
  const rAddr = getLocationDisplay(requestLoc).toLowerCase();
  if (vAddr !== 'unknown' && rAddr !== 'unknown' &&
      (vAddr.includes(rAddr) || rAddr.includes(vAddr))) {
    return 0.2;
  }
  return 0;
}

// ── findMatches (used in Dashboard admin panel) ───────────────────────────────
export async function findMatches(
  requestId: string,
  requiredSkills: string[],
  location: LocationObject | string
) {
  const volunteersRef = collection(db, 'volunteers');
  const q = query(volunteersRef, where('availability', '==', 'available'));
  const querySnapshot = await getDocs(q);

  const volunteers: Volunteer[] = [];
  querySnapshot.forEach((d) => {
    volunteers.push({ uid: d.id, ...d.data() } as Volunteer);
  });

  const reqSkillsText = requiredSkills.join(' ');
  const reqVector = getVector(reqSkillsText);

  const scoredVolunteers = volunteers.map(v => {
    const vSkillsText = v.skills.join(' ');
    const vVector = getVector(vSkillsText);
    const similarity = calculateCosineSimilarity(reqVector, vVector);
    let score = Math.round(similarity * 100);

    // Coordinate-based distance bonus
    score += Math.round(distanceBonus(v.location, location) * 100);

    const matchingSkills = v.skills.filter(skill =>
      requiredSkills.some(req =>
        req.toLowerCase().includes(skill.toLowerCase()) ||
        skill.toLowerCase().includes(req.toLowerCase())
      )
    );

    return { ...v, score, matchingSkills };
  });

  return scoredVolunteers.sort((a, b) => b.score - a.score);
}

// ── autoAssignVolunteers ──────────────────────────────────────────────────────
export async function autoAssignVolunteers(
  requestId: string,
  requiredSkills: string[],
  location: LocationObject | string,
  issue?: string
) {
  const locationDisplay = getLocationDisplay(location);
  console.log(`[AutoAssign] Starting for Request: ${requestId}`, { requiredSkills, location: locationDisplay, issue });

  const requestRef = doc(db, 'requests', requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) return 0;
  const requestData = requestSnap.data();

  if (requestData.status === 'resolved') {
    console.log(`[AutoAssign] Request ${requestId} is already resolved. Skipping.`);
    return 0;
  }

  const volunteersNeeded = requestData.volunteers_needed || 1;
  const assignedVolunteers = requestData.assignedVolunteers || [];
  const notifiedVolunteers = requestData.notifiedVolunteers || [];

  const invQuery = query(
    collection(db, 'invitations'),
    where('requestId', '==', requestId),
    where('status', '==', 'pending')
  );
  const invSnapshot = await getDocs(invQuery);
  const pendingCount = invSnapshot.size;

  const currentTotal = assignedVolunteers.length + pendingCount;
  const neededCount = volunteersNeeded - currentTotal;

  if (neededCount <= 0) {
    console.log(`[AutoAssign] Already have enough volunteers (${currentTotal}/${volunteersNeeded})`);
    return 0;
  }

  const volunteersRef = collection(db, 'volunteers');
  const q = query(volunteersRef, where('availability', '==', 'available'));
  const querySnapshot = await getDocs(q);

  const volunteers: Volunteer[] = [];
  querySnapshot.forEach((d) => {
    const vData = d.data() as Volunteer;
    if (!notifiedVolunteers.includes(d.id)) {
      volunteers.push({ uid: d.id, ...vData });
    }
  });

  console.log(`[MATCHING_STARTED] Found ${volunteers.length} available volunteers. Need ${neededCount} more.`);

  if (volunteers.length === 0) {
    console.log(`[AutoAssign] No more volunteers available for request ${requestId}`);
    if (currentTotal === 0) {
      await updateDoc(requestRef, { noVolunteersAvailable: true, lastMatchAttemptAt: serverTimestamp() });
      toast.info('No volunteers available at this moment. We will connect to you soon.');
    }
    return 0;
  }

  // 2. Score volunteers
  const searchText = [...requiredSkills, issue || ''].join(' ').toLowerCase();
  const reqVector = getVector(searchText);

  // Use the stored location object from the request itself if richer than what was passed
  const requestLocation = extractLocationObject(requestData.location || location);

  const matches = volunteers.map(v => {
    const bonus = distanceBonus(v.location, requestLocation);
    console.log(`[MATCH_SCORE] Volunteer ${v.name} — distance bonus: ${bonus}`);

    const vSkillsText = v.skills.join(' ').toLowerCase();
    const vVector = getVector(vSkillsText);
    const similarity = calculateCosineSimilarity(reqVector, vVector);

    const score = similarity + bonus;
    console.log(`[MATCH_SCORE] Volunteer ${v.name} — skill similarity: ${similarity.toFixed(3)}, total: ${score.toFixed(3)}`);
    return { ...v, score };
  })
  .filter(v => v.score > 0.05 || v.skills.length === 0)
  .sort((a, b) => b.score - a.score);

  if (matches.length === 0) {
    console.log(`[AutoAssign] No suitable matches for request ${requestId}`);
    if (currentTotal === 0) {
      await updateDoc(requestRef, { noVolunteersAvailable: true, lastMatchAttemptAt: serverTimestamp() });
      toast.info('No volunteers match the requirements at this moment. We will connect to you soon.');
    }
    return 0;
  }

  const bestMatches = matches.slice(0, neededCount);
  console.log(`[AutoAssign] Inviting ${bestMatches.length} best matches.`);

  const baseUrl = window.location.origin;
  const newlyNotified: string[] = [];

  for (const bestMatch of bestMatches) {
    const invitationId = await assignVolunteer(requestId, bestMatch.uid);
    newlyNotified.push(bestMatch.uid);
    console.log(`[INVITATION_CREATED] Invitation ${invitationId} for volunteer ${bestMatch.uid}`);

    const acceptLink = `${baseUrl}?accept=${invitationId}`;
    const rejectLink = `${baseUrl}?reject=${invitationId}`;

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiUrl}/api/send-invitation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: bestMatch.email,
          name: bestMatch.name,
          location: locationDisplay,
          issue: issue || requiredSkills.join(', '),
          acceptLink,
          rejectLink,
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error('[EMAIL] Failed:', response.status, errText);
      } else {
        console.log(`[EMAIL_SENT] Invitation email sent to ${bestMatch.email}`);
        toast.success(`Invitation sent to ${bestMatch.name}`);
      }
    } catch (error) {
      console.error('[EMAIL] Error sending invitation:', error);
    }
  }

  await updateDoc(requestRef, {
    notifiedVolunteers: arrayUnion(...newlyNotified),
    lastInvitationSentAt: serverTimestamp(),
    noVolunteersAvailable: false,
  });

  return bestMatches.length;
}

// ── assignVolunteer ───────────────────────────────────────────────────────────
export async function assignVolunteer(requestId: string, volunteerId: string) {
  const invitationsRef = collection(db, 'invitations');
  const docRef = await addDoc(invitationsRef, {
    requestId,
    volunteerId,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// ── respondToInvitation ───────────────────────────────────────────────────────
export async function respondToInvitation(
  invitationId: string,
  status: 'accepted' | 'rejected'
) {
  const invRef = doc(db, 'invitations', invitationId);
  const invSnap = await getDoc(invRef);
  if (!invSnap.exists()) return;
  const invData = invSnap.data();

  await updateDoc(invRef, { status });

  if (status === 'accepted') {
    const requestRef = doc(db, 'requests', invData.requestId);
    const requestSnap = await getDoc(requestRef);
    if (requestSnap.exists() && requestSnap.data().status === 'resolved') {
      toast.error('This mission has already been resolved. Thank you anyway!');
      await updateDoc(invRef, { status: 'expired' });
      return;
    }

    await updateDoc(requestRef, {
      assignedVolunteers: arrayUnion(invData.volunteerId),
      status: 'assigned',
    });

    const volunteerRef = doc(db, 'volunteers', invData.volunteerId);
    await updateDoc(volunteerRef, { availability: 'busy' });

    const userRef = doc(db, 'users', invData.volunteerId);
    await updateDoc(userRef, { availability: 'busy' }).catch(() => {});
  } else if (status === 'rejected') {
    const requestRef = doc(db, 'requests', invData.requestId);
    const requestSnap = await getDoc(requestRef);
    if (requestSnap.exists()) {
      const requestData = requestSnap.data();
      if (requestData.status !== 'resolved') {
        await autoAssignVolunteers(
          invData.requestId,
          requestData.required_skills || [],
          requestData.location,
          requestData.issue
        );
      }
    }
  }
}

// ── completeRequest ───────────────────────────────────────────────────────────
export async function completeRequest(requestId: string, volunteerId: string) {
  const requestRef = doc(db, 'requests', requestId);
  const requestSnap = await getDoc(requestRef);

  await updateDoc(requestRef, { status: 'resolved', resolvedAt: serverTimestamp() });

  // Expire pending invitations
  const invQuery = query(
    collection(db, 'invitations'),
    where('requestId', '==', requestId),
    where('status', '==', 'pending')
  );
  const invSnapshot = await getDocs(invQuery);
  for (const invDoc of invSnapshot.docs) {
    await updateDoc(doc(db, 'invitations', invDoc.id), { status: 'expired' });
  }

  // Release all assigned volunteers
  if (requestSnap.exists()) {
    const data = requestSnap.data();
    const assigned = data.assignedVolunteers || [];
    const allToRelease = Array.from(new Set([...assigned, volunteerId]));

    for (const vId of allToRelease) {
      const volunteerRef = doc(db, 'volunteers', vId);
      await updateDoc(volunteerRef, { availability: 'available' }).catch(err =>
        console.error(`Failed to release volunteer ${vId}:`, err)
      );
      const userRef = doc(db, 'users', vId);
      await updateDoc(userRef, { availability: 'available' }).catch(() => {});
    }
  }
}