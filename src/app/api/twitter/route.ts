import { NextResponse } from "next/server";
import { errorStatus, toResponseMessage } from "@/lib/errorMessage";
import { TwitterApi, type TweetPublicMetricsV2 } from "twitter-api-v2";

/**
 * この口が返すツイート 1 件。検索とユーザーの 2 経路で組み立てるので、
 * 両方が満たす形をここに 1 つ置く。検索のときだけ著者が引けないことが
 * あり（includes に載らない）、そのときは author が null になる。
 */
interface TweetSummary {
  id: string;
  text: string;
  createdAt?: string;
  author: {
    name: string;
    username: string;
    profileImageUrl?: string;
  } | null;
  metrics?: TweetPublicMetricsV2;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");
  const type = searchParams.get("type") || "search"; // 'search' or 'user'

  if (!query) {
    return NextResponse.json(
      { error: 'Query parameter "q" is required' },
      { status: 400 },
    );
  }

  // Use the Bearer Token for application-only authentication
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;

  if (!bearerToken) {
    console.warn("TWITTER_BEARER_TOKEN is not set.");
    return NextResponse.json(
      { error: "Twitter API keys not configured" },
      { status: 500 },
    );
  }

  try {
    const client = new TwitterApi(bearerToken);
    const roClient = client.readOnly;

    let tweets: TweetSummary[] = [];

    if (type === "search") {
      // Search for recent tweets
      const searchResult = await roClient.v2.search(query, {
        "tweet.fields": ["created_at", "author_id", "public_metrics"],
        expansions: ["author_id"],
        "user.fields": ["name", "username", "profile_image_url"],
        max_results: 10,
      });

      const includes = searchResult.includes;

      tweets = searchResult.tweets.map((tweet) => {
        const author = includes?.users?.find((u) => u.id === tweet.author_id);
        return {
          id: tweet.id,
          text: tweet.text,
          createdAt: tweet.created_at,
          author: author
            ? {
                name: author.name,
                username: author.username,
                profileImageUrl: author.profile_image_url,
              }
            : null,
          metrics: tweet.public_metrics,
        };
      });
    } else if (type === "user") {
      // Get a specific user's tweets
      const user = await roClient.v2.userByUsername(query);
      if (!user.data) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const userTimeline = await roClient.v2.userTimeline(user.data.id, {
        "tweet.fields": ["created_at", "public_metrics"],
        max_results: 10,
        exclude: ["retweets", "replies"],
      });

      tweets = userTimeline.tweets.map((tweet) => ({
        id: tweet.id,
        text: tweet.text,
        createdAt: tweet.created_at,
        author: {
          name: user.data.name,
          username: user.data.username,
        },
        metrics: tweet.public_metrics,
      }));
    }

    return NextResponse.json({ success: true, tweets });
  } catch (error) {
    console.error("Twitter API Error:", error);

    // Twitter の SDK は数値の code で返してくる（401 認証 / 403 権限）。
    // errorCode は文字列しか返さないので、数値はこちらで取る。
    const status = errorStatus(error);
    if (status === 401 || status === 403) {
      return NextResponse.json(
        {
          error:
            "Authentication failed. Please check your Twitter API keys and app permissions (Basic/Pro plan may be required for some endpoints).",
        },
        { status },
      );
    }

    return NextResponse.json(
      {
        error: toResponseMessage(
          error,
          "Failed to fetch data from Twitter API",
        ),
      },
      { status: 500 },
    );
  }
}
