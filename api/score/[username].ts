import { Redis } from "@upstash/redis"
import Groq from "groq-sdk"
import type { VercelRequest, VercelResponse } from "@vercel/node"

// --- Initialize Clients ---

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
})

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY!
const CACHE_EXPIRY_SECONDS = 21600 // 6 hours

// --- Types ---

interface TwitterProfile {
  username: string
  display_name: string
  bio: string
  location: string
  avatar_url: string
  followers: number
  following: number
  tweet_count: number
  joined: string
  verified: boolean
}

interface TweetData {
  like_count: number
  reply_count: number
  retweet_count: number
  text: string
  created_at: string
}

interface EngagementStats {
  average_likes: number
  average_comments: number
  engagement_rate: number
}

interface ScoreBreakdown {
  authenticity: number
  value: number
  influence: number
  activity: number
}

interface TwitterScoreResult {
  username: string
  profile: TwitterProfile
  engagement: EngagementStats
  card2_score: number
  breakdown: ScoreBreakdown
  niches: string[]
  score_reasoning: string
  from_cache: boolean
  scored_at: string
}

// --- Helpers ---

function cleanUsername(input: string): string {
  let username = input.trim()
  username = username.replace(/^@/, "")
  username = username.replace(
    /https?:\/\/(www\.)?(twitter|x)\.com\//,
    ""
  )
  username = username.split("/")[0]
  username = username.split("?")[0]
  return username.toLowerCase()
}

function validateUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{1,15}$/.test(username)
}

function safeGet(obj: any, ...paths: string[]): any {
  for (const path of paths) {
    const keys = path.split(".")
    let val = obj
    try {
      for (const key of keys) {
        val = val[key]
        if (val === undefined || val === null) break
      }
      if (val !== undefined && val !== null) return val
    } catch {
      continue
    }
  }
  return null
}

// --- RapidAPI Calls ---

async function fetchProfile(username: string): Promise<any> {
  const url = `https://twitter135.p.rapidapi.com/v2/UserByScreenName/?username=${username}`
  
  console.log("Calling RapidAPI URL:", url)
  console.log("API Key exists:", !!RAPIDAPI_KEY)
  console.log("API Key first 6 chars:", RAPIDAPI_KEY?.slice(0, 6))
  
  const response = await fetch(url, {
    headers: {
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": "twitter135.p.rapidapi.com"
    }
  })
  
  console.log("RapidAPI status:", response.status)
  
  const text = await response.text()
  console.log("RapidAPI raw response:", text.slice(0, 500))
  
  if (!response.ok) {
    throw new Error(`RAPIDAPI_ERROR: ${response.status} - ${text.slice(0, 200)}`)
  }
  
  return JSON.parse(text)
}

async function fetchTweets(userId: string): Promise<any> {
  const response = await fetch(
    `https://twitter135.p.rapidapi.com/v2/UserTweets/?id=${userId}&count=20`,
    {
      headers: {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": "twitter135.p.rapidapi.com"
      }
    }
  )
  if (!response.ok) throw new Error("TWEETS_FETCH_FAILED")
  return response.json()
}

// --- Groq Call ---

