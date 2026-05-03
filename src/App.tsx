import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Search, 
  Mic, 
  MicOff, 
  Loader2, 
  ChevronRight, 
  AlertTriangle, 
  CheckCircle2, 
  MapPin,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  Globe,
  Send,
  User,
  Bot,
  RefreshCcw,
  Sparkles,
  Phone,
  ArrowRight,
  Shield,
  Landmark,
  Zap,
  Droplets,
  Building2,
  Clock
} from "lucide-react";
import { GoogleGenAI, Type } from "@google/genai";
import Markdown from "react-markdown";

// Initialize AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface AnalysisResult {
  category: string;
  subcategory: string;
  urgency: "Normal" | "Urgent" | "Emergency";
  summary: string;
  steps: string[];
  authorityName: string;
  localContact?: string;
  officialLink?: string;
}

interface LocalDirectory {
  police: {
    stationName: string;
    controlRoom: string;
    emergency: string;
  };
  municipality: {
    officeName: string;
    contact: string;
    hours: string;
  };
  utilities: {
    waterBoard: { name: string; contact: string };
    electricityBoard: { name: string; contact: string };
  };
}

interface Message {
  role: "user" | "model";
  text: string;
  isStreaming?: boolean;
}

interface Report {
  id: string;
  description: string;
  location: string;
  department: string;
  phone?: string;
  timestamp: number;
}

