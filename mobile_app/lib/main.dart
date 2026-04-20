import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:provider/provider.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'screens/main_layout.dart';
import 'widgets/auth_wrapper.dart';
import 'theme/app_theme.dart';
import 'services/firebase_service.dart';
import 'services/matching_service.dart';
import 'services/gemini_service.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  await dotenv.load(fileName: ".env");

  try {
    if (kIsWeb) {
      await Firebase.initializeApp(
        options: const FirebaseOptions(
          apiKey: "AIzaSyAM6b7QDTjwUmNjSqhjgscLer4eQYmW5Zc",
          authDomain: "gen-lang-client-0575655524.firebaseapp.com",
          projectId: "gen-lang-client-0575655524",
          storageBucket: "gen-lang-client-0575655524.firebasestorage.app",
          messagingSenderId: "83143683175",
          appId: "1:83143683175:web:92c81b4511cae1e89c78c2",
        ),
      );
    } else {
      await Firebase.initializeApp();
    }
    debugPrint("Firebase initialized successfully");
  } catch (e) {
    debugPrint("Firebase initialization error: $e");
  }

  runApp(
    MultiProvider(
      providers: [
        Provider<FirebaseService>(create: (_) => FirebaseService()),
        Provider<GeminiService>(
          create: (_) => GeminiService(apiKey: dotenv.env['GEMINI_API_KEY'] ?? ""),
        ),
        ProxyProvider<FirebaseService, MatchingService>(
          update: (_, firebase, __) => MatchingService(firebase),
        ),
      ],
      child: const HelpingHandsApp(),
    ),
  );
}

class HelpingHandsApp extends StatelessWidget {
  const HelpingHandsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'HelpingHands',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: const AuthWrapper(),
    );
  }
}
