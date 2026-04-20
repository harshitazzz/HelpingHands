import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  static const Color primaryColor = Color(0xFF4CAE99);
  static const Color backgroundColor = Color(0xFFEEF8F6);
  static const Color foregroundColor = Color(0xFF133043);
  static const Color secondaryColor = Color(0xFFD9EEF7);
  static const Color cardColor = Color(0xBFFFFFFF); // white/75
  static const Color mutedColor = Color(0xFFF4FBFA);
  static const Color accentColor = Color(0xFFD8F2EA);
  static const Color destructiveColor = Color(0xFFEF4444);

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primaryColor,
        primary: primaryColor,
        onPrimary: Colors.white,
        background: backgroundColor,
        onBackground: foregroundColor,
        surface: cardColor,
        onSurface: foregroundColor,
        error: destructiveColor,
      ),
      scaffoldBackgroundColor: backgroundColor,
      textTheme: GoogleFonts.manropeTextTheme().copyWith(
        displayLarge: GoogleFonts.sora(
          fontSize: 32,
          fontWeight: FontWeight.w800,
          color: foregroundColor,
          letterSpacing: -1,
        ),
        displayMedium: GoogleFonts.sora(
          fontSize: 28,
          fontWeight: FontWeight.bold,
          color: foregroundColor,
        ),
        displaySmall: GoogleFonts.sora(
          fontSize: 24,
          fontWeight: FontWeight.bold,
          color: foregroundColor,
        ),
        headlineMedium: GoogleFonts.sora(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: foregroundColor,
        ),
        titleLarge: GoogleFonts.sora(
          fontSize: 18,
          fontWeight: FontWeight.bold,
          color: foregroundColor,
        ),
        bodyLarge: GoogleFonts.manrope(
          fontSize: 16,
          color: foregroundColor,
        ),
        bodyMedium: GoogleFonts.manrope(
          fontSize: 14,
          color: foregroundColor,
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        iconTheme: IconThemeData(color: foregroundColor),
      ),
      cardTheme: CardThemeData(
        color: cardColor,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(28),
          side: const BorderSide(color: Colors.white24, width: 1),
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: Colors.white,
        selectedItemColor: primaryColor,
        unselectedItemColor: Color(0xFF648197),
        showSelectedLabels: true,
        showUnselectedLabels: true,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
      ),
    );
  }

  static BoxDecoration get glassDecoration => BoxDecoration(
        color: Colors.white.withOpacity(0.65),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.white.withOpacity(0.72)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF7192A5).withOpacity(0.14),
            blurRadius: 60,
            offset: const Offset(0, 20),
          ),
        ],
      );

  static LinearGradient get backgroundGradient => const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Color(0xFFF7FDFC),
          Color(0xFFEEF8F6),
          Color(0xFFE7F2F7),
        ],
      );
}
