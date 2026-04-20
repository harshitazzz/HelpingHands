import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/firebase_service.dart';
import '../theme/app_theme.dart';

class HomeScreen extends StatelessWidget {
  final Function(String)? onNavigate;
  
  const HomeScreen({super.key, this.onNavigate});

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    final firebaseService = Provider.of<FirebaseService>(context, listen: false);

    return SingleChildScrollView(
      padding: const EdgeInsets.only(top: 24, left: 16, right: 16, bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Active Missions Section (For Volunteers)
          if (user != null)
            StreamBuilder<bool>(
              stream: firebaseService.isVolunteerStream(user.uid),
              builder: (context, volSnapshot) {
                if (volSnapshot.data == true) {
                  return StreamBuilder<List<Map<String, dynamic>>>(
                    stream: firebaseService.getAcceptedMissionsStream(user.uid),
                    builder: (context, missionSnapshot) {
                      final missions = missionSnapshot.data ?? [];
                      if (missions.isEmpty) return const SizedBox.shrink();

                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildSectionHeader("ACTIVE MISSIONS", "Assigned to you"),
                          const SizedBox(height: 12),
                          ...missions.map((m) => _buildMissionCard(context, m, user.uid)).toList(),
                          const SizedBox(height: 32),
                        ],
                      );
                    },
                  );
                }
                return const SizedBox.shrink();
              },
            ),

          // Tagline Section
          Text(
            "Quick Response,\nRight Help.",
            style: Theme.of(context).textTheme.displayLarge?.copyWith(
              fontSize: 36,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            "HelpingHands is your bridge to safe, coordinated, and effective aid.",
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              color: const Color(0xFF475569),
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 48),

          // Action Buttons
          _buildActionCard(
            context,
            "Raise Complaint",
            "Report an emergency or issue to get immediate AI coordination.",
            Icons.emergency_outlined,
            AppTheme.primaryColor,
            () => onNavigate?.call('assistant'),
          ),
          const SizedBox(height: 16),
          
          if (user != null)
            StreamBuilder<bool>(
              stream: firebaseService.isVolunteerStream(user.uid),
              builder: (context, snapshot) {
                final isVolunteer = snapshot.data ?? false;
                if (isVolunteer) return const SizedBox.shrink();
                
                return _buildActionCard(
                  context,
                  "Become a Volunteer",
                  "Join our ground force and help communities in need.",
                  Icons.volunteer_activism_outlined,
                  const Color(0xFF6EAED0),
                  () => onNavigate?.call('profile'),
                );
              },
            ),
          
          const SizedBox(height: 48),

          // Latest Emergencies Section
          _buildSectionHeader("LATEST EMERGENCIES", "Community Response Feed"),
          const SizedBox(height: 16),
          StreamBuilder<List<Map<String, dynamic>>>(
            stream: firebaseService.getActiveRequests(),
            builder: (context, snapshot) {
              final requests = snapshot.data ?? [];
              if (requests.isEmpty) {
                return _buildEmptyState("Community pulse is calm", "No unresolved emergencies showing right now.");
              }

              // Show latest 5
              final latest = requests.take(5).toList();
              return Column(
                children: latest.map((r) => _buildEmergencyFeedCard(context, r)).toList(),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title, String subtitle) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w900,
            letterSpacing: 2,
            color: Color(0xFF94A3B8),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          subtitle,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.bold,
            color: Color(0xFF64748B),
          ),
        ),
      ],
    );
  }

  Widget _buildMissionCard(BuildContext context, Map<String, dynamic> mission, String uid) {
    final firebaseService = Provider.of<FirebaseService>(context, listen: false);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(20),
      decoration: AppTheme.glassDecoration.copyWith(
        color: const Color(0xFFF0FDF4),
        border: Border.all(color: const Color(0xFFBBF7D0).withOpacity(0.5)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  mission['issue'] ?? 'Emergency',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Color(0xFF166534)),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.location_on, size: 14, color: AppTheme.primaryColor),
                    const SizedBox(width: 4),
                    Text(
                      mission['location'] ?? 'Unknown location',
                      style: const TextStyle(fontSize: 12, color: Color(0xFF3F6212)),
                    ),
                  ],
                ),
              ],
            ),
          ),
          ElevatedButton(
            onPressed: () => firebaseService.completeRequest(mission['id'], uid),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF22C55E),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.check_circle_outline, size: 16),
                SizedBox(width: 4),
                Text("COMPLETE", style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmergencyFeedCard(BuildContext context, Map<String, dynamic> request) {
    Color urgencyColor;
    switch (request['urgency']?.toString().toLowerCase()) {
      case 'critical': urgencyColor = AppTheme.destructiveColor; break;
      case 'high': urgencyColor = Colors.orange; break;
      default: urgencyColor = AppTheme.primaryColor;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: AppTheme.glassDecoration.copyWith(
        color: Colors.white.withOpacity(0.8),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: urgencyColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              (request['urgency'] ?? 'Low').toString().toUpperCase(),
              style: TextStyle(fontSize: 8, fontWeight: FontWeight.w900, color: urgencyColor, letterSpacing: 1),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  request['issue'] ?? 'Request',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: AppTheme.foregroundColor),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  request['location'] ?? 'Location not set',
                  style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, size: 16, color: Color(0xFFCBD5E1)),
        ],
      ),
    );
  }

  Widget _buildEmptyState(String title, String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.5),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withOpacity(0.5)),
      ),
      child: Column(
        children: [
          const Icon(Icons.check_circle_outline, size: 48, color: Color(0xFFBBF7D0)),
          const SizedBox(height: 16),
          Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF475569))),
          const SizedBox(height: 8),
          Text(message, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
        ],
      ),
    );
  }

  Widget _buildActionCard(
    BuildContext context,
    String title,
    String description,
    IconData icon,
    Color color,
    VoidCallback onTap,
  ) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: AppTheme.glassDecoration.copyWith(
          color: Colors.white.withOpacity(0.9),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Icon(icon, color: color, size: 32),
            ),
            const SizedBox(width: 20),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: AppTheme.foregroundColor,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xFF64748B),
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios, size: 16, color: Color(0xFF94A3B8)),
          ],
        ),
      ),
    );
  }
}
