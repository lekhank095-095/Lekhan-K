import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Search, 
  Mic, 
  MicOff, 
  Loader2, 
  ChevronRight, 
  AlertTriangle, 
  CheckCircle2, 
  ExternalLink,
  MapPin,
  MessageSquare,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  Globe
} from "lucide-react";
import { GoogleGenAI, Type } from "@google/genai";
import mappingData from "./mapping.json";

// Initialize AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface AnalysisResult {
  category: string;
  subcategory: string;
  urgency: "Low" | "Medium" | "Emergency";
  summary: string;
  steps: string[];
}

export default function App() {
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [feedback, setFeedback] = useState<boolean | null>(null);

  const recognitionRef = useRef<any>(null);

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

  const handleAnalyze = async () => {
    if (!input.trim()) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setFeedback(null);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [{ text: `Analyze this local help request: "${input}". 
            Language context: ${language === 'hi' ? 'Respond in Hindi where appropriate but keep JSON keys in English.' : 'English'}.
            Provide a JSON response with category, subcategory, urgency (Low, Medium, Emergency), a brief summary, and 3-5 specific action steps.` }]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING, enum: ["Civic", "Police", "Healthcare", "Documents", "Utilities", "Cybercrime", "Unknown"] },
              subcategory: { type: Type.STRING },
              urgency: { type: Type.STRING, enum: ["Low", "Medium", "Emergency"] },
              summary: { type: Type.STRING },
              steps: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["category", "subcategory", "urgency", "summary", "steps"]
          }
        }
      });

      const data = JSON.parse(response.text || "{}");
      setResult(data);
    } catch (err) {
      console.error(err);
      setError("Failed to analyze request. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const getMapping = (category: string) => {
    return (mappingData.categories as any)[category] || (mappingData.categories as any)["Civic"];
  };

  const getUrgencyData = (urgency: string) => {
    return (mappingData.urgency as any)[urgency] || (mappingData.urgency as any)["Low"];
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-8">
      {/* Header */}
      <header className="w-full max-w-2xl mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent rounded-xl text-white">
            <MapPin size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-tight">
              Local Help
            </h1>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Request Router
            </p>
          </div>
        </div>
        <button 
          onClick={() => setLanguage(lang => lang === "en" ? "hi" : "en")}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Globe size={14} />
          {language === "en" ? "English" : "हिन्दी"}
        </button>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-2xl space-y-6">
        {/* Input Card */}
        <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <MessageSquare size={20} className="text-accent" />
            {language === "en" ? "Describe your problem" : "अपनी समस्या बताएं"}
          </h2>
          
          <div className="relative group">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={language === "en" ? "e.g. Broken street light in block B..." : "जैसे कि: ब्लॉक बी में स्ट्रीट लाइट खराब है..."}
              className="w-full h-32 p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-accent/20 resize-none transition-all placeholder:text-slate-400 text-slate-700"
            />
            <div className="absolute bottom-4 right-4 flex gap-2">
              <button
                onMouseDown={startVoiceInput}
                onMouseUp={stopVoiceInput}
                onTouchStart={startVoiceInput}
                onTouchEnd={stopVoiceInput}
                className={`p-3 rounded-full transition-all flex items-center justify-center ${
                  isRecording 
                    ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-200" 
                    : "bg-white border border-slate-200 text-slate-500 hover:text-accent hover:border-accent"
                }`}
                title="Hold to speak"
              >
                {isRecording ? <MicOff size={20}/> : <Mic size={20}/>}
              </button>
            </div>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={isLoading || !input.trim()}
            className="w-full mt-4 bg-accent text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-accent/10 active:scale-[0.98]"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                <Search size={20} />
                {language === "en" ? "Find Solution" : "समाधान खोजें"}
              </>
            )}
          </button>
        </section>

        {/* Status Messages */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-red-50 p-4 rounded-2xl flex items-center gap-3 text-red-600 text-sm border border-red-100"
            >
              <AlertTriangle size={18} />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4 pb-12"
            >
              {/* Main Result Card */}
              <div className="bg-white p-6 rounded-3xl shadow-lg border border-slate-100">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-2 bg-accent/10 text-accent">
                      {result.category}
                    </span>
                    <h3 className="text-2xl font-bold text-slate-900 leading-tight">
                      {result.subcategory}
                    </h3>
                  </div>
                  <div className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 ${
                    result.urgency === 'Emergency' ? 'bg-red-50 text-red-600' :
                    result.urgency === 'Medium' ? 'bg-amber-50 text-amber-600' :
                    'bg-blue-50 text-blue-600'
                  }`}>
                    <AlertTriangle size={14} />
                    {getUrgencyData(result.urgency).label}
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl mb-6">
                  <p className="text-slate-600 text-sm italic font-medium leading-relaxed">
                    &quot;{result.summary}&quot;
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      <CheckCircle2 className="text-accent" size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Responsible Authority</p>
                      <p className="text-sm font-bold text-slate-800">{getMapping(result.category).authority}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-900 border-l-4 border-accent pl-3">
                      Recommended Steps
                    </h4>
                    <div className="space-y-2">
                      {result.steps.map((step, idx) => (
                        <motion.div 
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className="flex gap-3 p-3 bg-white border border-slate-50 rounded-xl shadow-sm"
                        >
                          <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-accent/10 text-accent rounded-full text-xs font-bold">
                            {idx + 1}
                          </span>
                          <p className="text-sm text-slate-600 leading-snug">{step}</p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col gap-3">
                  <a 
                    href={getMapping(result.category).website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex justify-between items-center p-4 bg-slate-900 text-white rounded-2xl font-semibold hover:bg-slate-800 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      Official Portal <ExternalLink size={16} />
                    </span>
                    <ChevronRight size={18} />
                  </a>
                  
                  {result.urgency === "Emergency" && (
                    <div className="p-4 bg-red-600 text-white rounded-2xl font-bold text-sm text-center shadow-lg shadow-red-200">
                      {getUrgencyData(result.urgency).action}
                    </div>
                  )}
                </div>
              </div>

              {/* Feedback Section */}
              <div className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <HelpCircle className="text-slate-400" size={20} />
                  <span className="text-sm font-semibold text-slate-600">Was this helpful?</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setFeedback(true)}
                    className={`p-2 rounded-xl transition-all ${feedback === true ? 'bg-green-100 text-green-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                  >
                    <ThumbsUp size={18} />
                  </button>
                  <button 
                    onClick={() => setFeedback(false)}
                    className={`p-2 rounded-xl transition-all ${feedback === false ? 'bg-red-100 text-red-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                  >
                    <ThumbsDown size={18} />
                  </button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-auto py-8 text-center">
        <p className="text-xs text-slate-400 font-medium">
          Connect with local services instantly • 2026
        </p>
      </footer>
    </div>
  );
}
