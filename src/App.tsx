import { useState, useEffect, useRef, FormEvent, FC, MouseEvent } from "react";
import { Search, AtSign, Heart, MessageCircle, TrendingUp, TrendingDown, CheckCircle2, User, Hash, AlignLeft, AlertCircle } from "lucide-react";
import { motion, AnimatePresence, animate } from "motion/react";
import { LOGO_BASE64 } from "./constants";
import { analyzeTwitterUser, TwitterScoreResult } from "./services/twitterScore";

const AnimatedNumber: FC<{ value: number; format?: (v: number) => string }> = ({ value, format = (v) => v.toFixed(2) }) => {
  const nodeRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (nodeRef.current) {
      const controls = animate(0, value, {
        duration: 1.5,
        ease: "easeOut",
        onUpdate(v) {
          if (nodeRef.current) nodeRef.current.textContent = format(v);
        }
      });
      return controls.stop;
    }
  }, [value, format]);
  return <span ref={nodeRef}>{format(0)}</span>;
};

// --- Types ---

interface AnalysisData {
  username: string;
  profile: {
    display_name: string;
    bio: string;
    location: string;
    avatar_url: string;
    followers: number;
    following: number;
    tweet_count: number;
    joined: string;
    verified: boolean;
  };
  engagement: {
    average_likes: number;
    average_comments: number;
    engagement_rate: number;
  };
  score: {
    total: number;
    grade: string;
    breakdown: {
      authenticity: number;
      value: number;
      influence: number;
      activity: number;
    };
    reasoning: string;
  };
  niches: string[];
  scraped_at: string;
  from_cache: boolean;
}

const formatNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num.toString();
};

// --- Components ---

const Bar: FC<{ width: string; label: string; index: number }> = ({ width, label, index }) => {
  const [mousePos, setMousePos] = useState(50);
  const [showIndicator, setShowIndicator] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePosition = (clientX: number) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setMousePos(percentage);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    updatePosition(e.clientX);
  };

  const handleClick = (e: MouseEvent) => {
    updatePosition(e.clientX);
    setShowIndicator(!showIndicator);
  };

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      onMouseLeave={() => setShowIndicator(false)}
      className="group relative cursor-pointer mb-1"
    >
      <div className="flex justify-between items-center mb-1 pr-2">
        <span className="text-xl font-condensed font-bold text-bg uppercase tracking-wide">{label}</span>
        <span className="text-xl font-condensed font-bold text-bg opacity-70">{Math.round(parseFloat(width))}%</span>
      </div>
      <div className="w-full h-4 bg-off-white rounded-full overflow-hidden border border-bg/10 shadow-inner">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 1.2, delay: 0.5 + index * 0.1, ease: "circOut" }}
          className="h-full bg-bg rounded-full group-hover:opacity-90 transition-opacity"
        />
      </div>
    </div>
  );
};

const SearchScreen: FC<{ 
  onSearch: (username: string) => void; 
  error: string | null;
}> = ({ onSearch, error }) => {
  const [username, setUsername] = useState("");

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (username.trim()) {
      onSearch(username);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center w-[1000px] h-[560px] relative"
    >
      <form 
        onSubmit={handleSubmit}
        className="relative w-[672px] group"
      >
        <div className="absolute left-6 top-1/2 -translate-y-1/2 text-bg/60">
          <AtSign size={24} />
        </div>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username..."
          className="w-full bg-red h-16 rounded-full px-16 text-2xl font-condensed text-bg placeholder:text-bg/40 outline-none transition-all focus:ring-4 focus:ring-red/20"
          autoFocus
        />
        <button 
          type="submit"
          className="absolute right-6 top-1/2 -translate-y-1/2 text-bg hover:scale-110 transition-transform cursor-pointer"
        >
          <Search size={32} strokeWidth={2.5} />
        </button>
      </form>
      
      {error && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-[65%] flex items-center gap-2 text-red-500 font-condensed text-xl bg-bg/80 px-4 py-2 rounded-lg border border-red-500/30"
        >
          <AlertCircle size={20} />
          {error}
        </motion.div>
      )}

      <p className="absolute bottom-12 text-off-white/60 text-2xl font-condensed tracking-wider">
        type your x username...
      </p>
    </motion.div>
  );
};

const LoadingScreen: FC = () => (
  <motion.div 
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="flex flex-col items-center justify-center w-[1000px] h-[560px] relative"
  >
    <div className="w-[66px] h-[66px] animate-spin-pause rounded-lg overflow-hidden">
      <img 
        src={LOGO_BASE64} 
        alt="Loading..." 
        className="w-full h-full object-cover" 
      />
    </div>
    <p className="absolute bottom-12 text-off-white/60 text-2xl font-condensed tracking-wider animate-dots">
      Analyzing
    </p>
  </motion.div>
);

