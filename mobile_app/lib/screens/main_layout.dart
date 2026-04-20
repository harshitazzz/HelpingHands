import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'home_screen.dart';
import 'assistant_screen.dart';
import 'prediction_screen.dart';
import 'invitations_screen.dart';
import 'profile_screen.dart';
import 'package:provider/provider.dart';
import '../services/firebase_service.dart';
import '../theme/app_theme.dart';

class MainLayout extends StatefulWidget {
  const MainLayout({super.key});

  @override
  State<MainLayout> createState() => _MainLayoutState();
}

class _MainLayoutState extends State<MainLayout> {
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    final firebaseService = Provider.of<FirebaseService>(context, listen: false);

    return StreamBuilder<bool>(
      stream: user != null ? firebaseService.isVolunteerStream(user.uid) : Stream.value(false),
      builder: (context, snapshot) {
        final isVolunteer = snapshot.data ?? false;

        // Define available tabs based on volunteer status
        final List<Map<String, dynamic>> tabs = [
          {
            'screen': HomeScreen(onNavigate: (tabName) {
              if (tabName == 'assistant') setState(() => _currentIndex = 1);
              if (tabName == 'profile') setState(() => _currentIndex = isVolunteer ? 4 : 3);
            }),
            'label': 'Home',
            'icon': Icons.dashboard_outlined,
            'activeIcon': Icons.dashboard,
          },
          {
            'screen': const AssistantScreen(),
            'label': 'Assistant',
            'icon': Icons.chat_bubble_outline,
            'activeIcon': Icons.chat_bubble,
          },
          {
            'screen': const PredictionScreen(),
            'label': 'Predict',
            'icon': Icons.psychology_outlined,
            'activeIcon': Icons.psychology,
          },
          if (isVolunteer)
            {
              'screen': const InvitationsScreen(),
              'label': 'Alerts',
              'icon': Icons.notifications_none,
              'activeIcon': Icons.notifications,
            },
          {
            'screen': const ProfileScreen(),
            'label': 'Profile',
            'icon': Icons.person_outline,
            'activeIcon': Icons.person,
          },
        ];

        // Ensure current index is valid after tab change
        if (_currentIndex >= tabs.length) {
          _currentIndex = tabs.length - 1;
        }

        return Scaffold(
          appBar: PreferredSize(
            preferredSize: const Size.fromHeight(100),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.04),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
                border: Border(
                  bottom: BorderSide(
                    color: const Color(0xFFE2E8F0),
                    width: 1,
                  ),
                ),
              ),
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    children: [
                      // Logo Section
                      Flexible(
                        child: GestureDetector(
                          onTap: () => setState(() => _currentIndex = 0),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.8),
                              borderRadius: BorderRadius.circular(30),
                              border: Border.all(color: Colors.white.withOpacity(0.7)),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withOpacity(0.05),
                                  blurRadius: 4,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  height: 36,
                                  width: 36,
                                  decoration: BoxDecoration(
                                    gradient: const LinearGradient(
                                      colors: [Color(0xFF8BD4C2), Color(0xFF6EAED0)],
                                      begin: Alignment.topLeft,
                                      end: Alignment.bottomRight,
                                    ),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: const Icon(Icons.handshake, color: Colors.white, size: 20),
                                ),
                                const SizedBox(width: 8),
                                Flexible(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        "HelpingHands",
                                        overflow: TextOverflow.ellipsis,
                                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                          fontSize: 16,
                                          fontWeight: FontWeight.w900,
                                        ),
                                      ),
                                      const Text(
                                        "RELIEF NETWORK",
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          fontSize: 8,
                                          fontWeight: FontWeight.bold,
                                          letterSpacing: 1.5,
                                          color: Color(0xFF648197),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const Spacer(),
                      // User Profile Section
                      Flexible(
                        child: GestureDetector(
                          onTap: () => setState(() => _currentIndex = tabs.length - 1),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.85),
                              borderRadius: BorderRadius.circular(30),
                              border: Border.all(color: Colors.white.withOpacity(0.7)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const CircleAvatar(
                                  radius: 18,
                                  backgroundColor: Color(0xFFE8F3FF),
                                  child: Icon(Icons.person, color: Color(0xFF4D84A7), size: 20),
                                ),
                                const SizedBox(width: 8),
                                Flexible(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        "Hi, ${user?.displayName?.split(' ').firstOrNull ?? 'User'}",
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontSize: 12,                                        fontWeight: FontWeight.bold,
                                          color: AppTheme.foregroundColor,
                                        ),
                                      ),
                                      const Text(
                                        "SIGNED IN",
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          fontSize: 7,
                                          fontWeight: FontWeight.w900,
                                          letterSpacing: 1,
                                          color: Color(0xFF94A3B8),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 4),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          body: Stack(
            children: [
              Container(
                decoration: BoxDecoration(
                  gradient: AppTheme.backgroundGradient,
                ),
              ),
              IndexedStack(
                index: _currentIndex,
                children: tabs.map<Widget>((t) => t['screen'] as Widget).toList(),
              ),
            ],
          ),
          bottomNavigationBar: Container(
            decoration: BoxDecoration(
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.1),
                  blurRadius: 10,
                  offset: const Offset(0, -2),
                ),
              ],
            ),
            child: BottomNavigationBar(
              currentIndex: _currentIndex,
              onTap: (index) => setState(() => _currentIndex = index),
              items: tabs.map<BottomNavigationBarItem>((t) {
                return BottomNavigationBarItem(
                  icon: Icon(t['icon'] as IconData),
                  activeIcon: Icon(t['activeIcon'] as IconData),
                  label: t['label'] as String,
                );
              }).toList(),
            ),
          ),
        );
      },
    );
  }
}
