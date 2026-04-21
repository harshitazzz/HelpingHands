import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:google_sign_in/google_sign_in.dart';

class FirebaseService {
  FirebaseFirestore? _dbInstance;
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final GoogleSignIn _googleSignIn = GoogleSignIn();

  FirebaseFirestore get _db {
    _dbInstance ??= FirebaseFirestore.instanceFor(
      app: Firebase.app(),
      databaseId: 'ai-studio-a415bb55-7a9e-44a8-b3b8-3abc22d2b488',
    );
    return _dbInstance!;
  }

  // Auth Streams
  Stream<User?> get userStream => _auth.authStateChanges();

  // Requests
  Stream<List<Map<String, dynamic>>> getActiveRequests() {
    return _db
        .collection('requests')
        .where('status', isNotEqualTo: 'resolved')
        .snapshots()
        .map((snapshot) => snapshot.docs.map((doc) => {'id': doc.id, ...doc.data()}).toList());
  }

  // Real-time Dashboard Metrics
  Stream<int> getOpenRequestCount() {
    return _db
        .collection('requests')
        .where('status', isNotEqualTo: 'resolved')
        .snapshots()
        .map((snapshot) => snapshot.docs.length);
  }

  Stream<int> getCriticalRequestCount() {
    return _db
        .collection('requests')
        .where('status', isNotEqualTo: 'resolved')
        .where('urgency', isEqualTo: 'critical')
        .snapshots()
        .map((snapshot) => snapshot.docs.length);
  }

  Stream<int> getResolvedRequestCount() {
    return _db
        .collection('requests')
        .where('status', whereIn: ['resolved', 'completed'])
        .snapshots()
        .map((snapshot) => snapshot.docs.length);
  }

  // Invitations for a specific volunteer
  Stream<List<Map<String, dynamic>>> getInvitationsStream(String volunteerId) {
    return _db
        .collection('invitations')
        .where('volunteerId', isEqualTo: volunteerId)
        .where('status', isEqualTo: 'pending')
        .snapshots()
        .map((snapshot) => snapshot.docs.map((doc) => {'id': doc.id, ...doc.data()}).toList());
  }

  Future<Map<String, dynamic>?> getRequest(String requestId) async {
    final doc = await _db.collection('requests').doc(requestId).get();
    return doc.data();
  }

  // Volunteer check
  Future<bool> isVolunteer(String uid) async {
    final doc = await _db.collection('volunteers').doc(uid).get();
    return doc.exists;
  }

  Stream<bool> isVolunteerStream(String uid) {
    return _db.collection('volunteers').doc(uid).snapshots().map((doc) => doc.exists);
  }

  // User Profile
  Future<void> updateUserData(String uid, Map<String, dynamic> data) async {
    await _db.collection('users').doc(uid).set(data, SetOptions(merge: true));
    
    // Update Firebase Auth display name if provided
    if (data.containsKey('name')) {
      await _auth.currentUser?.updateDisplayName(data['name']);
    }
  }

  Future<Map<String, dynamic>?> getUserData(String uid) async {
    final doc = await _db.collection('users').doc(uid).get();
    return doc.data();
  }

