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

export default function App() {
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

  // Fetch localized directory based on location
  const fetchLocalDirectory = async (cityState: string) => {
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
    } catch (e) {
      console.error("Directory fetch failed", e);
    } finally {
      setIsFetchingDirectory(false);
    }
  };

  // Detect location on load
  useEffect(() => {
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
            setLocation(data);
            fetchLocalDirectory(`${data.city}, ${data.state}`);
          } catch (e) {
            console.error("Location detection failed", e);
          }
        },
        (error) => console.warn("Geolocation access denied", error)
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

    // Fetch directory for someone else's location if needed
    if (mode === 'someone-else') {
      fetchLocalDirectory(manualLocationInput);
    }

    try {
      const classificationResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [{ text: `User is helping someone in ${mode === 'someone-else' ? manualLocationInput : (location ? `${location.city}, ${location.state}, India` : 'India')}.
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
          Context: User is ${mode === 'someone-else' ? `helping someone else in ${manualLocationInput}` : 'reporting for their current location'}.
          Target Location: ${mode === 'someone-else' ? manualLocationInput : (location ? `${location.city}, ${location.state}` : 'India')}.
          Summary: ${data.summary}.
          Authority: ${data.authorityName}.
          Be highly practical and localized to India. 
          Language: ${language === 'en' ? 'English' : 'Hindi'}.`
        }
      });

      // Initial system-generated summary response
      setMessages(prev => [...prev, { role: "model", text: data.summary }]);
    } catch (err) {
      console.error(err);
      setError("Failed to route request. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
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
    } catch (err) {
      console.error(err);
      setError("Communication failed.");
    } finally {
      setIsLoading(false);
    }
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
      {/* Header */}
      <header className="w-full bg-white/80 backdrop-blur-xl border-b border-slate-100 flex items-center justify-center p-4 sticky top-0 z-50 transition-all">
        <div className="w-full max-w-6xl flex items-center justify-between px-2">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={resetApp}>
            <div className="p-2.5 bg-slate-900 rounded-2xl text-white shadow-xl shadow-slate-200 group-hover:scale-105 transition-transform duration-300">
              <MapPin size={22} className="text-blue-400 group-hover:animate-bounce" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter text-slate-900 leading-none">
                SMART ROUTER
              </h1>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {location ? `${location.city}, ${location.state}` : 'DETECTING LOCATION...'}
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
            {isChatMode && (
              <button 
                onClick={resetApp}
                className="p-2.5 bg-slate-100 text-slate-500 hover:text-slate-900 rounded-2xl transition-all hover:bg-slate-200"
              >
                <RefreshCcw size={20} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-6xl flex-1 flex flex-col items-center p-4 md:p-8">
        <AnimatePresence mode="wait">
          {!isChatMode ? (
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
                <h2 className="text-5xl md:text-8xl font-black text-slate-900 tracking-tighter leading-[0.85] uppercase">
                  {language === "en" ? "Citizen Help" : "नागरिक सहायता"}<br/>
                  <span className="text-blue-600">Simplified.</span>
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
              </div>

              <div className="bg-white p-4 rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-slate-100 relative w-full group transition-all hover:shadow-[0_32px_64px_-16px_rgba(37,99,235,0.1)]">
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
                        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-100 flex flex-col gap-4 group hover:border-blue-200 transition-all">
                          <div className="flex items-center justify-between">
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                              <Shield size={24} />
                            </div>
                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">POLICE</span>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-black text-slate-900 uppercase leading-none">{localDirectory.police.stationName}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Local Jurisdiction</p>
                          </div>
                          <div className="mt-auto pt-4 flex flex-col gap-2">
                            <a href={`tel:${localDirectory.police.controlRoom}`} className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-900 hover:text-white rounded-xl transition-all text-xs font-black">
                              Control Room <span className="opacity-60">{localDirectory.police.controlRoom}</span>
                            </a>
                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(localDirectory.police.stationName + ' ' + location.city)}`} target="_blank" className="flex items-center justify-center p-3 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 transition-all">
                              View On Maps
                            </a>
                          </div>
                        </div>

                        {/* Municipality Card */}
                        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-100 flex flex-col gap-4 group hover:border-amber-200 transition-all">
                          <div className="flex items-center justify-between">
                            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-600 group-hover:text-white transition-colors">
                              <Landmark size={24} />
                            </div>
                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">CIVIC</span>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-black text-slate-900 uppercase leading-none">{localDirectory.municipality.officeName}</p>
                            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase">
                              <Clock size={10} /> {localDirectory.municipality.hours}
                            </div>
                          </div>
                          <div className="mt-auto pt-4 flex flex-col gap-2">
                            <a href={`tel:${localDirectory.municipality.contact}`} className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-900 hover:text-white rounded-xl transition-all text-xs font-black">
                              Public Helpline <span className="opacity-60 font-mono text-[10px]">{localDirectory.municipality.contact}</span>
                            </a>
                            <button className="flex items-center justify-center p-3 text-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 transition-all">
                              File Complaint
                            </button>
                          </div>
                        </div>

                        {/* Utilities Card */}
                        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-100 flex flex-col gap-4 group hover:border-emerald-200 transition-all">
                          <div className="flex items-center justify-between">
                            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                              <Zap size={24} />
                            </div>
                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">UTILITIES</span>
                          </div>
                          <div className="space-y-4">
                            <div className="space-y-1">
                                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Electricity</p>
                                <a href={`tel:${localDirectory.utilities.electricityBoard.contact}`} className="flex items-center justify-between text-[11px] font-black text-slate-700 hover:text-emerald-600">
                                    {localDirectory.utilities.electricityBoard.name} <Phone size={10}/>
                                </a>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Water & Sewage</p>
                                <a href={`tel:${localDirectory.utilities.waterBoard.contact}`} className="flex items-center justify-between text-[11px] font-black text-slate-700 hover:text-emerald-600">
                                    {localDirectory.utilities.waterBoard.name} <Phone size={10}/>
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
          ) : (
            <motion.div 
              key="chat"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full h-[calc(100vh-140px)] flex flex-col lg:flex-row gap-8"
            >
              {/* Main Chat Interface */}
              <div className="flex-1 bg-white rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] border border-slate-100 flex flex-col overflow-hidden relative">
                <div className="p-6 bg-white border-b border-slate-50 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-blue-400 shadow-xl shadow-slate-200">
                      <Bot size={24} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900 uppercase tracking-tighter">Routing AI</h3>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Active Analysis</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div ref={scrollRef} className="flex-1 p-8 overflow-y-auto space-y-8 bg-slate-50/10 scroll-smooth custom-scrollbar">
                  <AnimatePresence>
                    {messages.map((msg, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`flex gap-4 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                          <div className={`p-6 rounded-[2rem] font-bold leading-[1.4] shadow-2xl ${
                            msg.role === 'user' 
                              ? 'bg-slate-900 text-white rounded-tr-none text-base border-slate-800' 
                              : 'bg-white text-slate-800 rounded-tl-none border-slate-50 text-lg shadow-slate-200/50'
                          }`}>
                            {msg.text}
                            {msg.isStreaming && <span className="inline-block w-1.5 h-4 ml-2 bg-blue-500 animate-pulse rounded-full align-middle" />}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <div className="p-6 bg-white border-t border-slate-50">
                  <div className="flex gap-3 bg-slate-50 p-2 rounded-[2rem] border border-slate-100 group focus-within:ring-4 focus-within:ring-slate-100 transition-all">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Ask for details or next steps..."
                      className="flex-1 bg-transparent border-none rounded-2xl px-6 py-4 text-lg focus:ring-0 font-bold placeholder:text-slate-300 transition-all"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={isLoading || !input.trim()}
                      className="p-5 bg-slate-900 text-white rounded-[1.5rem] hover:bg-blue-600 disabled:opacity-20 transition-all shadow-xl active:scale-95"
                    >
                      <Send size={24} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Data & Actions Sidebar */}
              <motion.aside 
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="w-full lg:w-[450px] flex flex-col gap-6"
              >
                {result && (
                  <>
                    {/* Urgency & Call Actions */}
                    <div className={`p-6 rounded-[2.5rem] flex flex-col gap-6 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border-2 ${
                      result.urgency === 'Emergency' 
                        ? 'bg-red-600 border-red-700 text-white' 
                        : result.urgency === 'Urgent' 
                          ? 'bg-amber-500 border-amber-600 text-white' 
                          : 'bg-slate-900 border-slate-800 text-white'
                    }`}>
                      <div className="flex items-center justify-between uppercase tracking-[0.2em] font-black text-[10px]">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={18} />
                          {result.urgency} STATUS
                        </div>
                        <span className="opacity-60">{mode === 'someone-else' ? 'Helping Someone Else' : 'Verified Number'}</span>
                      </div>
                      
                      <div className="space-y-4">
                        {mode === 'someone-else' && (
                          <div className="px-3 py-1 bg-white/20 rounded-lg text-[9px] font-black uppercase tracking-widest inline-block">
                            🌍 Target: {manualLocationInput}
                          </div>
                        )}
                        <h4 className="text-3xl font-black tracking-tighter leading-none uppercase">
                          {result.localContact ? `Call ${result.localContact}` : 'Immediate Help'}
                        </h4>
                        <div className="flex gap-2">
                          {result.urgency === 'Emergency' ? (
                            <>
                              <a href="tel:100" className="flex-1 py-4 bg-white text-red-600 rounded-3xl font-black text-sm text-center uppercase tracking-widest hover:scale-102 transition-transform">POLICE (100)</a>
                              <a href="tel:108" className="flex-1 py-4 bg-white text-red-600 rounded-3xl font-black text-sm text-center uppercase tracking-widest hover:scale-102 transition-transform">AMB (108)</a>
                            </>
                          ) : result.localContact ? (
                            <a href={`tel:${result.localContact}`} className="w-full py-5 bg-white text-slate-900 rounded-[2rem] font-black text-sm text-center uppercase tracking-[0.3em] flex items-center justify-center gap-3 shadow-2xl group transition-all">
                              <Phone size={18} className="animate-bounce" /> CALL LOCAL HELPLINE
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Detailed Info Card */}
                    <div className="bg-white p-10 rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] border border-slate-100 flex-1 space-y-10 flex flex-col">
                      <div className="space-y-4">
                          <div className="flex items-center gap-3">
                              <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-xl text-[9px] font-black uppercase tracking-widest border border-blue-100">{result.category}</span>
                              <span className="text-slate-100">|</span>
                              <span className="text-slate-300 text-[9px] font-black uppercase tracking-widest leading-none">{result.subcategory}</span>
                          </div>
                          <h3 className="text-4xl font-black text-slate-900 tracking-tighter leading-[0.8] uppercase">
                              {result.authorityName}
                          </h3>
                      </div>

                      <div className="space-y-8 flex-1">
                        <div className="space-y-6">
                          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">Mandatory Action Steps</p>
                          <div className="space-y-6">
                            {result.steps.map((step, idx) => (
                              <div key={idx} className="flex gap-5 group">
                                <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-900 rounded-2xl text-xs font-black shadow-sm group-hover:bg-slate-900 group-hover:text-white transition-all duration-300">
                                  {idx + 1}
                                </span>
                                <p className="text-slate-600 text-base font-bold leading-tight group-hover:text-slate-900 transition-colors">{step}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="pt-8 border-t border-slate-50 space-y-4">
                        {result.officialLink && (
                          <a 
                              href={result.officialLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between p-6 bg-slate-900 text-white rounded-[2rem] text-xs font-black shadow-2xl hover:translate-y-[-4px] transition-all uppercase tracking-widest group"
                          >
                              Access Official Portal <ChevronRight size={20} className="text-blue-400 group-hover:translate-x-2 transition-transform" />
                          </a>
                        )}
                        
                        <div className="flex items-center justify-between px-4">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Helpful?</span>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => setFeedback(true)}
                                className={`p-4 rounded-2xl transition-all ${feedback === true ? 'bg-green-100 text-green-600 scale-110 shadow-lg shadow-green-100' : 'bg-slate-50 text-slate-300 hover:text-slate-500'}`}
                              >
                                <ThumbsUp size={18} />
                              </button>
                              <button 
                                onClick={() => setFeedback(false)}
                                className={`p-4 rounded-2xl transition-all ${feedback === false ? 'bg-red-100 text-red-600 scale-110 shadow-lg shadow-red-100' : 'bg-slate-50 text-slate-300 hover:text-slate-500'}`}
                              >
                                <ThumbsDown size={18} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Local Directory in Sidebar */}
                    {localDirectory && (
                      <div className="space-y-4 pt-6 border-t border-slate-50">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">Local Directory</p>
                        <div className="grid grid-cols-1 gap-3">
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                                <Shield size={14} />
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-[10px] font-black text-slate-900 uppercase leading-none">{localDirectory.police.stationName}</p>
                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{localDirectory.police.controlRoom}</p>
                              </div>
                            </div>
                            <a href={`tel:${localDirectory.police.controlRoom}`} className="p-2 bg-white rounded-lg shadow-sm border border-slate-100 hover:bg-slate-900 hover:text-white transition-all">
                              <Phone size={12} />
                            </a>
                          </div>

                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
                                <Landmark size={14} />
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-[10px] font-black text-slate-900 uppercase leading-none">{localDirectory.municipality.officeName}</p>
                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{localDirectory.municipality.contact}</p>
                              </div>
                            </div>
                            <a href={`tel:${localDirectory.municipality.contact}`} className="p-2 bg-white rounded-lg shadow-sm border border-slate-100 hover:bg-slate-900 hover:text-white transition-all">
                              <Phone size={12} />
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

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