export default function App() {
  const [userName, setUserName] = useState<string | null>(localStorage.getItem("help_router_user"));
  const [userPhone, setUserPhone] = useState<string | null>(localStorage.getItem("help_router_phone"));
  const [isNewUser, setIsNewUser] = useState(!localStorage.getItem("help_router_user_initialized"));
  const [showUserDetailsModal, setShowUserDetailsModal] = useState(false);
  const [onboardingData, setOnboardingData] = useState({ name: userName || "", phone: userPhone || "", location: "" });
  const [pendingAnalysis, setPendingAnalysis] = useState<string | null>(null);
  
  const [isReporting, setIsReporting] = useState(false);
  const [reportFormData, setReportFormData] = useState({ phone: "" });
  const [reportSuccess, setReportSuccess] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [manualLocationInput, setManualLocationInput] = useState("");
  const [mode, setMode] = useState<"my-location" | "someone-else">("my-location");
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [location, setLocation] = useState<{ city: string; state: string } | null>(null);
  const [localDirectory, setLocalDirectory] = useState<LocalDirectory | null>(null);
  const [isFetchingDirectory, setIsFetchingDirectory] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatMode, setIsChatMode] = useState(false);
  const chatRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Initialization check
  useEffect(() => {
    if (location && !onboardingData.location) {
      setOnboardingData(prev => ({ ...prev, location: `${location.city}, ${location.state}` }));
    }
  }, [location]);

  const handleStartInteraction = () => {
    if (!localStorage.getItem("help_router_user_initialized")) {
      setShowUserDetailsModal(true);
    } else {
      setIsChatMode(true);
    }
  };

  const handleOnboardingSubmit = () => {
    if (onboardingData.name) {
      localStorage.setItem("help_router_user", onboardingData.name);
      setUserName(onboardingData.name);
    }
    if (onboardingData.phone) {
      localStorage.setItem("help_router_phone", onboardingData.phone);
      setUserPhone(onboardingData.phone);
    }
    localStorage.setItem("help_router_user_initialized", "true");
    setShowUserDetailsModal(false);
    setIsNewUser(false);
    
    if (onboardingData.location && mode === 'someone-else') {
      setManualLocationInput(onboardingData.location);
    }

    if (pendingAnalysis) {
      handleAnalyze(pendingAnalysis);
      setPendingAnalysis(null);
    } else {
      setIsChatMode(true);
    }
  };

  // Fetch localized directory based on location
  const fetchLocalDirectory = async (cityState: string) => {
    // Check cache first
    const cachedDir = localStorage.getItem("help_router_directory");
    const cachedLoc = localStorage.getItem("help_router_location");
    if (cachedDir && cachedLoc && JSON.parse(cachedLoc).city === cityState.split(',')[0].trim()) {
      setLocalDirectory(JSON.parse(cachedDir));
      return;
    }

    setIsFetchingDirectory(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { 
            role: "user", 
            parts: [{ text: `Provide exact local public helpline directory for ${cityState}, India. 
            Include: 
            1. Police (Station name, Control room number, Emergency number 100)
            2. Municipality/Panchayat (Office name, Public contact, Hours)
            3. Utilities (Water board name/number, Electricity board name/number)
            Use real authority names. Format as JSON matching the schema.` }] 
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              police: {
                type: Type.OBJECT,
                properties: {
                  stationName: { type: Type.STRING },
                  controlRoom: { type: Type.STRING },
                  emergency: { type: Type.STRING }
                }
              },
              municipality: {
                type: Type.OBJECT,
                properties: {
                  officeName: { type: Type.STRING },
                  contact: { type: Type.STRING },
                  hours: { type: Type.STRING }
                }
              },
              utilities: {
                type: Type.OBJECT,
                properties: {
                  waterBoard: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      contact: { type: Type.STRING }
                    }
                  },
                  electricityBoard: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      contact: { type: Type.STRING }
                    }
                  }
                }
              }
            },
            required: ["police", "municipality", "utilities"]
          }
        }
      });
      const data = JSON.parse(response.text || "{}");
      setLocalDirectory(data);
      localStorage.setItem("help_router_directory", JSON.stringify(data));
    } catch (e: any) {
      console.error("Directory fetch failed", e);
      if (e.message?.includes("429")) {
        setError("Network busy. Some local info might be unavailable.");
      }
    } finally {
      setIsFetchingDirectory(false);
    }
  };

  // Detect location on load
  useEffect(() => {
    const cachedLocation = localStorage.getItem("help_router_location");
    const cachedDir = localStorage.getItem("help_router_directory");
    const cacheTime = localStorage.getItem("help_router_location_timestamp");
    
    const isCacheValid = cacheTime && (Date.now() - parseInt(cacheTime) < 86400000); // 24h

    if (cachedLocation && isCacheValid) {
      const locationData = JSON.parse(cachedLocation);
      setLocation(locationData);
      if (cachedDir) {
        setLocalDirectory(JSON.parse(cachedDir));
      } else {
        fetchLocalDirectory(`${locationData.city}, ${locationData.state}`);
      }
      return;
    }

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            const response = await ai.models.generateContent({
              model: "gemini-3-flash-preview",
              contents: [{ role: "user", parts: [{ text: `Identify the city and state for these coordinates in India: ${latitude}, ${longitude}. Return ONLY a JSON like {"city": "...", "state": "..."}.` }] }]
            });
            const data = JSON.parse(response.text || "{}");
            if (data.city && data.state) {
              setLocation(data);
              localStorage.setItem("help_router_location", JSON.stringify(data));
              localStorage.setItem("help_router_location_timestamp", Date.now().toString());
              fetchLocalDirectory(`${data.city}, ${data.state}`);
            }
          } catch (e: any) {
            console.error("Location detection failed", e);
            if (e.message?.includes("429") || e.message?.includes("quota")) {
              setError("API quota reached. Using default location.");
              // Fallback to a default or wait for manual input
              setLocation({ city: "Your City", state: "India" });
            }
          }
        },
        (error) => {
          console.warn("Geolocation access denied", error);
          setError("Location access denied. Please enter manually.");
        }
      );
    }
  }, []);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const startVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('speechRecognition' in window)) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = language === "en" ? "en-IN" : "hi-IN";

    recognitionRef.current.onstart = () => setIsRecording(true);
    recognitionRef.current.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsRecording(false);
    };
    recognitionRef.current.onerror = () => setIsRecording(false);
    recognitionRef.current.onend = () => setIsRecording(false);

    recognitionRef.current.start();
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const handleAnalyze = async (customInput?: string) => {
    const textToAnalyze = customInput || input;
    if (!textToAnalyze.trim()) return;

    if (!localStorage.getItem("help_router_user_initialized") && !showUserDetailsModal) {
      setPendingAnalysis(textToAnalyze);
      setShowUserDetailsModal(true);
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsChatMode(true);
    
    // Add user message if not already there
    if (!customInput) {
      const displayLocation = mode === 'someone-else' ? manualLocationInput : (location ? `${location.city}, ${location.state}` : 'Current Location');
      setMessages([{ role: "user", text: `[${displayLocation}] ${textToAnalyze}` }]);
      setInput("");
    } else {
      setMessages([{ role: "user", text: textToAnalyze }]);
    }

    if (mode === 'someone-else' && !manualLocationInput.trim()) {
      setError("Please enter a valid city or pincode");
      setIsLoading(false);
      setIsChatMode(false);
      return;
    }

    try {
      const classificationResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [{ text: `User is ${userName ? `named ${userName} and is ` : ''}helping someone in ${mode === 'someone-else' ? manualLocationInput : (location ? `${location.city}, ${location.state}, India` : 'India')}.
            Analyze this request: "${textToAnalyze}". 
            Language context: ${language === 'hi' ? 'Response must be in Hindi.' : 'English'}.
            Categories: Civic, Police, Healthcare, Documents, Utilities, Cybercrime, Fire.
            
            Find the EXACT local authority (e.g. BBMP in Bangalore, Delhi Police in Delhi etc.).
            Provide detailed steps and local helpline number if available.` }]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              subcategory: { type: Type.STRING },
              urgency: { type: Type.STRING, enum: ["Normal", "Urgent", "Emergency"] },
              authorityName: { type: Type.STRING },
              summary: { type: Type.STRING },
              steps: { type: Type.ARRAY, items: { type: Type.STRING } },
              localContact: { type: Type.STRING },
              officialLink: { type: Type.STRING }
            },
            required: ["category", "subcategory", "urgency", "authorityName", "summary", "steps"]
          }
        }
      });

      const data = JSON.parse(classificationResponse.text || "{}");
      setResult(data);

      chatRef.current = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: `You are the Smart Local Help Router AI. 
          User Context: ${userName ? `User name is ${userName}. ` : ''}User is ${mode === 'someone-else' ? `helping someone else in ${manualLocationInput}` : 'reporting for their current location'}.
          Target Location: ${mode === 'someone-else' ? manualLocationInput : (location ? `${location.city}, ${location.state}` : 'India')}.
          Summary: ${data.summary}.
          Authority: ${data.authorityName}.
          Be highly practical and localized to India. 
          Language: ${language === 'en' ? 'English' : 'Hindi'}.`
        }
      });

      // Initial system-generated summary response
      const greeting = userName ? `Hello ${userName} 👋. ` : "";
      setMessages(prev => [...prev, { role: "model", text: greeting + data.summary }]);
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("429") || err.message?.includes("quota")) {
        setError("Our system is currently at peak capacity. Please wait a minute and try again.");
      } else {
        setError("Failed to route request. Please check your connection or try a direct keyword like 'Garbage'.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleChat = async () => {
    if (!input.trim() || !chatRef.current) return;

    const userText = input;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userText }]);
    setIsLoading(true);
    
    try {
      const resultStream = await chatRef.current.sendMessageStream({ message: userText });
      
      let fullText = "";
      setMessages(prev => [...prev, { role: "model", text: "", isStreaming: true }]);

      for await (const chunk of resultStream) {
        fullText += chunk.text;
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { role: "model", text: fullText, isStreaming: true };
          return newMessages;
        });
      }

      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = { role: "model", text: fullText, isStreaming: false };
        return newMessages;
      });
    } catch (err: any) {
      console.error(err);
      setError("Communication failed. Please try a simple keyword like 'Police' or 'Water'.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (isGuest: boolean) => {
    if (!isGuest && nameInput.trim()) {
      localStorage.setItem("help_router_user", nameInput.trim());
      setUserName(nameInput.trim());
    }
    localStorage.setItem("help_router_user_initialized", "true");
    setIsNewUser(false);
  };

  const handleReportSubmit = () => {
    if (!result) return;
    
    const newReport: Report = {
      id: `CMP-${Math.floor(100000 + Math.random() * 900000)}`,
      description: messages[0]?.text || result.summary,
      location: mode === 'someone-else' ? manualLocationInput : (location ? `${location.city}, ${location.state}` : 'Unknown'),
      department: result.authorityName,
      phone: reportFormData.phone,
      timestamp: Date.now()
    };

    const existingReports = JSON.parse(localStorage.getItem("help_router_reports") || "[]");
    localStorage.setItem("help_router_reports", JSON.stringify([...existingReports, newReport]));
    
    setReportSuccess(newReport.id);
    setIsReporting(false);
    
    // Clear success after 5 seconds
    setTimeout(() => setReportSuccess(null), 5000);
  };

  const resetApp = () => {
    setResult(null);
    setMessages([]);
    setIsChatMode(false);
    chatRef.current = null;
    setInput("");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center font-sans tracking-tight">
      <AnimatePresence>
        {showUserDetailsModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-full max-w-lg bg-white rounded-t-[3rem] sm:rounded-[3rem] shadow-2xl p-8 sm:p-12 space-y-10"
            >
              <div className="space-y-4">
                <div className="w-16 h-1.5 bg-slate-100 rounded-full mx-auto sm:hidden mb-4" />
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Who are you?</h3>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Help us personalize your experience</p>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 ml-4">Full Name</label>
                  <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex items-center gap-4 focus-within:ring-4 focus-within:ring-slate-100 transition-all">
                    <User size={24} className="text-slate-400" />
                    <input 
                      type="text" 
                      autoFocus
                      value={onboardingData.name}
                      onChange={(e) => setOnboardingData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. John Doe"
                      className="flex-1 bg-transparent border-none focus:ring-0 text-lg font-black placeholder:text-slate-200 uppercase tracking-tight"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 ml-4">Phone Number</label>
                  <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex items-center gap-4 focus-within:ring-4 focus-within:ring-slate-100 transition-all">
                    <Phone size={24} className="text-slate-400" />
                    <input 
                      type="tel" 
                      value={onboardingData.phone}
                      onChange={(e) => setOnboardingData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="+91 00000 00000"
                      className="flex-1 bg-transparent border-none focus:ring-0 text-lg font-black placeholder:text-slate-200 uppercase tracking-tight"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-4">
                  <button 
                    onClick={handleOnboardingSubmit}
                    className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-sm uppercase tracking-[0.3em] shadow-2xl hover:bg-blue-600 transition-all active:scale-95"
                  >
                    Continue
                  </button>
                  <button 
                    onClick={() => {
                      localStorage.setItem("help_router_user_initialized", "true");
                      setShowUserDetailsModal(false);
                      setIsNewUser(false);
                      setIsChatMode(true);
                    }}
                    className="w-full py-4 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-900 transition-colors"
                  >
                    Skip For Now
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Header */}
      <header className="w-full bg-white/80 backdrop-blur-xl border-b border-slate-100 flex items-center justify-center p-4 sticky top-0 z-50 transition-all">
        <div className="w-full max-w-6xl flex items-center justify-between px-2">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={resetApp}>
            <div className="p-2.5 bg-slate-900 rounded-2xl text-white shadow-xl shadow-slate-200 group-hover:scale-105 transition-transform duration-300">
              <MapPin size={22} className="text-blue-400 group-hover:animate-bounce" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter text-slate-900 leading-none uppercase">
                The Advocate
              </h1>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {userName ? `Hello, ${userName}` : (location ? `${location.city}, ${location.state}` : 'Locating...')}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setLanguage(lang => lang === "en" ? "hi" : "en")}
              className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-2xl text-[10px] font-black text-slate-600 hover:bg-white transition-all flex items-center gap-2 shadow-sm uppercase tracking-widest active:scale-95"
            >
              <Globe size={14} className="text-slate-400" />
              {language === "en" ? "ENGLISH" : "हिन्दी"}
            </button>
          </div>
        </div>
      </header>

      {/* Fullscreen Chat Overlay */}
      <AnimatePresence>
        {isChatMode && (
          <motion.div 
            initial={{ opacity: 0, scale: 1.1, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed inset-0 z-[100] bg-white flex flex-col"
          >
            {/* Chat Header */}
            <div className="p-4 bg-white/80 backdrop-blur-md border-b border-slate-50 flex items-center justify-between sticky top-0 z-10">
              <button 
                onClick={() => setIsChatMode(false)}
                className="p-3 bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-900 transition-all flex items-center gap-2 font-black text-[10px] uppercase tracking-widest active:scale-95"
              >
                <ChevronLeft size={20} /> Back to Dashboard
              </button>
              <div className="flex items-center gap-3 px-4">
                <button 
                  onClick={() => { setMessages([]); setIsChatMode(false); }}
                  className="p-3 text-slate-400 hover:text-red-500 transition-colors uppercase font-black text-[10px] tracking-widest flex items-center gap-2"
                >
                  <RefreshCcw size={16} /> Clear Chat
                </button>
                <div className="w-px h-6 bg-slate-100 mx-2" />
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">AI ASSISTANT</span>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8" ref={scrollRef}>
              <div className="max-w-4xl mx-auto space-y-10">
                {messages.map((msg, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, y: 10, x: msg.role === 'user' ? 20 : -20 }}
                    animate={{ opacity: 1, y: 0, x: 0 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] p-6 rounded-[2rem] text-sm font-bold leading-relaxed shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-slate-900 text-white rounded-tr-none' 
                        : 'bg-slate-50 text-slate-900 rounded-tl-none border border-slate-100'
                    }`}>
                      <Markdown>{msg.text}</Markdown>
                    </div>
                  </motion.div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-50 p-6 rounded-[2rem] rounded-tl-none border border-slate-100 flex items-center gap-3">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">AI is thinking...</span>
                    </div>
                  </div>
                )}
                
                {error && (
                  <div className="flex justify-center">
                    <div className="bg-red-50 p-6 rounded-[2rem] border border-red-100 flex flex-col items-center gap-2 max-w-md text-center">
                      <AlertTriangle className="text-red-500" />
                      <p className="text-red-900 font-bold text-sm tracking-tight">{error}</p>
                      <button 
                        onClick={() => { setError(null); handleAnalyze(input || "Help"); }}
                        className="mt-2 px-6 py-2 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-red-700 transition-all"
                      >
                        Try Again
                      </button>
                    </div>
                  </div>
                )}
                
                {!result && !isLoading && !error && messages.length > 0 && (
                  <div className="flex justify-start">
                    <div className="bg-slate-50 p-6 rounded-[2rem] rounded-tl-none border border-slate-100 flex flex-col gap-2">
                       <HelpCircle className="text-slate-300" />
                       <p className="text-slate-400 font-bold text-xs">Waiting for a clear instruction. Please try describing your problem again.</p>
                    </div>
                  </div>
                )}
                
                {result && !isLoading && (
                  <motion.div 
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8 pt-4 pb-12"
                  >
                    {/* Routing Cards Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Urgency Card */}
                      <div className={`p-8 rounded-[3rem] border border-transparent shadow-xl ${
                        result.urgency === 'Emergency' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'
                      }`}>
                        <div className="flex items-center justify-between mb-6">
                          <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80">{result.urgency} Action Needed</span>
                          <AlertTriangle size={24} className="opacity-80" />
                        </div>
                        <h4 className="text-3xl font-black tracking-tighter leading-none uppercase mb-6">{result.authorityName}</h4>
                        <a href={`tel:${result.localContact || '100'}`} className="w-full py-5 bg-white text-slate-900 rounded-[2rem] font-black text-xs uppercase tracking-[0.4em] flex items-center justify-center gap-3 shadow-2xl hover:scale-[1.02] transition-transform">
                          <Phone size={18} /> Call Helpline
                        </a>
                      </div>

                      {/* Map & Report Actions */}
                      <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 flex flex-col gap-4">
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(result.authorityName + ' ' + (location?.city || 'India'))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full p-6 bg-white border border-slate-100 text-blue-600 rounded-[2rem] text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-blue-50 transition-colors shadow-sm"
                        >
                          <MapPin size={20} /> Open in Maps
                        </a>
                        <button 
                          onClick={() => setIsReporting(true)}
                          className="w-full p-6 bg-slate-900 text-white rounded-[2rem] text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-blue-600 transition-colors shadow-xl"
                        >
                          <Building2 size={20} /> Report Issue
                        </button>
                      </div>
                    </div>

                    {/* Steps Section */}
                    <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
                       <h5 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300">Procedure to Follow</h5>
                       <div className="space-y-6">
                         {result.steps.map((step, idx) => (
                           <div key={idx} className="flex gap-6 group">
                             <span className="flex-shrink-0 w-8 h-8 rounded-2xl bg-slate-50 text-slate-900 flex items-center justify-center font-black text-[10px] group-hover:bg-slate-900 group-hover:text-white transition-colors">
                               {idx + 1}
                             </span>
                             <p className="text-slate-600 font-bold leading-relaxed pt-1">{step}</p>
                           </div>
                         ))}
                       </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Sticky Chat Input */}
            <div className="p-6 bg-white border-t border-slate-100">
              <div className="max-w-4xl mx-auto flex items-center gap-3 bg-slate-50 p-3 rounded-[2.5rem] border border-slate-200 focus-within:ring-4 focus-within:ring-slate-100 transition-all">
                <button
                   onMouseDown={startVoiceInput}
                   onMouseUp={stopVoiceInput}
                   className={`p-4 rounded-2xl transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-200 text-slate-400 hover:bg-slate-300'}`}
                >
                  <Mic size={20} />
                </button>
                <input 
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                  placeholder="Ask a follow up question..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-bold placeholder:text-slate-300 px-2"
                />
                <button 
                  onClick={handleChat}
                  disabled={isLoading || !input.trim()}
                  className="p-4 bg-slate-900 text-white rounded-2xl hover:bg-blue-600 shadow-xl transition-all active:scale-95 disabled:opacity-20"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Screen Content */}
      <main className={`w-full max-w-6xl flex-1 flex flex-col items-center p-4 md:p-8 transition-all duration-700 ${isChatMode ? 'blur-2xl opacity-20 scale-95 pointer-events-none' : ''}`}>
        <AnimatePresence mode="wait">
          {!isChatMode && (
            <motion.section 
              key="hero"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl mt-12 md:mt-24 space-y-16"
            >
              <div className="text-center space-y-6">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="inline-flex items-center gap-2.5 px-4 py-2 bg-blue-50 text-blue-600 rounded-2xl text-xs font-black uppercase tracking-[0.2em] border border-blue-100 mb-2 shadow-sm"
                >
                  <Sparkles size={14} />
                  Precision Routing Engine
                </motion.div>
                {/* User Info / Profile Section */}
                {userName && (
                  <div className="flex justify-center -mt-4 mb-8">
                    <button 
                      onClick={() => setShowUserDetailsModal(true)}
                      className="group flex items-center gap-3 px-6 py-3 bg-white/50 backdrop-blur-md rounded-2xl border border-slate-100 hover:border-blue-200 transition-all shadow-sm active:scale-95"
                    >
                      <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-black text-xs uppercase">
                        {userName.charAt(0)}
                      </div>
                      <div className="text-left">
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">Authenticated</p>
                        <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight flex items-center gap-1">
                          {userName} <RefreshCcw size={10} className="text-slate-300 group-hover:rotate-180 transition-transform duration-700" />
                        </p>
                      </div>
                    </button>
                  </div>
                )}

                <h2 className="text-5xl md:text-8xl font-black text-slate-900 tracking-tighter leading-[0.85] uppercase">
                  {userName ? (
                    <motion.span 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-2xl md:text-4xl block text-slate-400 mb-4 lowercase font-medium tracking-normal"
                    >
                      hello, {userName.toLowerCase()} —
                    </motion.span>
                  ) : language === "en" ? "Citizen Help" : "नागरिक सहायता"}<br/>
                  <span className="text-blue-600">{userName ? "Local Assistance" : "Simplified."}</span>
                </h2>
                
                {/* Mode Toggle */}
                <div className="flex justify-center mt-8">
                  <div className="bg-white p-1.5 rounded-2xl shadow-xl shadow-slate-200 border border-slate-100 flex gap-1">
                    <button 
                      onClick={() => setMode('my-location')}
                      className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'my-location' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      📍 My Location
                    </button>
                    <button 
                      onClick={() => setMode('someone-else')}
                      className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'someone-else' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      🌍 Help Someone Else
                    </button>
                  </div>
                </div>

                <p className="text-slate-400 font-bold md:text-2xl max-w-xl mx-auto leading-tight uppercase tracking-tight opacity-40">
                  {mode === 'my-location' 
                    ? "Connect with the right local authority in seconds."
                    : "Enter a location to help a friend or family member."}
                </p>

                {/* Quick Action Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
                  {[
                    { label: "Water", icon: <Droplets size={24}/>, color: "hover:bg-blue-600", bg: "bg-blue-50 text-blue-600", prompt: "Report a water supply or sewage issue" },
                    { label: "Power", icon: <Zap size={24}/>, color: "hover:bg-amber-600", bg: "bg-amber-50 text-amber-600", prompt: "Report a power cut or electrical fault" },
                    { label: "Garbage", icon: <Building2 size={24}/>, color: "hover:bg-emerald-600", bg: "bg-emerald-50 text-emerald-600", prompt: "Complaint about garbage collection or cleanliness" },
                    { label: "Police", icon: <Shield size={24}/>, color: "hover:bg-indigo-600", bg: "bg-indigo-50 text-indigo-600", prompt: "Need help from local police department" },
                    { label: "Health", icon: <Bot size={24}/>, color: "hover:bg-red-600", bg: "bg-red-50 text-red-600", prompt: "Nearby public healthcare or ambulance inquiry" },
                    { label: "Cyber", icon: <Shield size={24}/>, color: "hover:bg-purple-600", bg: "bg-purple-50 text-purple-600", prompt: "Report cyber fraud or online crime" },
                    { label: "Docs", icon: <Landmark size={24}/>, color: "hover:bg-slate-900", bg: "bg-slate-50 text-slate-600", prompt: "Inquiry about government documents or certifications" },
                    { label: "Transport", icon: <RefreshCcw size={24}/>, color: "hover:bg-blue-900", bg: "bg-indigo-50 text-indigo-900", prompt: "Public transport or road maintenance query" }
                  ].map((btn) => (
                    <button
                      key={btn.label}
                      onClick={() => { setInput(btn.prompt); handleAnalyze(btn.prompt); }}
                      className={`flex flex-col items-center justify-center p-8 rounded-[3rem] border border-slate-100 hover:border-transparent hover:text-white hover:scale-105 transition-all shadow-sm ${btn.bg} ${btn.color} active:scale-95 group duration-500`}
                    >
                      <div className="mb-4 group-hover:scale-110 transition-transform">{btn.icon}</div>
                      <span className="text-[10px] font-black uppercase tracking-[0.3em]">{btn.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Input Card - Now more compact as it will be duplicated at bottom */}
              <div className="bg-white p-4 rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-slate-100 relative w-full group transition-all hover:shadow-[0_32px_64px_-16px_rgba(37,99,235,0.1)] mb-32">
                {mode === 'someone-else' && (
                  <div className="px-8 pt-8 pb-4 border-b border-slate-50">
                    <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <MapPin size={18} className="text-blue-500" />
                      <input 
                        type="text"
                        value={manualLocationInput}
                        onChange={(e) => setManualLocationInput(e.target.value)}
                        placeholder="Enter city, state or pincode"
                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-black uppercase tracking-widest text-slate-900 placeholder:text-slate-300"
                      />
                    </div>
                  </div>
                )}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={language === "en" ? (mode === 'someone-else' ? "Describe their problem..." : "Describe your problem here...") : (mode === 'someone-else' ? "उनकी समस्या यहाँ लिखें..." : "अपनी समस्या यहाँ लिखें...")}
                  className={`w-full ${mode === 'someone-else' ? 'min-h-[150px]' : 'min-h-[200px]'} p-8 text-2xl border-none focus:ring-0 resize-none bg-transparent placeholder:text-slate-200 transition-all font-black text-slate-900 tracking-tight`}
                />
                <div className="flex items-center justify-between p-3">
                  <button
                    onMouseDown={startVoiceInput}
                    onMouseUp={stopVoiceInput}
                    onTouchStart={startVoiceInput}
                    onTouchEnd={stopVoiceInput}
                    className={`p-6 rounded-[2rem] transition-all shadow-2xl active:scale-95 ${
                      isRecording 
                        ? "bg-red-600 text-white animate-pulse" 
                        : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                    }`}
                  >
                    {isRecording ? <MicOff size={32}/> : <Mic size={32}/>}
                  </button>
                  <button
                    onClick={() => handleAnalyze()}
                    disabled={isLoading || !input.trim()}
                    className="bg-slate-900 text-white pl-12 pr-6 py-6 rounded-[2rem] font-black text-xl flex items-center justify-center gap-4 hover:bg-blue-600 disabled:opacity-20 transition-all shadow-2xl active:scale-[0.97] uppercase tracking-widest group"
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={28} /> : <>Route Now <div className="p-2 bg-white/20 rounded-xl group-hover:translate-x-2 transition-transform"><ArrowRight size={28}/></div></>}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-4">
                {[
                  { label: "STOLEN BIKE", color: "bg-red-50 text-red-500" },
                  { label: "GARBAGE ISSUE", color: "bg-green-50 text-green-600" },
                  { label: "LOST DOCUMENT", color: "bg-blue-50 text-blue-500" },
                  { label: "CYBER FRAUD", color: "bg-purple-50 text-purple-500" }
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => { setInput(item.label); handleAnalyze(item.label); }}
                    className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:scale-105 shadow-sm border border-transparent hover:border-slate-200 ${item.color}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Local Help Near You Section */}
              <AnimatePresence>
                {mode === 'my-location' && location && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full space-y-8 pt-8 border-t border-slate-100"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-black text-slate-900 tracking-tighter uppercase">Local Help Near You</h3>
                      <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-lg text-[9px] font-black text-slate-500 uppercase tracking-widest">
                        <MapPin size={10} /> {location.city}
                      </div>
                    </div>

                    {isFetchingDirectory ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="animate-spin text-blue-500" size={32} />
                      </div>
                    ) : localDirectory ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Police Card */}
                        <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-[0_16px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-6 group hover:border-blue-200 transition-all hover:shadow-[0_32px_64px_-16px_rgba(37,99,235,0.1)]">
                          <div className="flex items-center justify-between">
                            <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all duration-500">
                              <Shield size={28} />
                            </div>
                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">POLICE</span>
                          </div>
                          <div className="space-y-1">
                            <p className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">{localDirectory.police.stationName}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Verified Station</p>
                          </div>
                          <div className="mt-auto pt-4 flex flex-col gap-3">
                            <a href={`tel:${localDirectory.police.controlRoom}`} className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-900 hover:text-white rounded-2xl transition-all text-xs font-black group/link">
                              Control Room <span className="opacity-60 font-mono group-hover/link:text-blue-400 transition-colors">{localDirectory.police.controlRoom}</span>
                            </a>
                            <a 
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(localDirectory.police.stationName + ' ' + (location?.city || 'India'))}`} 
                              target="_blank" 
                              className="flex items-center justify-center gap-2 p-4 text-blue-600 bg-blue-50/50 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                            >
                              <MapPin size={14} /> Open in Maps
                            </a>
                          </div>
                        </div>

                        {/* Municipality Card */}
                        <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-[0_16px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-6 group hover:border-amber-200 transition-all hover:shadow-[0_32px_64px_-16px_rgba(245,158,11,0.1)]">
                          <div className="flex items-center justify-between">
                            <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-600 group-hover:text-white transition-all duration-500">
                              <Landmark size={28} />
                            </div>
                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">CIVIC</span>
                          </div>
                          <div className="space-y-1">
                            <p className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">{localDirectory.municipality.officeName}</p>
                            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              <Clock size={12} /> {localDirectory.municipality.hours}
                            </div>
                          </div>
                          <div className="mt-auto pt-4 flex flex-col gap-3">
                            <a href={`tel:${localDirectory.municipality.contact}`} className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-900 hover:text-white rounded-2xl transition-all text-xs font-black group/link">
                              Public Helpline <span className="opacity-60 font-mono group-hover/link:text-amber-400 transition-colors">{localDirectory.municipality.contact}</span>
                            </a>
                            <div className="flex gap-2">
                              <button className="flex-1 flex items-center justify-center p-4 text-amber-600 bg-amber-50/50 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all active:scale-95 border border-transparent hover:border-amber-100">
                                File Complaint
                              </button>
                              <a 
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(localDirectory.municipality.officeName + ' ' + (location?.city || 'India'))}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-4 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-900 hover:text-white transition-all shadow-sm flex items-center justify-center active:scale-90"
                              >
                                <MapPin size={18} />
                              </a>
                            </div>
                          </div>
                        </div>

                        {/* Utilities Card */}
                        <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-[0_16px_32px_-8px_rgba(0,0,0,0.05)] flex flex-col gap-6 group hover:border-emerald-200 transition-all hover:shadow-[0_32px_64px_-16px_rgba(16,185,129,0.1)]">
                          <div className="flex items-center justify-between">
                            <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-all duration-500">
                              <Zap size={28} />
                            </div>
                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">UTILITIES</span>
                          </div>
                          <div className="space-y-6">
                            <div className="space-y-2">
                                <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em]">Electricity</p>
                                <a href={`tel:${localDirectory.utilities.electricityBoard.contact}`} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl text-xs font-black text-slate-700 hover:bg-slate-900 hover:text-white transition-all group/util">
                                    {localDirectory.utilities.electricityBoard.name} <Phone size={14} className="group-hover/util:animate-bounce"/>
                                </a>
                            </div>
                            <div className="space-y-2">
                                <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em]">Water & Sewage</p>
                                <a href={`tel:${localDirectory.utilities.waterBoard.contact}`} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl text-xs font-black text-slate-700 hover:bg-slate-900 hover:text-white transition-all group/util">
                                    {localDirectory.utilities.waterBoard.name} <Phone size={14} className="group-hover/util:animate-bounce"/>
                                </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* Fixed Bottom Input Bar */}
      {!isChatMode && !isNewUser && (
        <motion.div 
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-0 left-0 right-0 p-6 z-[60] flex justify-center pointer-events-none"
        >
          <div className="w-full max-w-4xl bg-white/80 backdrop-blur-2xl p-3 rounded-[2.5rem] shadow-[0_-32px_64px_-16px_rgba(0,0,0,0.1)] border border-slate-100 flex items-center gap-3 pointer-events-auto">
            <button
               onMouseDown={startVoiceInput}
               onMouseUp={stopVoiceInput}
               className={`p-5 rounded-2xl transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
            >
              <Mic size={24} />
            </button>
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              placeholder="Ask anything or report an issue..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-lg font-bold placeholder:text-slate-300 px-2"
            />
            <button 
              onClick={() => handleAnalyze()}
              disabled={isLoading || !input.trim()}
              className="p-5 bg-slate-900 text-white rounded-2xl hover:bg-blue-600 disabled:opacity-20 transition-all shadow-xl active:scale-95 flex items-center gap-2 group"
            >
              <span className="text-xs font-black uppercase tracking-widest ml-2 hidden sm:block">Route</span>
              <Send size={24} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </button>
          </div>
        </motion.div>
      )}

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-600 text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl flex items-center gap-4 z-[100]"
        >
          <AlertTriangle size={20} />
          {error}
          <button onClick={() => setError(null)} className="ml-4 opacity-50 hover:opacity-100 transition-opacity">CLOSE</button>
        </motion.div>
      )}

      {reportSuccess && (
        <motion.div 
          initial={{ opacity: 0, y: 30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.9 }}
          className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[250] w-[90%] max-w-sm"
        >
          <div className="bg-slate-900 text-white p-6 rounded-[2.5rem] shadow-2xl border border-slate-800 flex items-center gap-4">
            <div className="w-12 h-12 bg-green-500 rounded-2xl flex items-center justify-center text-white shrink-0">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Status: Logged</p>
              <h4 className="text-sm font-black uppercase tracking-tight leading-tight">Report #{reportSuccess} Submitted</h4>
            </div>
          </div>
        </motion.div>
      )}

      {/* Reporting Modal */}
      <AnimatePresence>
        {isReporting && result && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="w-full max-w-lg bg-white rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.4)] overflow-hidden"
            >
              <div className="p-8 space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Report Issue</h3>
                  <button onClick={() => setIsReporting(false)} className="p-3 bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-900 transition-colors">
                    <RefreshCcw size={20} className="rotate-45" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Problem Description</p>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-slate-600 font-bold text-sm">
                      {messages[0]?.text || result.summary}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Department</p>
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-slate-900 font-black text-xs">
                        {result.authorityName}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Location</p>
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-slate-900 font-black text-xs truncate">
                        {mode === 'someone-else' ? manualLocationInput : (location ? `${location.city}, ${location.state}` : 'N/A')}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Your Phone (Optional)</p>
                    <input 
                      type="tel"
                      value={reportFormData.phone}
                      onChange={(e) => setReportFormData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="+91 0000000000"
                      className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-slate-100 transition-all font-black text-slate-900 uppercase tracking-widest text-sm"
                    />
                  </div>
                </div>

                <button 
                  onClick={handleReportSubmit}
                  className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-sm uppercase tracking-[0.3em] flex items-center justify-center gap-4 hover:bg-blue-600 shadow-2xl transition-all active:scale-95"
                >
                  <Send size={20} /> Submit Report
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        
        @keyframes scale-in {
          0% { transform: scale(0.9); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        
        .scale-in { animation: scale-in 0.3s ease-out forwards; }
      `}</style>
    </div>
  );
}