async function callGroq(
  profile: TwitterProfile,
  tweets: TweetData[],
  ageDays: number
): Promise<{
  content_quality_score: number
  niches: string[]
  score_reasoning: string
}> {
  const tweetSamples = tweets
    .slice(0, 10)
    .map(t => t.text)
    .filter(t => t.length > 0)
    .join("\n")

  const completion = await groq.chat.completions.create({
    model: "llama3-70b-8192",
    temperature: 0.4,
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content: "You are a social media analyst. Return only raw JSON. Never use markdown. Never explain."
      },
      {
        role: "user",
        content: `Analyze this Twitter profile and return only raw JSON.

Profile:
Username: ${profile.username}
Bio: ${profile.bio}
Followers: ${profile.followers}
Following: ${profile.following}
Verified: ${profile.verified}
Account Age: ${ageDays} days

Recent tweets:
${tweetSamples}

Return exactly this JSON:
{
  "content_quality_score": number between 0 and 10,
  "niches": ["word1","word2","word3","word4","word5"],
  "score_reasoning": "one sentence only"
}

content_quality_score:
0-3: spam, repetitive, low effort
4-6: average everyday content
7-10: educational, insightful, high value

Niches: single descriptive words from bio and tweets.
Examples: Educator Builder Founder Curator Designer
Investor Writer Developer Activist Creator Analyst
Coach Artist Engineer Gamer Musician Trader Researcher`
      }
    ]
  })

  try {
    const content = completion.choices[0].message.content?.trim() ?? ""
    const cleaned = content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim()
    return JSON.parse(cleaned)
  } catch {
    return {
      content_quality_score: 5,
      niches: [],
      score_reasoning: ""
    }
  }
}

// --- Redis Cache ---

async function getCache(
  username: string
): Promise<TwitterScoreResult | null> {
  try {
    const cached = await redis.get(`score:${username}`)
    if (!cached) return null
    return { ...(cached as TwitterScoreResult), from_cache: true }
  } catch {
    return null
  }
}

async function setCache(
  username: string,
  data: TwitterScoreResult
): Promise<void> {
  try {
    await redis.set(
      `score:${username}`,
      data,
      { ex: CACHE_EXPIRY_SECONDS }
    )
  } catch {
    // cache saving failed silently
  }
}

// --- Scoring Logic ---

function followersLogScale(followers: number): number {
  if (followers <= 0) return 0
  const rawLog = Math.log10(followers + 1)
  const score = Math.pow(rawLog, 3.2) * 2.1
  return Math.min(4000, Math.round(score * 100) / 100)
}

function postLogScale(count: number): number {
  if (count <= 0) return 0
  const rawLog = Math.log10(count + 1)
  const score = Math.pow(rawLog, 2.8) * 1.2
  return Math.min(50, Math.round(score * 100) / 100)
}

function ageLogScale(ageDays: number): number {
  if (ageDays <= 0) return 0
  const rawLog = Math.log10(ageDays + 1)
  const score = Math.pow(rawLog, 2.5) * 5.5
  return Math.min(100, Math.round(score * 100) / 100)
}

