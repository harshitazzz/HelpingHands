import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:geolocator/geolocator.dart';
import '../services/firebase_service.dart';
import '../services/geocoding_service.dart';
import '../theme/app_theme.dart';

class InvitationsScreen extends StatelessWidget {
  const InvitationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final firebase = Provider.of<FirebaseService>(context, listen: false);
    final user = FirebaseAuth.instance.currentUser;

    if (user == null) {
      return const Center(child: Text("Please sign in to view missions."));
    }

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: StreamBuilder<List<Map<String, dynamic>>>(
        stream: firebase.getInvitationsStream(user.uid),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          final dataList = snapshot.data ?? [];

          return CustomScrollView(
            slivers: [
              const SliverPadding(
                padding: EdgeInsets.only(top: 24, left: 16, right: 16, bottom: 24),
                sliver: SliverToBoxAdapter(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Active Missions",
                        style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
                      ),
                      SizedBox(height: 8),
                      Text(
                        "STRATEGIC FIELD DEPLOYMENT QUOTA",
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 2, color: Color(0xFF94A3B8)),
                      ),
                    ],
                  ),
                ),
              ),
              if (dataList.isEmpty)
                const SliverFillRemaining(
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.check_circle_outline, size: 64, color: AppTheme.primaryColor),
                        SizedBox(height: 16),
                        Text("Mission Board Clear", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                        Text("All assignations have been resolved.", style: const TextStyle(color: Color(0xFF64748B))),
                      ],
                    ),
                  ),
                )
              else
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final item = dataList[index];
                      return _InvitationCard(
                        id: item['id'],
                        requestId: item['requestId'],
                        createdAt: (item['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
                      );
                    },
                    childCount: dataList.length,
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _InvitationCard extends StatelessWidget {
  final String id;
  final String requestId;
  final DateTime createdAt;

  const _InvitationCard({required this.id, required this.requestId, required this.createdAt});

  Future<void> _handleNavigation(BuildContext context, Map<String, dynamic> request, String volunteerId) async {
    dynamic destinationVal = request['location'];
    if (destinationVal == null && request['gps'] != null) {
      destinationVal = request['gps'];
    }

    if (destinationVal == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Emergency location is not set.")),
      );
      return;
    }

    dynamic originVal;
    try {
      final firebaseService = Provider.of<FirebaseService>(context, listen: false);
      final volunteerData = await firebaseService.getVolunteerData(volunteerId);
      if (volunteerData != null && volunteerData['location'] != null) {
        originVal = volunteerData['location'];
      }
    } catch (e) {
      debugPrint("Error fetching volunteer location: $e");
    }

    if (originVal == null) {
      try {
        bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
        if (serviceEnabled) {
          LocationPermission permission = await Geolocator.checkPermission();
          if (permission == LocationPermission.denied) {
            permission = await Geolocator.requestPermission();
          }
          if (permission == LocationPermission.whileInUse || permission == LocationPermission.always) {
            final position = await Geolocator.getCurrentPosition(
              desiredAccuracy: LocationAccuracy.high,
              timeLimit: const Duration(seconds: 4),
            );
            originVal = {
              'latitude': position.latitude,
              'longitude': position.longitude,
            };
          }
        }
      } catch (e) {
        debugPrint("Error getting device location: $e");
      }
    }

    final String mapsUrl = GeocodingService.buildMapsUrl(destinationVal, origin: originVal);
    final Uri url = Uri.parse(mapsUrl);
    try {
      if (await canLaunchUrl(url)) {
        await launchUrl(url, mode: LaunchMode.externalApplication);
      } else {
        await launchUrl(url);
      }
    } catch (e) {
      debugPrint("Failed to launch maps: $e");
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Could not open Google Maps.")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>?>(
      future: Provider.of<FirebaseService>(context, listen: false).getRequest(requestId),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const SizedBox();
        final request = snapshot.data;
        if (request == null) return const SizedBox();

        return Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          padding: const EdgeInsets.all(24),
          decoration: AppTheme.glassDecoration,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Icon(Icons.emergency_outlined, color: AppTheme.primaryColor),
                  Text(
                    "${createdAt.day}/${createdAt.month}/${createdAt.year}",
                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF64748B)),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                request['issue'] ?? "Emergency Field Request",
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                   const Icon(Icons.location_on, size: 16, color: AppTheme.primaryColor),
                   const SizedBox(width: 4),
                   Text(
                     GeocodingService.getLocationDisplay(request['location']),
                     style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF64748B)),
                   ),
                ],
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () => _handleNavigation(context, request, FirebaseAuth.instance.currentUser?.uid ?? ''),
                icon: const Icon(Icons.navigation, size: 16),
                label: const Text("Navigate to User"),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF648197),
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 48),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => Provider.of<FirebaseService>(context, listen: false).respondToInvitation(id, 'accepted'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF0F172A),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text("Accept Mission", style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Provider.of<FirebaseService>(context, listen: false).respondToInvitation(id, 'rejected'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text("Decline", style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}
