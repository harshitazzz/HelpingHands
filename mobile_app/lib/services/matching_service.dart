import 'dart:math';
import 'package:flutter/foundation.dart';
import 'firebase_service.dart';
import 'api_service.dart';

class MatchingService {
  final FirebaseService _firebase;

  MatchingService(this._firebase);

  // Simple tokenizer and vectorizer matching the website's logic
  Map<String, int> _getVector(String text) {
    final words = text.toLowerCase().split(RegExp(r'[\s,]+')).where((w) => w.length > 1);
    final Map<String, int> vector = {};
    for (var word in words) {
      vector[word] = (vector[word] ?? 0) + 1;
    }
    return vector;
  }

  double _calculateCosineSimilarity(Map<String, int> vec1, Map<String, int> vec2) {
    final intersection = vec1.keys.where((key) => vec2.containsKey(key));
    
    double dotProduct = 0;
    for (var key in intersection) {
      dotProduct += vec1[key]! * vec2[key]!;
    }
    
    double mag1 = 0;
    for (var val in vec1.values) {
      mag1 += val * val;
    }
    mag1 = sqrt(mag1);
    
    double mag2 = 0;
    for (var val in vec2.values) {
      mag2 += val * val;
    }
    mag2 = sqrt(mag2);
    
    if (mag1 == 0 || mag2 == 0) return 0.0;
    return dotProduct / (mag1 * mag2);
  }

  Future<int> autoAssignVolunteers({
    required String requestId,
    required List<String> requiredSkills,
    required String location,
    String? issue,
    int volunteersNeeded = 1,
  }) async {
    debugPrint("[AutoAssign] Starting for Request: $requestId");

    final request = await _firebase.getRequest(requestId);
    if (request == null || request['status'] == 'resolved') {
      debugPrint("[AutoAssign] Request not found or already resolved.");
      return 0;
    }

    final assignedCount = (request['assignedVolunteers'] as List?)?.length ?? 0;
    final pendingCount = await _firebase.getPendingInvitationCount(requestId);
    final totalVolunteersNeeded = request['volunteers_needed'] ?? volunteersNeeded;

    final currentTotal = assignedCount + pendingCount;
    final neededCount = totalVolunteersNeeded - currentTotal;

    if (neededCount <= 0) {
      debugPrint("[AutoAssign] Already have enough volunteers ($currentTotal/$totalVolunteersNeeded)");
      return 0;
    }

    // 1. Get available volunteers
    final volunteers = await _firebase.getAvailableVolunteers();
    final notifiedVolunteers = List<String>.from(request['notifiedVolunteers'] ?? []);
    
    final candidates = volunteers.where((v) => !notifiedVolunteers.contains(v['uid'])).toList();

    debugPrint("[AutoAssign] Found ${candidates.length} potential candidates. Need $neededCount more.");

    if (candidates.isEmpty) return 0;

    // Prepare search text
    final searchText = [...requiredSkills, issue ?? ''].join(' ').toLowerCase();
    final reqVector = _getVector(searchText);

    // 2. Score and Rank
    final List<Map<String, dynamic>> matches = candidates.map((v) {
      final vLoc = (v['location'] ?? "").toString().toLowerCase();
      final rLoc = location.toLowerCase();
      final locationMatch = vLoc.contains(rLoc) || rLoc.contains(vLoc);

      final vSkillsText = List<String>.from(v['skills'] ?? []).join(' ').toLowerCase();
      final vVector = _getVector(vSkillsText);
      final similarity = _calculateCosineSimilarity(reqVector, vVector);

      double score = similarity;
      if (locationMatch) score += 0.5; // Strong location preference matching website

      return {...v, 'score': score};
    }).where((v) => v['score'] > 0.05 || (v['skills'] as List?)?.isEmpty == true).toList();

    matches.sort((a, b) => b['score'].compareTo(a['score']));

    if (matches.isEmpty) return 0;

    // 3. Invite the best matches
    final bestMatches = matches.take(neededCount).toList();
    debugPrint("[AutoAssign] Inviting ${bestMatches.length} best matches.");

    final List<String> newlyNotified = [];
    final baseUrl = "https://helpinghands-network.web.app"; // Assuming standard web URL for links

    for (var match in bestMatches) {
      final invitationId = await _firebase.createInvitation(
        requestId: requestId,
        volunteerId: match['uid'],
      );
      newlyNotified.add(match['uid']);

      // 4. Send Email Notification via Backend
      try {
        await ApiService.sendInvitation(
          email: match['email'] ?? "",
          name: match['name'] ?? "Volunteer",
          location: location,
          issue: issue ?? requiredSkills.join(', '),
          acceptLink: "$baseUrl?accept=$invitationId",
          rejectLink: "$baseUrl?reject=$invitationId",
        );
      } catch (e) {
        debugPrint("Failed to send email to ${match['name']}: $e");
      }
    }

    // 5. Update request notified list
    await _firebase.updateRequestNotified(requestId, newlyNotified);

    return bestMatches.length;
  }
}