import { toPng } from 'html-to-image';
import { Download, Share2, Twitter } from 'lucide-react';

const ResultScreen: FC<{ 
  data: TwitterScoreResult | null;
  trends: {
    likes: 'up' | 'down' | 'neutral';
    comments: 'up' | 'down' | 'neutral';
    rate: 'up' | 'down' | 'neutral';
  } | null;
  hueRotation: number;
}> = ({ data, trends, hueRotation }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!data) return null;

  const getTrendIcon = (type: 'up' | 'down' | 'neutral', size: number = 28) => {
    const Icon = type === 'down' ? TrendingDown : TrendingUp;
    return <Icon size={size} className="text-bg shrink-0" />;
  };

  const formatRate = (rate: number) => {
    if (rate > 0 && rate < 0.01) return "<0.01%";
    return `${rate.toFixed(2)}%`;
  };

  const generateImageFile = async (): Promise<{ dataUrl: string, file: File } | null> => {
    if (!cardRef.current) return null;
    const dataUrl = await toPng(cardRef.current, {
      cacheBust: true,
      backgroundColor: '#0F172A',
      style: { filter: `hue-rotate(${hueRotation}deg)` },
      filter: (node) => !node.classList?.contains('exclude-from-capture')
    });
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `AuraScore-${data.username}.png`, { type: 'image/png' });
    return { dataUrl, file };
  };

  const handleDownload = async () => {
    if (isDownloading) return;
    try {
      setIsDownloading(true);
      const img = await generateImageFile();
      if (!img) return;
      const link = document.createElement('a');
      link.download = img.file.name;
      link.href = img.dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to generate image', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShare = async () => {
    if (isDownloading) return;
    try {
      setIsDownloading(true);
      const img = await generateImageFile();
      if (!img) return;
      
      const shareData = {
        title: 'My AuraScore Profile',
        text: `Check out my genuine AuraScore intelligence dashboard for @${data.username}! #AuraScore`,
        files: [img.file]
      };

      if (navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        // Fallback gracefully back to purely downloading if browser doesn't support Web Share APIs natively
        const link = document.createElement('a');
        link.download = img.file.name;
        link.href = img.dataUrl;
        link.click();
        alert("Native sharing is not supported on this browser. The image was saved locally to share manually!");
      }
    } catch (err) {
      console.error('Failed to share image', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePostToX = () => {
    const text = encodeURIComponent(`Check out my genuine AuraScore intelligence dashboard for @${data.username}! Analysed by Gemini AI. #AuraScore #AI`);
    const url = encodeURIComponent(window.location.href);
    window.open(`https://x.com/intent/tweet?text=${text}&url=${url}`, '_blank');
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative w-[1000px] h-[560px] flex items-center justify-center mx-auto"
    >
      <div className="absolute inset-0" ref={cardRef}>
        {/* Central Hub */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex items-center justify-center">
          <div className="relative w-[251px] h-[251px] rounded-full overflow-hidden shadow-[0_0_21px_10px_rgba(217,217,217,0.6)]">
            <img 
              src={data.profile.avatar_url || LOGO_BASE64} 
              alt="Profile" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          
          {/* Connection Icons - Positioned precisely at intersections */}
          <div className="absolute top-[-125.5px] left-[17px] w-[66px] h-[66px] bg-off-white rounded-full flex items-center justify-center border-[2px] border-bg shadow-[0_4px_6.6px_3px_rgba(0,0,0,0.25)] scale-115">
            <User size={34} className="text-bg" strokeWidth={2.5} />
          </div>
          <div className="absolute top-[-125.5px] right-[17px] w-[66px] h-[66px] bg-off-white rounded-full flex items-center justify-center border-[2px] border-bg shadow-[0_4px_6.6px_3px_rgba(0,0,0,0.25)] scale-115">
            <CheckCircle2 size={34} className="text-bg" strokeWidth={2.5} />
          </div>
          <div className="absolute bottom-[-125.5px] left-[17px] w-[66px] h-[66px] bg-off-white rounded-full flex items-center justify-center border-[2px] border-bg shadow-[0_4px_6.6px_3px_rgba(0,0,0,0.25)] scale-115">
            <AlignLeft size={34} className="text-bg" strokeWidth={2.5} />
          </div>
          <div className="absolute bottom-[-125.5px] right-[17px] w-[66px] h-[66px] bg-off-white rounded-full flex items-center justify-center border-[2px] border-bg shadow-[0_4px_6.6px_3px_rgba(0,0,0,0.25)] scale-115">
            <Hash size={34} className="text-bg" strokeWidth={2.5} />
          </div>
        </div>

        {/* Top Left - STATS */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="absolute top-0 left-0 w-[480px] h-[260px] overflow-hidden"
        >
          <div className="card-shape w-full h-full scale-x-[-1]"></div>
          <div className="absolute inset-0 pl-14 pr-36 py-10 flex flex-col justify-center gap-4">
            <div className="flex items-center gap-6">
              <Heart size={36} className="text-bg shrink-0" />
              <div className="flex items-baseline gap-1.5 ml-4">
                <span className="text-5xl font-condensed text-bg leading-none">
                  <AnimatedNumber value={data.engagement.average_likes} />
                </span>
                <span className="text-xl font-condensed text-bg/60">avg</span>
              </div>
              {getTrendIcon(trends?.likes || 'neutral')}
            </div>
            <div className="flex items-center gap-6">
              <MessageCircle size={36} className="text-bg shrink-0" />
              <div className="flex items-baseline gap-1.5 ml-4">
                <span className="text-5xl font-condensed text-bg leading-none">
                  <AnimatedNumber value={data.engagement.average_comments} />
                </span>
                <span className="text-xl font-condensed text-bg/60">avg</span>
              </div>
              {getTrendIcon(trends?.comments || 'neutral')}
            </div>
            <div className="flex items-center gap-6">
              <div className="w-9 h-9 border-[3px] border-bg rounded flex items-center justify-center shrink-0">
                 <TrendingUp size={22} className="text-bg" strokeWidth={3} />
              </div>
              <div className="flex items-baseline gap-1.5 ml-4">
                <span className="text-5xl font-condensed text-bg leading-none">
                  <AnimatedNumber value={data.engagement.engagement_rate} format={(v) => formatRate(v)} />
                </span>
              </div>
              {getTrendIcon(trends?.rate || 'neutral')}
            </div>
          </div>
        </motion.div>

        {/* Top Right - SCORE */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="absolute top-0 right-0 w-[480px] h-[260px] overflow-hidden"
        >
          <div className="card-shape w-full h-full"></div>
          <div className="absolute inset-0 pl-44 pr-8 flex items-center justify-center gap-1">
            <span className="inline-block text-[184px] font-condensed font-bold text-bg leading-none tracking-tighter scale-y-110">
              <AnimatedNumber value={data.card2_score} format={(v) => Math.round(v).toString()} />
            </span>
            <span className="text-5xl font-condensed font-bold text-bg/40 mt-16">/100</span>
          </div>
        </motion.div>

        {/* Bottom Left - TYPE */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="absolute bottom-0 left-0 w-[480px] h-[260px] overflow-hidden"
        >
          <div className="card-shape w-full h-full scale-x-[-1] scale-y-[-1]"></div>
          <div className="absolute inset-0 pl-8 pr-44 flex flex-col justify-center gap-3">
            {[
              { val: data.breakdown.authenticity, label: "Authenticity" },
              { val: data.breakdown.value, label: "Value" },
              { val: data.breakdown.influence, label: "Influence" },
              { val: data.breakdown.activity, label: "Activity" }
            ].map((bar, i) => (
              <Bar key={i} width={bar.val.toString()} label={bar.label} index={i} />
            ))}
          </div>
        </motion.div>

        {/* Bottom Right - NICHE */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="absolute bottom-0 right-0 w-[480px] h-[260px] overflow-hidden"
        >
          <div className="card-shape w-full h-full scale-y-[-1]"></div>
          <div className="absolute inset-0 pl-38 pr-4 py-10 flex flex-row flex-wrap content-center items-center justify-center gap-3">
            {data.niches.map((label, i) => (
              <div key={i} className="bg-bg text-off-white px-5 py-2 rounded-xl text-[26px] font-condensed font-bold leading-none tracking-tight shadow-sm border border-off-white/10 uppercase">
                #{label.replace(/^#/, '')}
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Action Bar */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1 }}
        className="exclude-from-capture absolute bottom-[-100px] left-1/2 -translate-x-1/2 flex items-center gap-6 p-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl z-[100]"
        style={{ filter: `hue-rotate(${hueRotation}deg)` }}
      >
        <button
          onClick={handleDownload}
          className="flex items-center gap-3 bg-red text-bg px-7 py-3 rounded-2xl font-condensed text-xl font-black shadow-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer uppercase tracking-tighter"
        >
          <Download size={20} strokeWidth={4} />
          {isDownloading ? '...' : 'Save PNG'}
        </button>
        <button
          onClick={handleShare}
          className="flex items-center gap-3 bg-off-white text-bg px-7 py-3 rounded-2xl font-condensed text-xl font-black shadow-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer uppercase tracking-tighter"
        >
          <Share2 size={20} strokeWidth={4} />
          Share
        </button>
        <div className="h-8 w-px bg-white/10 mx-1" />
        <button
          onClick={handlePostToX}
          className="flex items-center gap-3 bg-[#1DA1F2] text-white px-7 py-3 rounded-2xl font-condensed text-xl font-black shadow-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer uppercase tracking-tighter"
        >
          <Twitter size={20} fill="currentColor" />
          Post to X
        </button>
      </motion.div>
      
    </motion.div>
  );
};

// --- Main App ---

export default function App() {
  const [screen, setScreen] = useState<"search" | "loading" | "result">("search");
  const [randomInitHash] = useState(0); // Restored original Cyan/Teal brand color
  const [analysisData, setAnalysisData] = useState<TwitterScoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trends, setTrends] = useState<{
    likes: 'up' | 'down' | 'neutral';
    comments: 'up' | 'down' | 'neutral';
    rate: 'up' | 'down' | 'neutral';
  } | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 1000) {
        setScale(width / 1000);
      } else {
        setScale(1);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const cleanUsername = (input: string) => {
    let cleaned = input.trim();
    // Remove URL prefix if present
    cleaned = cleaned.replace(/^(https?:\/\/)?(www\.)?(x\.com|twitter\.com)\//, '');
    // Remove @ if present
    cleaned = cleaned.replace(/^@/, '');
    // Remove trailing slashes or query params
    cleaned = cleaned.split(/[/?#]/)[0];
    return cleaned;
  };

  const handleSearch = async (input: string) => {
    setError(null);
    setScreen("loading");

    try {
      const result = await analyzeTwitterUser(input);
      
      // Calculate trends
      const prevDataStr = localStorage.getItem("previous_twitter_score");
      const prevData = prevDataStr ? JSON.parse(prevDataStr) : null;

      if (prevData) {
        setTrends({
          likes: result.engagement.average_likes > prevData.average_likes ? 'up' : result.engagement.average_likes < prevData.average_likes ? 'down' : 'neutral',
          comments: result.engagement.average_comments > prevData.average_comments ? 'up' : result.engagement.average_comments < prevData.average_comments ? 'down' : 'neutral',
          rate: result.engagement.engagement_rate > prevData.engagement_rate ? 'up' : result.engagement.engagement_rate < prevData.engagement_rate ? 'down' : 'neutral',
        });
      } else {
        setTrends({ likes: 'neutral', comments: 'neutral', rate: 'neutral' });
      }

      // Save to localStorage for trend calculation
      localStorage.setItem("previous_twitter_score", JSON.stringify({
        username: result.username,
        average_likes: result.engagement.average_likes,
        average_comments: result.engagement.average_comments,
        engagement_rate: result.engagement.engagement_rate
      }));

      setAnalysisData(result);
      setScreen("result");
    } catch (err: any) {
      console.error("Analysis error:", err);
      setScreen("search");
      
      let message = "Something went wrong, please try again";
      if (err.message === "INVALID_USERNAME") message = "That doesn't look like a valid username";
      if (err.message === "RATE_LIMITED") message = "You're searching too fast — wait a minute";
      if (err.message === "API_RATE_LIMITED") message = "RapidAPI rate limit reached. Check your plan on RapidAPI.";
      if (err.message === "USER_NOT_FOUND") message = "Account not found, private, or suspended";
      if (err.message === "FETCH_FAILED") message = "Could not reach Twitter right now, try again soon";
      if (err.message === "API_FORBIDDEN") message = "API Key invalid or not subscribed to Twitter135 on RapidAPI";
      if (err.message === "CORS_ERROR") message = "Browser blocked the request. This API might not support client-side calls.";
      
      setError(message);
    }
  };

  // Calculate a unique hue rotation based on the high-entropy string hash map
  const getHueRotation = () => {
    if (screen === "result" && analysisData?.username) {
      let hash = 0;
      for (let i = 0; i < analysisData.username.length; i++) {
          hash = analysisData.username.charCodeAt(i) + ((hash << 5) - hash);
      }
      return Math.abs(hash % 360);
    }
    return randomInitHash;
  };

  const hueRotation = getHueRotation();

  return (
    <div 
      className="min-h-screen bg-bg flex items-center justify-center selection:bg-white/20 overflow-hidden transition-all duration-[1500ms] ease-in-out"
      style={{ filter: `hue-rotate(${hueRotation}deg)` }}
    >
      <div 
        style={{ 
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          width: '1000px',
          height: '560px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        <AnimatePresence mode="wait">
          {screen === "search" && (
            <SearchScreen 
              key="search" 
              onSearch={handleSearch} 
              error={error}
            />
          )}
          {screen === "loading" && (
            <LoadingScreen key="loading" />
          )}
          {screen === "result" && (
            <ResultScreen key="result" data={analysisData} trends={trends} hueRotation={hueRotation} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
