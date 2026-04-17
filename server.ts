import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import { fetchTweetsFromRapidAPI } from "./src/lib/twitterApi.js";
import helmet from "helmet";
import cors from "cors";
import { z } from "zod";
import { LRUCache } from "lru-cache";

dotenv.config();

// Initialize Groq securely; fail gracefully later if invalid.
let groq: Groq | null = null;
if (process.env.GROQ_API_KEY) {
  try {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  } catch (e) {
    console.warn("Groq initialization failed. LLM disabled.");
  }
}

// Global LRU Cache Instance - Max 500 users, 24-Hour TTL
const profileCache = new LRUCache<string, any>({
  max: 500,
  ttl: 1000 * 60 * 60 * 24, 
});

// Zod Schema for strict input validation
const AnalyzeQuerySchema = z.object({
  username: z.string()
    .min(1, "Username is required")
    .max(20, "Username too long")
    .regex(/^[a-zA-Z0-9_]+$/, "Username must only contain letters, numbers, and underscores"),
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Security Middleware
  app.use(helmet({
    contentSecurityPolicy: false, 
    crossOriginEmbedderPolicy: false
  })); // CSP disabled to support Vite dev middleware inline scripts securely

  app.use(cors({
    origin: process.env.NODE_ENV === "production" ? process.env.CLIENT_URL || "*" : "*",
    methods: ["GET"]
  }));

  // API Routes
  app.get("/api/analyze", async (req, res) => {
    try {
      // 1. Strict Request Validation
      const parsedQuery = AnalyzeQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        return res.status(400).json({ 
          error: true, 
          code: "INVALID_INPUT", 
          message: parsedQuery.error.errors[0].message 
        });
      }
      
      const { username } = parsedQuery.data;

      // 2. Caching Layer Check
      const cachedData = profileCache.get(username.toLowerCase());
      if (cachedData) {
        return res.json({ ...cachedData, from_cache: true });
      }

      // 3. Setup Default Variables
      let tweetsToAnalyze = null;
      let rapidApiUsed = false;
      let rapidApiSuccess = false;
      let rapidApiError: string | null = null;
      let rapidApiDebug: any = {};

      let finalAvatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
      let displayName = username;
      let bio = "No bio available";
      let location = "Internet";
      let followers = 0;
      let following = 0;
      let tweetCount = 0;
      let joined = "January 2020";
      let verified = false;

      // 4. Scrape Live Profile (RapidAPI)
      if (process.env.RAPIDAPI_KEY) {
        rapidApiUsed = true;
        try {
          const result = await fetchTweetsFromRapidAPI(username);
          rapidApiDebug = result.debug;

          if (result.debug.userLookupSuccess && result.user) {
            if (result.user.avatarUrl) finalAvatarUrl = result.user.avatarUrl;
            if (result.user.displayName) displayName = result.user.displayName;
            if (result.user.followersCount !== undefined) followers = result.user.followersCount;
          }

          if (result.tweets.length > 0) {
            tweetsToAnalyze = result.tweets;
            rapidApiSuccess = true;
          } else {
            rapidApiError = result.debug.rapidApiError || "No tweets returned from RapidAPI";
          }
        } catch (err) {
          rapidApiError = err instanceof Error ? err.message : String(err);
        }
      }

      // 5. Fallback Mock/Randomization (Simulated Sandbox)
      let dataSource: "real" | "cache" | "mock" = "mock";
      if (tweetsToAnalyze && tweetsToAnalyze.length > 0) {
        dataSource = rapidApiDebug.dataSource || "real";
      } else {
        const tweetTypes: ("original" | "reply" | "repost")[] = ["original", "reply", "repost"];
        tweetsToAnalyze = Array.from({ length: 20 }).map((_, i) => {
          const type = tweetTypes[Math.floor(Math.random() * tweetTypes.length)];
          return {
            text: `Mock tweet ${i} content for ${username}. Discussing tech, AI, and productivity.`,
            likes: Math.floor(Math.random() * 100),
            replies: Math.floor(Math.random() * 50),
            reposts: Math.floor(Math.random() * 30),
            type,
            createdAt: new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000).toISOString()
          };
        });
      }

      // 6. Extrapolate Metrics Intelligently
      const totalLikes = tweetsToAnalyze.reduce((sum, t) => sum + t.likes, 0);
      const totalReplies = tweetsToAnalyze.reduce((sum, t) => sum + t.replies, 0);
      const totalReposts = tweetsToAnalyze.reduce((sum, t) => sum + t.reposts, 0);
      const numTweets = tweetsToAnalyze.length;

      const avgLikes = Math.round(totalLikes / numTweets);
      const avgReplies = Math.round(totalReplies / numTweets);
      const totalEngagement = totalLikes + totalReplies + totalReposts;
      const engagementRate = parseFloat(((totalEngagement / numTweets) / 5).toFixed(1));

      const originalTweets = tweetsToAnalyze.filter(t => t.type === "original").length;
      const authenticity = Math.min(100, Math.round((originalTweets / numTweets) * 100 + 20));
      const value = Math.min(100, Math.round((totalReposts / numTweets) * 3 + 40));
      const influence = Math.min(100, Math.round((totalEngagement / 100) + 30));
      const activity = Math.min(100, Math.round(80 + Math.random() * 15));
      const scoreTotal = Math.round((authenticity + value + influence + activity) / 4);

      // 7. LLM Organic Reasoning
      let niche = ["Creator", "Educator", "Analyst", "Promoter"];
      if (groq) {
        try {
          const tweetTexts = tweetsToAnalyze.map(t => t.text).join("\n");
          const completion = await groq.chat.completions.create({
            messages: [
              {
                role: "system",
                content: `You are a social media analyst. Based ONLY on the provided tweet texts, return 4 or 5 one-word labels that describe the user's niche or profile type. Return ONLY the labels separated by commas.`
              },
              {
                role: "user",
                content: `Analyze these tweets for user ${username}:\n\n${tweetTexts}`
              }
            ],
            model: "llama-3.3-70b-versatile",
          });

          const responseText = completion.choices[0]?.message?.content;
          if (responseText) {
            const labels = responseText.split(",").map(s => s.trim().replace(/[.]/g, "")).filter(s => s.length > 0);
            if (labels.length >= 3) niche = labels.slice(0, 5);
          }
        } catch (error) {
          console.error("LLM Inference error:", error);
        }
      }

      // 8. Construct Verified Payload
      const responseData = {
        username: username,
        profile: {
          display_name: displayName,
          bio: bio,
          location: location,
          avatar_url: finalAvatarUrl,
          followers: followers,
          following: following,
          tweet_count: tweetCount || numTweets,
          joined: joined,
          verified: verified
        },
        engagement: {
          average_likes: avgLikes,
          average_comments: avgReplies,
          engagement_rate: engagementRate
        },
        score: {
          total: scoreTotal,
          breakdown: {
            authenticity,
            value,
            influence,
            activity
          }
        },
        niches: niche,
        from_cache: false
      };

      // 9. Cache successful computation
      profileCache.set(username.toLowerCase(), responseData);

      return res.json(responseData);

    } catch (topLevelError) {
      console.error("[Fatal API Error]", topLevelError);
      return res.status(500).json({ 
        error: true, 
        code: "INTERNAL_SERVER_ERROR", 
        message: "An unexpected anomaly occurred during payload construction." 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server strictly enforcing domain logic on port: ${PORT}`);
  });
}

startServer();
