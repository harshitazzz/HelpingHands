const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const { Resend } = require("resend");
require("dotenv").config();

// Initialize Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("[Firebase] Admin initialized via environment variable.");
  } catch (error) {
    console.error("[Firebase] Error parsing FIREBASE_SERVICE_ACCOUNT:", error);
  }
} else {
  console.warn("[Firebase] FIREBASE_SERVICE_ACCOUNT environment variable not found. Firestore features will fail in production.");
}

const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // Enable CORS for all origins
app.use(express.json());

/**
 * Health check route
 */
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

/**
 * API Route for sending email invitations
 */
app.post("/api/send-invitation", async (req, res) => {
  const { email, name, location, issue, acceptLink, rejectLink } = req.body;
  const resendApiKey = process.env.RESEND_API_KEY;

  console.log(`[Notification API] Request to notify: ${email}`);
  
  let emailSent = false;
  if (resendApiKey && resendApiKey.trim() !== "") {
    try {
      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: "onboarding@resend.dev",
        to: email,
        subject: `🚨 Emergency Mission Invitation: ${location}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2 style="color: #ef4444;">Emergency Mission Invitation</h2>
            <p>Hi ${name},</p>
            <p>You have been invited to an emergency mission in <strong>${location}</strong>.</p>
            <p><strong>Issue:</strong> ${issue}</p>
            <p>Please respond using the links below:</p>
            <p>
              <a href="${acceptLink}" style="color: #16a34a; font-weight: bold;">[ACCEPT MISSION]</a>
              &nbsp;&nbsp;&nbsp;
              <a href="${rejectLink}" style="color: #dc2626; font-weight: bold;">[DECLINE]</a>
            </p>
            <p style="font-size: 12px; color: #64748b; margin-top: 20px;">Sent via Beacon Emergency Response System.</p>
          </div>
        `,
      });
      emailSent = true;
      console.log(`[Notification API] Email sent to ${email}`);
    } catch (error) {
      console.error("[Notification API] Email error:", error);
    }
  } else {
    console.warn("[Notification API] RESEND_API_KEY missing. Email simulated.");
  }

  res.status(200).json({ 
    success: true, 
    emailSent, 
    message: "Notification processed" 
  });
});

/**
 * Background task to check for stale invitations
 */
async function checkStaleInvitations() {
  console.log("[Background Task] Checking for stale invitations...");
  try {
    const fiveHoursAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 5 * 60 * 60 * 1000));
    
    const snapshot = await db.collection("invitations")
      .where("status", "==", "pending")
      .where("createdAt", "<=", fiveHoursAgo)
      .get();
      
    console.log(`[Background Task] Found ${snapshot.size} stale invitations.`);
    
    const requestsToEscalate = new Set();
    const batch = db.batch();
    
    snapshot.docs.forEach(invDoc => {
      const invData = invDoc.data();
      console.log(`[Background Task] Expiring invitation ${invDoc.id} for request ${invData.requestId}`);
      batch.update(invDoc.ref, { status: "expired" });
      requestsToEscalate.add(invData.requestId);
    });
    
    await batch.commit();

    for (const requestId of requestsToEscalate) {
      await triggerNextMatch(requestId);
    }
  } catch (error) {
    console.error("[Background Task] Error checking stale invitations:", error);
  }
}

async function triggerNextMatch(requestId) {
  try {
    const reqRef = db.collection("requests").doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) return;
    
    const reqData = reqSnap.data();

    if (reqData.status === "resolved") {
      console.log(`[Background Task] Request ${requestId} is already resolved. Skipping escalation.`);
      return;
    }

    const volunteersNeeded = reqData.volunteers_needed || 1;
    const assignedVolunteers = reqData.assignedVolunteers || [];
    const notifiedVolunteers = reqData.notifiedVolunteers || [];

    const invSnapshot = await db.collection("invitations")
      .where("requestId", "==", requestId)
      .where("status", "==", "pending")
      .get();
    const pendingCount = invSnapshot.size;

    const currentTotal = assignedVolunteers.length + pendingCount;
    const neededCount = volunteersNeeded - currentTotal;

    if (neededCount <= 0) {
      console.log(`[Background Task] Request ${requestId} already has enough volunteers (${currentTotal}/${volunteersNeeded})`);
      return;
    }
    
    const vSnapshot = await db.collection("volunteers")
      .where("availability", "==", "available")
      .get();
    
    const availableVolunteers = [];
    vSnapshot.forEach(d => {
      if (!notifiedVolunteers.includes(d.id)) {
        availableVolunteers.push({ uid: d.id, ...d.data() });
      }
    });
    
    if (availableVolunteers.length === 0) {
      if (currentTotal === 0) {
        await reqRef.update({ noVolunteersAvailable: true });
      }
      return;
    }
    
    const bestMatches = availableVolunteers.slice(0, neededCount);
    const newlyNotified = [];

    for (const bestMatch of bestMatches) {
      const newInvRef = await db.collection("invitations").add({
        requestId,
        volunteerId: bestMatch.uid,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      newlyNotified.push(bestMatch.uid);
      
      console.log(`[Background Task] New invitation created: ${newInvRef.id} for volunteer ${bestMatch.email}`);
    }
    
    await reqRef.update({
      notifiedVolunteers: admin.firestore.FieldValue.arrayUnion(...newlyNotified),
      lastInvitationSentAt: admin.firestore.FieldValue.serverTimestamp(),
      noVolunteersAvailable: false
    });
    
  } catch (error) {
    console.error(`[Background Task] Error triggering next match for ${requestId}:`, error);
  }
}

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  
  // Start background task
  setInterval(checkStaleInvitations, 10 * 60 * 1000); // Every 10 minutes
  console.log("[Background Task] Stale invitation checker started.");
});
