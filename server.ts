import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import { fetchTweetsFromRapidAPI } from "./src/lib/twitterApi.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes
  app.get("/api/analyze", async (req, res) => {
    const username = (req.query.username as string) || "exampleuser";
    
    try {
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

      let niche = ["Creator", "Educator", "Analyst", "Promoter"];
      if (process.env.GROQ_API_KEY) {
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
          console.error("Groq API error:", error);
        }
      }

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
        niches: niche
      };

      res.json(responseData);
    } catch (topLevelError) {
      console.error("[Top-level API Error]", topLevelError);
      res.status(500).json({ error: "Internal Server Error" });
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