  // Volunteer Management
  Future<void> registerVolunteer(String uid, Map<String, dynamic> data) async {
    await _db.collection('volunteers').doc(uid).set({
      ...data,
      'uid': uid,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
    
    // Update user role
    await updateUserData(uid, {'role': 'volunteer'});
  }

  Future<void> removeVolunteer(String uid) async {
    await _db.collection('volunteers').doc(uid).delete();
    await updateUserData(uid, {'role': 'user'});
  }

  Future<Map<String, dynamic>?> getVolunteerData(String uid) async {
    final doc = await _db.collection('volunteers').doc(uid).get();
    return doc.data();
  }

  // Accepted Missions for a specific volunteer
  Stream<List<Map<String, dynamic>>> getAcceptedMissionsStream(String uid) {
    return _db
        .collection('requests')
        .where('assignedVolunteers', arrayContains: uid)
        .where('status', whereIn: ['assigned', 'ongoing', 'in-progress']) 
        .snapshots()
        .map((snapshot) => snapshot.docs.map((doc) => {'id': doc.id, ...doc.data()}).toList());
  }

  // Complete a request
  Future<void> completeRequest(String requestId, String volunteerId) async {
    await _db.collection('requests').doc(requestId).update({
      'status': 'completed',
      'resolvedAt': FieldValue.serverTimestamp(),
      'completedBy': volunteerId,
    });
  }

  // Invitation Management
  Future<void> respondToInvitation(String invitationId, String status) async {
    final invRef = _db.collection('invitations').doc(invitationId);
    final invDoc = await invRef.get();
    
    if (!invDoc.exists) return;
    
    final data = invDoc.data()!;
    final requestId = data['requestId'];
    final volunteerId = data['volunteerId'];

    await _db.runTransaction((transaction) async {
      // Update invitation status
      transaction.update(invRef, {'status': status});

      if (status == 'accepted') {
        // Add volunteer to request
        final reqRef = _db.collection('requests').doc(requestId);
        transaction.update(reqRef, {
          'assignedVolunteers': FieldValue.arrayUnion([volunteerId]),
          'status': 'assigned'
        });
      }
    });
  }

  // Authentication logic
  Future<UserCredential> signInWithGoogle() async {
    try {
      UserCredential userCredential;

      if (kIsWeb) {
        // Web: Use Firebase Auth's built-in popup — no People API needed
        final provider = GoogleAuthProvider()
          ..addScope('email')
          ..addScope('profile');
        userCredential = await _auth.signInWithPopup(provider);
      } else {
        // Mobile: Use google_sign_in package for native flow
        final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
        if (googleUser == null) throw Exception("Sign-in cancelled");

        final GoogleSignInAuthentication googleAuth = await googleUser.authentication;
        final credential = GoogleAuthProvider.credential(
          accessToken: googleAuth.accessToken,
          idToken: googleAuth.idToken,
        );
        userCredential = await _auth.signInWithCredential(credential);
      }

      final user = userCredential.user;
      if (user != null) {
        // Preserve existing role if user already exists
        final existingData = await getUserData(user.uid);
        await updateUserData(user.uid, {
          'name': user.displayName ?? 'Google User',
          'email': user.email ?? '',
          'lastLogin': FieldValue.serverTimestamp(),
          'role': existingData?['role'] ?? 'user',
          if (existingData == null) 'createdAt': FieldValue.serverTimestamp(),
        });
      }

      return userCredential;
    } catch (e) {
      print("Google Sign-In Error: $e");
      rethrow;
    }
  }

  Future<UserCredential> signInWithEmail(String email, String password) async {
    print("Attempting sign in: $email");
    try {
      final cred = await _auth.signInWithEmailAndPassword(email: email, password: password);
      print("Sign in successful: ${cred.user?.uid}");
      return cred;
    } catch (e) {
      print("Sign in failed error: $e");
      rethrow;
    }
  }

  Future<UserCredential> signUpWithEmail(String email, String password, String name) async {
    print("Attempting sign up: $email");
    try {
      final credential = await _auth.createUserWithEmailAndPassword(email: email, password: password);
      
      // Update profile
      await credential.user?.updateDisplayName(name);
      
      // Create user doc in Firestore
      await updateUserData(credential.user!.uid, {
        'name': name,
        'email': email,
        'role': 'user',
        'createdAt': FieldValue.serverTimestamp(),
      });
      
      print("Sign up successful: ${credential.user?.uid}");
      return credential;
    } catch (e) {
      print("Sign up failed error: $e");
      rethrow;
    }
  }

  // Account Deletion
  Future<void> deleteAccount(String uid) async {
    final batch = _db.batch();
    batch.delete(_db.collection('users').doc(uid));
    batch.delete(_db.collection('volunteers').doc(uid));
    
    // Note: In a real app, you might also want to delete requests/invitations 
    // but we'll follow the essential cleanup logic for now.
    
    await batch.commit();
    await _auth.currentUser?.delete();
    await signOut();
  }

  // Sign out
  Future<void> signOut() async {
    await _auth.signOut();
  }

  // --- Matching Engine Helpers ---

  Future<String> createRequest(Map<String, dynamic> data) async {
    final docRef = await _db.collection('requests').add({
      ...data,
      'createdAt': FieldValue.serverTimestamp(),
      'status': 'pending',
      'assignedVolunteers': [],
      'notifiedVolunteers': [],
    });
    return docRef.id;
  }

  Future<List<Map<String, dynamic>>> getAvailableVolunteers() async {
    final snapshot = await _db
        .collection('volunteers')
        .where('availability', isEqualTo: 'available')
        .get();
    return snapshot.docs.map((doc) => {'uid': doc.id, ...doc.data()}).toList();
  }

  Future<String> createInvitation({required String requestId, required String volunteerId}) async {
    final docRef = await _db.collection('invitations').add({
      'requestId': requestId,
      'volunteerId': volunteerId,
      'status': 'pending',
      'createdAt': FieldValue.serverTimestamp(),
    });
    return docRef.id;
  }

  Future<int> getPendingInvitationCount(String requestId) async {
    final snapshot = await _db
        .collection('invitations')
        .where('requestId', isEqualTo: requestId)
        .where('status', isEqualTo: 'pending')
        .get();
    return snapshot.size;
  }

  Future<void> updateRequestNotified(String requestId, List<String> newlyNotified) async {
    await _db.collection('requests').doc(requestId).update({
      'notifiedVolunteers': FieldValue.arrayUnion(newlyNotified),
      'lastInvitationSentAt': FieldValue.serverTimestamp(),
    });
  }
}
