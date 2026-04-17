/**
 * Twitter Score Service
 * 
 * Fetches data from the Vercel serverless backend.
 */

// --- Types ---

export interface TwitterProfile {
  username: string;
  display_name: string;
  bio: string;
  location: string;
  avatar_url: string;
  followers: number;
  following: number;
  tweet_count: number;
  joined: string;
  verified: boolean;
}

export interface EngagementStats {
  average_likes: number;
  average_comments: number;
  engagement_rate: number;
}

export interface ScoreBreakdown {
  authenticity: number;
  value: number;
  influence: number;
  activity: number;
}

export interface TwitterScoreResult {
  username: string;
  profile: TwitterProfile;
  engagement: EngagementStats;
  card2_score: number;
  breakdown: ScoreBreakdown;
  niches: string[];
  score_reasoning: string;
  from_cache: boolean;
  scored_at: string;
}

// --- Input Cleaning ---

export function cleanUsername(input: string): string {
  let username = input.trim();
  username = username.replace(/^@/, "");
  username = username.replace(/https?:\/\/(www\.)?(twitter|x)\.com\//, "");
  username = username.split("/")[0];
  username = username.split("?")[0];
  return username.toLowerCase();
}

export function validateUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{1,15}$/.test(username);
}

// --- Main Function ---

export async function analyzeTwitterUser(
  rawInput: string
): Promise<TwitterScoreResult> {
  const username = cleanUsername(rawInput);
  if (!validateUsername(username)) {
    throw new Error("INVALID_USERNAME");
  }

  try {
    const response = await fetch(`/api/analyze?username=${username}`);
    
    if (!response.ok) {
      if (response.status === 400) throw new Error("INVALID_USERNAME");
      if (response.status === 404) throw new Error("USER_NOT_FOUND");
      if (response.status === 422) throw new Error("UNPROCESSABLE_ENTITY");
      if (response.status === 429) throw new Error("RATE_LIMITED");
      throw new Error("FETCH_FAILED");
    }

    return await response.json();
  } catch (err: any) {
    if (err.message === "INVALID_USERNAME" || 
        err.message === "USER_NOT_FOUND" || 
        err.message === "UNPROCESSABLE_ENTITY" || 
        err.message === "RATE_LIMITED") {
      throw err;
    }
    console.error("API Call Error:", err);
    throw new Error("FETCH_FAILED");
  }
}
