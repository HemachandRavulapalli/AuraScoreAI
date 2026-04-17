
export interface RapidTweet {
  text: string;
  likes: number;
  replies: number;
  reposts: number;
  createdAt: string;
  type: "original" | "reply";
}

export interface RapidUserData {
  userId: string;
  avatarUrl?: string;
  followersCount?: number;
  displayName?: string;
  screenName?: string;
}

export interface RapidFetchResult {
  tweets: RapidTweet[];
  user: RapidUserData;
  debug: {
    resolvedUserId: string | null;
    resolvedDisplayName: string | null;
    resolvedScreenName: string | null;
    resolvedAvatarUrl: string | null;
    resolvedFollowers: number | null;
    userLookupSuccess: boolean;
    tweetsFetchSuccess: boolean;
    usedHardcodedId: boolean;
    usedCache: boolean;
    dataSource: "real" | "cache" | "mock";
    rapidApiError?: string | null;
  };
}

const TWEET_CACHE = new Map<string, { data: RapidFetchResult; timestamp: number }>();
const USER_ID_CACHE = new Map<string, RapidUserData>();
const CACHE_TTL = 60 * 60 * 1000; // 60 minutes

const DEBUG_USER_MAPPINGS: Record<string, string> = {
  "elonmusk": "44196397",
  "billgates": "21614114",
  "jack": "12"
};

export async function resolveUser(username: string): Promise<RapidUserData | null> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return null;

  try {
    // Using username as the query parameter as it's standard for this API, 
    // but the user requested screen_name = username logic.
    const url = `https://twitter241.p.rapidapi.com/user?username=${username}`;
    console.log(`[RapidAPI] Resolving ID for ${username}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'twitter241.p.rapidapi.com'
      }
    });

    if (!response.ok) {
      console.error(`[RapidAPI] User Lookup Error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log("[RapidAPI] Raw User Lookup Response:", JSON.stringify(data, null, 2));

    // Try multiple possible paths for user data
    const userResult = data?.result?.data?.user?.result || data?.data?.user?.result || data?.result;

    if (!userResult) {
      console.error("[RapidAPI] User result not found in response");
      return null;
    }

    const restId = userResult.rest_id || userResult.id_str || userResult.id;
    const legacy = userResult.legacy || userResult;

    if (!restId) {
      console.error("[RapidAPI] User ID (rest_id/id_str) not found in response");
      return null;
    }

    const userData: RapidUserData = {
      userId: restId,
      avatarUrl: legacy?.profile_image_url_https,
      followersCount: legacy?.followers_count,
      displayName: legacy?.name,
      screenName: legacy?.screen_name
    };

    console.log("[RapidAPI] Chosen Resolved User Object:", JSON.stringify(userData, null, 2));
    return userData;
  } catch (error) {
    console.error("[RapidAPI] User Lookup Exception:", error);
    return null;
  }
}

