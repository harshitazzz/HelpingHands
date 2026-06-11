import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'firebase_service.dart';
import 'api_service.dart';
import 'geocoding_service.dart';

class MatchingService {
  final FirebaseService _firebase;

  MatchingService(this._firebase);

  // ── Text vectoriser (cosine similarity) ────────────────────────────────────
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
    mag1 = math.sqrt(mag1);

    double mag2 = 0;
    for (var val in vec2.values) {
      mag2 += val * val;
    }
    mag2 = math.sqrt(mag2);

    if (mag1 == 0 || mag2 == 0) return 0.0;
    return dotProduct / (mag1 * mag2);
  }

  // ── Main auto-assign entry point ───────────────────────────────────────────
  Future<int> autoAssignVolunteers({
    required String requestId,
    required List<String> requiredSkills,
    required dynamic location, // LocationObject | String
    String? issue,
    int volunteersNeeded = 1,
  }) async {
    final locationDisplay = GeocodingService.getLocationDisplay(location);
    debugPrint("[MATCHING_STARTED] Request: $requestId | location: $locationDisplay");

    final request = await _firebase.getRequest(requestId);
    if (request == null || request['status'] == 'resolved') {
      debugPrint("[AutoAssign] Request not found or already resolved.");
      return 0;
    }

    final assignedCount = (request['assignedVolunteers'] as List?)?.length ?? 0;
    final pendingCount = await _firebase.getPendingInvitationCount(requestId);

    final dbVolunteersNeeded = request['volunteers_needed'];
    int totalVolunteersNeeded = 1;
    if (dbVolunteersNeeded is num && dbVolunteersNeeded > 0) {
      totalVolunteersNeeded = dbVolunteersNeeded.toInt();
    } else if (volunteersNeeded > 0) {
      totalVolunteersNeeded = volunteersNeeded;
    }

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

    debugPrint("[AVAILABLE_VOLUNTEERS_FOUND] ${candidates.length} candidates. Need $neededCount more.");

    if (candidates.isEmpty) return 0;

    // Use the stored location from the request doc if richer
    final requestLocation = GeocodingService.extractLocationObject(request['location'] ?? location);

    // Prepare skill text
    final searchText = [...requiredSkills, issue ?? ''].join(' ').toLowerCase();
    final reqVector = _getVector(searchText);

    // 2. Score and rank
    final List<Map<String, dynamic>> matches = candidates.map((v) {
      final bonus = GeocodingService.distanceBonus(v['location'], requestLocation);

      final vSkillsText = List<String>.from(v['skills'] ?? []).join(' ').toLowerCase();
      final vVector = _getVector(vSkillsText);
      final similarity = _calculateCosineSimilarity(reqVector, vVector);

      final score = similarity + bonus;
      debugPrint("[MATCH_SCORE] Volunteer ${v['name']} — similarity: ${similarity.toStringAsFixed(3)}, distance bonus: $bonus, total: ${score.toStringAsFixed(3)}");
      return {...v, 'score': score};
    }).where((v) => (v['score'] as double) > 0.05 || (v['skills'] as List?)?.isEmpty == true).toList();

    matches.sort((a, b) => (b['score'] as double).compareTo(a['score'] as double));

    if (matches.isEmpty) return 0;

    // 3. Invite best matches
    final bestMatches = matches.take(neededCount).toList();
    debugPrint("[AutoAssign] Inviting ${bestMatches.length} best matches.");

    final List<String> newlyNotified = [];
    final frontendUrl = dotenv.env['FRONTEND_URL'] ?? "https://helpinghands-network.web.app";

    for (var match in bestMatches) {
      final invitationId = await _firebase.createInvitation(
        requestId: requestId,
        volunteerId: match['uid'],
      );
      newlyNotified.add(match['uid'] as String);
      debugPrint("[INVITATION_CREATED] $invitationId for ${match['name']}");

      // 4. Send email notification via backend
      try {
        await ApiService.sendInvitation(
          email: match['email'] ?? "",
          name: match['name'] ?? "Volunteer",
          location: locationDisplay,
          issue: issue ?? requiredSkills.join(', '),
          acceptLink: "$frontendUrl?accept=$invitationId",
          rejectLink: "$frontendUrl?reject=$invitationId",
        );
        debugPrint("[EMAIL_SENT] Invitation sent to ${match['email']}");
      } catch (e) {
        debugPrint("[EMAIL] Failed to send to ${match['name']}: $e");
      }
    }

    // 5. Update request notified list
    await _firebase.updateRequestNotified(requestId, newlyNotified);

    return bestMatches.length;
  }
}
