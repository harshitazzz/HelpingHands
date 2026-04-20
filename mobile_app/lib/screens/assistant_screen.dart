import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import '../services/gemini_service.dart';
import '../services/firebase_service.dart';
import '../services/matching_service.dart';
import '../theme/app_theme.dart';

class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final List<Map<String, String>> _messages = [];
  bool _isLoading = false;
  bool _canSubmit = false;
  
  // Voice services
  stt.SpeechToText? _speech;
  bool _isListening = false;
  FlutterTts? _flutterTts;

  @override
  void initState() {
    super.initState();
    _addMessage("model", "Hello! I'm your Helping Hands assistant. How can I help you today? You can describe an emergency or issue you've encountered.");
  }

  Future<void> _ensureSpeechInitialized() async {
    if (_speech == null) {
      try {
        _speech = stt.SpeechToText();
      } catch (e) {
        debugPrint("Speech initialization constructor error: $e");
      }
    }
  }

  Future<void> _ensureTtsInitialized() async {
    if (_flutterTts == null) {
      try {
        _flutterTts = FlutterTts();
        await _flutterTts?.setLanguage("en-US");
        await _flutterTts?.setPitch(1.0);
      } catch (e) {
        debugPrint("TTS initialization error: $e");
      }
    }
  }

  Future<void> _listen() async {
    await _ensureSpeechInitialized();
    final speech = _speech;
    if (speech == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Voice input is not available on this device/browser.")),
      );
      return;
    }

    if (!_isListening) {
      bool available = await speech.initialize(
        onStatus: (val) => print('onStatus: $val'),
        onError: (val) => print('onError: $val'),
      );
      if (available) {
        setState(() => _isListening = true);
        speech.listen(
          onResult: (val) => setState(() {
            _controller.text = val.recognizedWords;
          }),
        );
      }
    } else {
      setState(() => _isListening = false);
      speech.stop();
    }
  }

  Future<void> _speak(String text) async {
    await _ensureTtsInitialized();
    await _flutterTts?.speak(text);
  }

  void _addMessage(String role, String content) {
    setState(() {
      _messages.add({"role": role, "content": content});
      _canSubmit = content.contains("[EMERGENCY_SUMMARY_START]");
    });
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void dispose() {
    _speech?.stop();
    _flutterTts?.stop();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _handleSend() async {
    if (_isListening) {
      setState(() => _isListening = false);
      _speech?.stop();
    }
    final text = _controller.text.trim();
    if (text.isEmpty || _isLoading) return;

    _controller.clear();
    _addMessage("user", text);
    
    setState(() => _isLoading = true);

    try {
      final gemini = Provider.of<GeminiService>(context, listen: false);
      final response = await gemini.getChatResponse(text, _messages.sublist(0, _messages.length - 1));
      _addMessage("model", response);
    } catch (e) {
      _addMessage("model", "Sorry, I encountered an error. Please try again.");
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _submitRequest() async {
    final lastMessage = _messages.lastWhere((m) => m['role'] == 'model')['content'] ?? "";
    if (!lastMessage.contains("[EMERGENCY_SUMMARY_START]")) return;

    setState(() => _isLoading = true);
    
    try {
      final gemini = Provider.of<GeminiService>(context, listen: false);
      final firebase = Provider.of<FirebaseService>(context, listen: false);
      final matching = Provider.of<MatchingService>(context, listen: false);
      
      final structured = await gemini.getStructuredEmergencyData(lastMessage);
      
      // 1. Create the request in Firestore
      final requestId = await firebase.createRequest({
        ...structured,
        'fullSummary': lastMessage,
      });

      // 2. Trigger Auto-Assignment logic mirroring website
      final count = await matching.autoAssignVolunteers(
        requestId: requestId,
        requiredSkills: List<String>.from(structured['required_skills'] ?? []),
        location: structured['location'] ?? "Unknown",
        issue: structured['issue'],
        volunteersNeeded: (structured['volunteers_needed'] is num) ? (structured['volunteers_needed'] as num).toInt() : 1,
      );

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Report submitted! $count volunteers notified.")),
      );
      
      setState(() {
        _messages.clear();
        _addMessage("model", "Your report has been submitted! We have scanned and notified $count best-fit volunteers in the area. Would you like to report anything else?");
        _canSubmit = false;
      });
    } catch (e) {
      debugPrint("Submission failure: $e");
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Submission failed. Please check the logs.")),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Padding(
        padding: const EdgeInsets.only(top: 16),
        child: Column(
          children: [
            Expanded(
              child: ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.all(16),
                itemCount: _messages.length,
                itemBuilder: (context, index) {
                  final msg = _messages[index];
                  final isUser = msg['role'] == "user";
                  return _ChatBubble(
                    content: msg['content']!,
                    isUser: isUser,
                    onSpeak: () => _speak(msg['content']!),
                  );
                },
              ),
            ),
            if (_isLoading)
               const Padding(
                 padding: EdgeInsets.all(8.0),
                 child: CircularProgressIndicator(strokeWidth: 2),
               ),
            if (_canSubmit)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: ElevatedButton.icon(
                  onPressed: _isLoading ? null : _submitRequest,
                  icon: const Icon(Icons.send_rounded),
                  label: const Text("SUBMIT REPORT"),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryColor,
                    foregroundColor: Colors.white,
                    minimumSize: const Size(double.infinity, 56),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                ),
              ),
            _buildInputArea(),
          ],
        ),
      ),
    );
  }

  Widget _buildInputArea() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.8),
        border: const Border(top: BorderSide(color: Color(0xFFF1F5F9))),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _controller,
              decoration: InputDecoration(
                hintText: "Type your message...",
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: const Color(0xFFF1F5F9),
                contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              ),
              onSubmitted: (_) => _handleSend(),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            onPressed: _listen,
            icon: Icon(_isListening ? Icons.mic : Icons.mic_none_rounded),
            style: IconButton.styleFrom(
              backgroundColor: _isListening ? Colors.redAccent : const Color(0xFF648197),
              padding: const EdgeInsets.all(12),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            onPressed: _handleSend,
            icon: const Icon(Icons.arrow_upward_rounded),
            style: IconButton.styleFrom(
              backgroundColor: AppTheme.primaryColor,
              padding: const EdgeInsets.all(12),
            ),
          ),
        ],
      ),
    );
  }
}

class _ChatBubble extends StatelessWidget {
  final String content;
  final bool isUser;
  final VoidCallback onSpeak;

  const _ChatBubble({required this.content, required this.isUser, required this.onSpeak});

  @override
  Widget build(BuildContext context) {
    // Process content to clean up tags
    String displayContent = content
      .replaceAll("[EMERGENCY_SUMMARY_START]", "")
      .replaceAll("[EMERGENCY_SUMMARY_END]", "")
      .trim();

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: isUser ? AppTheme.primaryColor : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(20),
            topRight: const Radius.circular(20),
            bottomLeft: Radius.circular(isUser ? 20 : 0),
            bottomRight: Radius.circular(isUser ? 0 : 20),
          ),
        ),
        child: Column(
          crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Text(
              displayContent,
              style: TextStyle(
                color: isUser ? Colors.white : const Color(0xFF334155),
                fontSize: 15,
                height: 1.4,
              ),
            ),
            if (!isUser) ...[
              const SizedBox(height: 8),
              GestureDetector(
                onTap: onSpeak,
                child: const Icon(Icons.volume_up_rounded, size: 16, color: Color(0xFF648197)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