export async function fetchTweetsFromRapidAPI(username: string): Promise<RapidFetchResult> {
  const apiKey = process.env.RAPIDAPI_KEY;
  const lowerUsername = username.toLowerCase();
  
  // 1. Check valid tweet cache first
  const cached = TWEET_CACHE.get(lowerUsername);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[RapidAPI] Returning valid cached tweets for ${username}`);
    return {
      ...cached.data,
      debug: {
        ...cached.data.debug,
        usedCache: true,
        dataSource: "cache"
      }
    };
  }

  if (!apiKey) {
    console.error("[RapidAPI] Missing RAPIDAPI_KEY");
    return {
      tweets: [],
      user: { userId: "" },
      debug: {
        resolvedUserId: null,
        resolvedDisplayName: null,
        resolvedScreenName: null,
        resolvedAvatarUrl: null,
        resolvedFollowers: null,
        userLookupSuccess: false,
        tweetsFetchSuccess: false,
        usedHardcodedId: false,
        usedCache: false,
        dataSource: "mock",
        rapidApiError: "Missing RAPIDAPI_KEY"
      }
    };
  }

  // 2. Resolve User (Check permanent cache -> API -> Hardcoded fallback)
  let userData: RapidUserData | null = USER_ID_CACHE.get(lowerUsername) || null;
  let usedHardcodedId = false;
  let userLookupSuccess = !!userData;

  if (!userData) {
    console.log(`[RapidAPI] No cached ID for ${username}, calling lookup API...`);
    userData = await resolveUser(username);
    
    if (userData) {
      USER_ID_CACHE.set(lowerUsername, userData);
      userLookupSuccess = true;
    } else if (DEBUG_USER_MAPPINGS[lowerUsername]) {
      // Fallback testing only
      console.log(`[RapidAPI] Lookup failed, using hardcoded fallback for ${username}`);
      userData = {
        userId: DEBUG_USER_MAPPINGS[lowerUsername],
        screenName: username,
        displayName: username.charAt(0).toUpperCase() + username.slice(1)
      };
      usedHardcodedId = true;
      userLookupSuccess = true;
    }
  } else {
    console.log(`[RapidAPI] Using cached user ID for ${username}`);
  }

  const userId = userData?.userId;

  if (!userId) {
    console.error(`[RapidAPI] Could not resolve user ID for ${username}`);
    return {
      tweets: [],
      user: { userId: "" },
      debug: {
        resolvedUserId: null,
        resolvedDisplayName: null,
        resolvedScreenName: null,
        resolvedAvatarUrl: null,
        resolvedFollowers: null,
        userLookupSuccess: false,
        tweetsFetchSuccess: false,
        usedHardcodedId: false,
        usedCache: false,
        dataSource: "mock",
        rapidApiError: `Could not resolve user ID for ${username}`
      }
    };
  }

  try {
    const url = `https://twitter241.p.rapidapi.com/user-tweets?user=${userId}&count=20`;
    console.log(`[RapidAPI] Fetching tweets for ID: ${userId}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'twitter241.p.rapidapi.com'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[RapidAPI] Tweets Fetch Error: ${response.status}`, errorText);
      
      const isRateLimited = response.status === 429;
      
      // 3. If rate limited, try to use expired cache if available
      if (isRateLimited && cached) {
        console.log(`[RapidAPI] Rate limited (429), returning expired cache for ${username}`);
        return {
          ...cached.data,
          debug: {
            ...cached.data.debug,
            usedCache: true,
            dataSource: "cache",
            rapidApiError: "RapidAPI rate limited (429) - Using expired cache"
          }
        };
      }

      const errorMessage = isRateLimited 
        ? "RapidAPI rate limited (429)" 
        : `Tweets Fetch Error: ${response.status}`;

      return {
        tweets: [],
        user: userData,
        debug: {
          resolvedUserId: userId,
          resolvedDisplayName: userData.displayName || null,
          resolvedScreenName: userData.screenName || null,
          resolvedAvatarUrl: userData.avatarUrl || null,
          resolvedFollowers: userData.followersCount || null,
          userLookupSuccess,
          tweetsFetchSuccess: false,
          usedHardcodedId,
          usedCache: false,
          dataSource: "mock",
          rapidApiError: errorMessage
        }
      };
    }

    const data = await response.json();
    
    const tweets: RapidTweet[] = [];
    const instructions = data?.result?.timeline?.instructions || [];
    
    for (const instruction of instructions) {
      if (instruction.type === "TimelineAddEntries") {
        const entries = instruction.entries || [];
        
        for (const entry of entries) {
          const tweetResult = entry?.content?.itemContent?.tweet_results?.result;
          
          if (tweetResult && tweetResult.legacy) {
            const legacy = tweetResult.legacy;
            if (!legacy.full_text) continue;

            tweets.push({
              text: legacy.full_text,
              likes: legacy.favorite_count || 0,
              replies: legacy.reply_count || 0,
              reposts: legacy.retweet_count || 0,
              createdAt: legacy.created_at || new Date().toISOString(),
              type: legacy.in_reply_to_status_id_str ? "reply" : "original"
            });
          }
          if (tweets.length >= 20) break;
        }
      }
      if (tweets.length >= 20) break;
    }

    console.log(`[RapidAPI] Extracted Tweets: ${tweets.length}`);
    if (tweets.length > 0) {
      console.log("[RapidAPI] First 2 mapped tweets:", JSON.stringify(tweets.slice(0, 2), null, 2));
    }
    
    const result: RapidFetchResult = {
      tweets,
      user: userData,
      debug: {
        resolvedUserId: userId,
        resolvedDisplayName: userData.displayName || null,
        resolvedScreenName: userData.screenName || null,
        resolvedAvatarUrl: userData.avatarUrl || null,
        resolvedFollowers: userData.followersCount || null,
        userLookupSuccess,
        tweetsFetchSuccess: tweets.length > 0,
        usedHardcodedId,
        usedCache: false,
        dataSource: "real",
        rapidApiError: tweets.length === 0 ? "No tweets returned from RapidAPI" : null
      }
    };

    // Cache successful results (even if 0 tweets, as long as it wasn't an error)
    if (tweets.length > 0) {
      TWEET_CACHE.set(lowerUsername, { data: result, timestamp: Date.now() });
    }

    return result;
  } catch (error) {
    console.error("[RapidAPI] Exception:", error);
    return {
      tweets: [],
      user: { userId: "" },
      debug: {
        resolvedUserId: null,
        resolvedDisplayName: null,
        resolvedScreenName: null,
        resolvedAvatarUrl: null,
        resolvedFollowers: null,
        userLookupSuccess: false,
        tweetsFetchSuccess: false,
        usedHardcodedId: false,
        usedCache: false,
        dataSource: "mock",
        rapidApiError: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
