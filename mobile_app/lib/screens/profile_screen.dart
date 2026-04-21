import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/firebase_service.dart';
import '../theme/app_theme.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _nameController = TextEditingController();
  final _skillsController = TextEditingController();
  final _locationController = TextEditingController();
  final _phoneController = TextEditingController();
  
  bool _isVolunteer = false;
  bool _isLoading = true;
  String _availability = 'available';

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final firebase = Provider.of<FirebaseService>(context, listen: false);
    
    try {
      final userData = await firebase.getUserData(user.uid);
      final volunteerData = await firebase.getVolunteerData(user.uid);

      if (!mounted) return;
      setState(() {
        _nameController.text = userData?['name'] ?? user.displayName ?? '';
        if (volunteerData != null) {
          _isVolunteer = true;
          _skillsController.text = (volunteerData['skills'] as List?)?.join(', ') ?? '';
          _phoneController.text = volunteerData['phone'] ?? '';
          _locationController.text = volunteerData['location'] ?? '';
          _availability = volunteerData['availability'] ?? 'available';
        }
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading profile: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleSave() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    setState(() => _isLoading = true);
    try {
      final firebase = Provider.of<FirebaseService>(context, listen: false);
      
      // Update basic user data
      await firebase.updateUserData(user.uid, {
        'name': _nameController.text,
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (_isVolunteer) {
        // Register/Update volunteer data
        await firebase.registerVolunteer(user.uid, {
          'skills': _skillsController.text.split(',').map((s) => s.trim()).toList(),
          'phone': _phoneController.text,
          'location': _locationController.text,
          'availability': _availability,
          'isApproved': true, // Auto-approve for demo
        });
      } else {
        // Remove volunteer status if unchecked
        await firebase.removeVolunteer(user.uid);
      }
      
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Profile updated successfully!")),
      );
    } catch (e) {
      debugPrint("Error saving profile: $e");
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _handleDeleteAccount() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Delete Account?"),
        content: const Text("This will permanently remove your user and volunteer data. This action cannot be undone."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("CANCEL")),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text("DELETE", style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      setState(() => _isLoading = true);
      try {
        await Provider.of<FirebaseService>(context, listen: false).deleteAccount(user.uid);
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
      } finally {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SingleChildScrollView(
        padding: const EdgeInsets.only(top: 24, left: 16, right: 16, bottom: 24),
        child: Column(
          children: [
            _buildProfileHeader(),
            const SizedBox(height: 24),
            _buildVolunteerSection(),
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: _isLoading ? null : _handleSave,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primaryColor,
                foregroundColor: Colors.white,
                minimumSize: const Size(double.infinity, 56),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              child: const Text("SAVE CHANGES", style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1.2)),
            ),
            const SizedBox(height: 24),
            TextButton(
              onPressed: () => Provider.of<FirebaseService>(context, listen: false).signOut(),
              child: const Text("LOG OUT", style: TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.w900, letterSpacing: 1.1)),
            ),
            TextButton(
              onPressed: _handleDeleteAccount,
              child: const Text("DELETE ACCOUNT", style: TextStyle(color: AppTheme.destructiveColor, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProfileHeader() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: AppTheme.glassDecoration,
      child: Column(
        children: [
          const CircleAvatar(
            radius: 50,
            backgroundColor: Color(0xFFE8F3FF),
            child: Icon(Icons.person, color: Color(0xFF4D84A7), size: 50),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _nameController,
            textAlign: TextAlign.center,
            decoration: const InputDecoration(
              hintText: "Your Name",
              border: InputBorder.none,
            ),
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }

  Widget _buildVolunteerSection() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: AppTheme.glassDecoration.copyWith(
        color: _isVolunteer ? Colors.white : const Color(0xFFEFF6FF),
        border: _isVolunteer ? Border.all(color: AppTheme.primaryColor, width: 2) : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                "MISSION READINESS",
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 2,
                  color: Color(0xFF94A3B8),
                ),
              ),
              Switch(
                value: _isVolunteer,
                onChanged: (v) => setState(() => _isVolunteer = v),
                activeColor: AppTheme.primaryColor,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            _isVolunteer ? "You are active as a volunteer." : "Step forward as a community hero.",
            style: TextStyle(
              fontSize: 14,
              color: _isVolunteer ? AppTheme.primaryColor : const Color(0xFF64748B),
              fontWeight: FontWeight.bold,
            ),
          ),
          if (!_isVolunteer)
             const Padding(
               padding: EdgeInsets.only(top: 8.0),
               child: Text("Fill your details below and toggle the switch to join the ground force.", style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
             ),
          const SizedBox(height: 24),
          _buildField("Expertise (comma separated)", _skillsController, Icons.star_border),
          const SizedBox(height: 16),
          _buildField("Contact Number", _phoneController, Icons.phone_outlined),
          const SizedBox(height: 16),
          _buildField("Deployment City", _locationController, Icons.map_outlined),
          if (_isVolunteer) ...[
            const SizedBox(height: 24),
            const Text(
              "AVAILABILITY SIGNAL",
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Color(0xFF94A3B8)),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _buildStatusBtn("available", const Color(0xFF5FA8D3)),
                const SizedBox(width: 8),
                _buildStatusBtn("busy", Colors.orange),
                const SizedBox(width: 8),
                _buildStatusBtn("offline", Colors.grey),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildField(String label, TextEditingController controller, IconData icon) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Color(0xFF94A3B8))),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          decoration: InputDecoration(
            prefixIcon: Icon(icon, size: 20),
            filled: true,
            fillColor: const Color(0xFFF8FAFC),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
          ),
        ),
      ],
    );
  }

  Widget _buildStatusBtn(String status, Color color) {
    bool active = _availability == status;
    return GestureDetector(
      onTap: () => setState(() => _availability = status),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: active ? const Color(0xFF0F172A) : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: active ? const Color(0xFF0F172A) : const Color(0xFFF1F5F9)),
        ),
        child: Row(
          children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
            const SizedBox(width: 8),
            Text(
              status.toUpperCase(),
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w900,
                color: active ? Colors.white : const Color(0xFF94A3B8),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