// --- Main Handler ---

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: true,
      message: "Method not allowed"
    })
  }

  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET")

  try {
    const raw = (
      req.query.username ?? 
      req.url?.split("/").pop()?.split("?")[0] ?? 
      ""
    ) as string

    console.log("Raw username from query:", req.query)
    console.log("Full request URL:", req.url)
    console.log("Extracted username:", raw)
    const username = cleanUsername(raw || "")

    if (!validateUsername(username)) {
      return res.status(400).json({
        error: true,
        message: "That doesn't look like a valid username"
      })
    }

    const cached = await getCache(username)
    if (cached) return res.status(200).json(cached)

    let profileData: any
    try {
      profileData = await fetchProfile(username)
    } catch {
      return res.status(404).json({
        error: true,
        message: "Account not found, private, or suspended"
      })
    }

    const user_id = safeGet(profileData, "data.user.result.rest_id", "data.id", "id")
    const display_name = safeGet(profileData, "data.user.result.legacy.name", "data.name", "name") ?? ""
    const bio = safeGet(profileData, "data.user.result.legacy.description", "data.description", "description") ?? ""
    const location = safeGet(profileData, "data.user.result.legacy.location", "data.location", "location") ?? ""
    const followers = safeGet(profileData, "data.user.result.legacy.followers_count", "data.public_metrics.followers_count", "followers_count") ?? 0
    const following = safeGet(profileData, "data.user.result.legacy.friends_count", "data.public_metrics.following_count", "friends_count") ?? 0
    const tweet_count = safeGet(profileData, "data.user.result.legacy.statuses_count", "data.public_metrics.tweet_count", "statuses_count") ?? 0
    const avatar_url = (safeGet(profileData, "data.user.result.legacy.profile_image_url_https", "data.profile_image_url", "profile_image_url_https") ?? "").replace("_normal", "_400x400")
    const verified = safeGet(profileData, "data.user.result.legacy.verified", "data.verified", "verified") ?? false
    const created_at = safeGet(profileData, "data.user.result.legacy.created_at", "data.created_at", "created_at") ?? ""

    let tweetsRaw: any[] = []
    try {
      const tweetsData = await fetchTweets(user_id)
      tweetsRaw = safeGet(tweetsData, "data.user.result.timeline_v2.timeline.instructions")
        ?.find((i: any) => i.type === "TimelineAddEntries")?.entries
        ?.map((e: any) => e.content?.itemContent?.tweet_results?.result)
        ?.filter(Boolean) ?? 
        tweetsData?.data?.data ??
        tweetsData?.data ??
        tweetsData ?? []
      if (!Array.isArray(tweetsRaw)) tweetsRaw = []
    } catch {
      tweetsRaw = []
    }

    const tweets: TweetData[] = tweetsRaw.map(t => ({
      like_count: safeGet(t, "public_metrics.like_count", "legacy.favorite_count") ?? 0,
      reply_count: safeGet(t, "public_metrics.reply_count", "legacy.reply_count") ?? 0,
      retweet_count: safeGet(t, "public_metrics.retweet_count", "legacy.retweet_count") ?? 0,
      text: safeGet(t, "text", "legacy.full_text") ?? "",
      created_at: safeGet(t, "created_at", "legacy.created_at") ?? ""
    }))

    const count = tweets.length || 1
    const totalLikes = tweets.reduce((s, t) => s + t.like_count, 0)
    const totalComments = tweets.reduce((s, t) => s + t.reply_count, 0)
    const totalRetweets = tweets.reduce((s, t) => s + t.retweet_count, 0)

    const average_likes = Number((totalLikes / count).toFixed(2))
    const average_comments = Number((totalComments / count).toFixed(2))
    let engagement_rate = Number((
      (totalLikes + totalComments + totalRetweets) /
      (Math.max(followers, 1) * count) * 100
    ).toFixed(2))

    if (engagement_rate < 0.01 && engagement_rate > 0) {
      engagement_rate = 0.01
    }

    let profileScore = 0
    if (avatar_url && !avatar_url.includes("default")) profileScore += 15
    if (bio.length > 0) profileScore += 15
    if (location.length > 0) profileScore += 10
    if (!/\d/.test(display_name)) profileScore += 10

    const followerScore = followersLogScale(followers)
    
    const ratio = following > 0 ? followers / following : followers
    let ratioScore = 0
    if (ratio < 0.5) ratioScore = 5
    else if (ratio < 1) ratioScore = 15
    else if (ratio < 3) ratioScore = 30
    else if (ratio < 10) ratioScore = 40
    else ratioScore = 50

    const postScore = postLogScale(tweet_count)

    const ageDays = Math.floor((Date.now() - new Date(created_at).getTime()) / (1000 * 60 * 60 * 24))
    const ageScore = ageLogScale(ageDays)

    let rawTotal = profileScore + followerScore + ratioScore + postScore + ageScore
    if (verified) rawTotal = rawTotal * 1.05
    const card2_score = Math.min(9999, Math.max(0, Math.round(rawTotal)))

    let auth = 0
    if (avatar_url && !avatar_url.includes("default")) auth += 5
    if (bio.length > 0) auth += 5
    if (location.length > 0) auth += 3
    if (ageDays > 1460) auth += 7
    else if (ageDays > 730) auth += 6
    else if (ageDays > 365) auth += 5
    else if (ageDays > 180) auth += 3
    else auth += 1
    
    const cleanUsernameCheck = !/\d/.test(username) && username.length < 12 && (username.match(/_/g) || []).length <= 1
    if (cleanUsernameCheck) auth += 5
    const authenticity = Math.min(25, auth)

    let value = 0
    const avgLen = tweets.reduce((s, t) => s + t.text.length, 0) / (tweets.length || 1)
    if (avgLen > 80) value += 5
    else if (avgLen > 30) value += 3
    else value += 1
    
    const withLinks = tweets.filter(t => t.text.includes("http")).length
    const linkRatio = withLinks / (tweets.length || 1)
    if (linkRatio > 0.3) value += 5
    else if (linkRatio > 0.1) value += 3
    else value += 1
    
    const originals = tweets.filter(t => !t.text.startsWith("RT @")).length
    const origRatio = originals / (tweets.length || 1)
    if (origRatio > 0.6) value += 5
    else if (origRatio > 0.3) value += 3
    else value += 1

    let influence = 0
    if (followers >= 10000) influence += 10
    else if (followers >= 5000) influence += 8
    else if (followers >= 3000) influence += 6
    else if (followers >= 1000) influence += 4
    else influence += 2
    
    if (ratio > 10) influence += 5
    else if (ratio > 3) influence += 4
    else if (ratio > 1) influence += 3
    else if (ratio > 0.5) influence += 2
    else influence += 1
    
    if (verified) influence += 5
    
    const avgRetweets = totalRetweets / (tweets.length || 1)
    const rtRate = avgRetweets / Math.max(followers, 1) * 100
    if (rtRate > 2) influence += 5
    else if (rtRate > 1) influence += 4
    else if (rtRate > 0.5) influence += 3
    else if (rtRate > 0.1) influence += 2
    else influence += 1
    influence = Math.min(25, influence)

    let activity = 0
    const tweetsPerDay = tweet_count / Math.max(ageDays, 1)
    if (tweetsPerDay > 5) activity += 10
    else if (tweetsPerDay > 2) activity += 9
    else if (tweetsPerDay > 0.5) activity += 7
    else if (tweetsPerDay > 0.1) activity += 4
    else activity += 1
    
    const lastTweetDate = new Date(tweets[0]?.created_at ?? 0)
    const daysSinceLast = Math.floor((Date.now() - lastTweetDate.getTime()) / (1000 * 60 * 60 * 24))
    if (daysSinceLast <= 1) activity += 5
    else if (daysSinceLast <= 7) activity += 4
    else if (daysSinceLast <= 14) activity += 3
    else if (daysSinceLast <= 30) activity += 2
    else if (daysSinceLast <= 60) activity += 1
    
    const replies = tweets.filter(t => t.text.startsWith("@")).length
    const replyRate = replies / (tweets.length || 1)
    if (replyRate > 0.3) activity += 10
    else if (replyRate > 0.2) activity += 8
    else if (replyRate > 0.1) activity += 6
    else if (replyRate > 0.05) activity += 4
    else activity += 2
    activity = Math.min(25, activity)

    const profileObj: TwitterProfile = {
      username,
      display_name,
      bio,
      location,
      avatar_url,
      followers,
      following,
      tweet_count,
      joined: created_at,
      verified
    }

    const groqResult = await callGroq(profileObj, tweets, ageDays)
    value = Math.min(25, value + groqResult.content_quality_score)

    const result: TwitterScoreResult = {
      username,
      profile: profileObj,
      engagement: {
        average_likes,
        average_comments,
        engagement_rate
      },
      card2_score,
      breakdown: {
        authenticity,
        value,
        influence,
        activity
      },
      niches: groqResult.niches,
      score_reasoning: groqResult.score_reasoning,
      from_cache: false,
      scored_at: new Date().toISOString()
    }

    await setCache(username, result)
    return res.status(200).json(result)

  } catch (error) {
    console.error("Handler error:", error)
    return res.status(500).json({
      error: true,
      message: "Something went wrong, please try again"
    })
  }
}
