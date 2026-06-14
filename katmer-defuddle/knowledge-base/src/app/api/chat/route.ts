import { streamText, generateText, tool, convertToModelMessages } from "ai";
import { z } from "zod";
import { getMcpClient } from "@/lib/mcp";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { getUserApiKey } from "@/app/settings/actions";

// We'll initialize the provider dynamically inside POST
function getAiProviderInfo() {
  const useGemini = process.env.USE_GEMINI === "true";
  return { useGemini };
}

function formatXPostToMarkdown(postData: any) {
  if (!postData || !postData.data) return "No data available";
  let md = "";
  for (const post of postData.data) {
    md += `### Post (${post.id})\n\n${post.text}\n\n---\n`;
  }
  return md;
}

export async function POST(req: Request) {
  try {
    const session = {
      user: { id: "local-user", name: "Local Admin", email: "admin@local" },
    }; // const session = await getServerSession(authOptions);
    if (false) {
      // if (!session || !session.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    console.log("Received body:", JSON.stringify(body, null, 2));

    // Some versions of ai-sdk/react send 'messages', others might send 'message' or just an array
    let messages = body.messages || [];
    if (!body.messages && Array.isArray(body)) {
      messages = body;
    } else if (body.message) {
      messages = [body.message];
    } else if (body.role && body.content) {
      messages = [body];
    }

    if (!messages || messages.length === 0) {
      throw new Error("No messages provided in the request");
    }

    // Sanitize messages so that `convertToModelMessages` doesn't crash on unknown parts
    // Also remove unsupported parts like `reasoning`, `step-start`, and `item_reference`.
    const sanitizedMessages = messages.map((m: any) => {
      let newParts = undefined;
      if (m.parts && Array.isArray(m.parts)) {
        newParts = m.parts.filter(
          (p: any) =>
            p.type === "text" ||
            p.type === "tool-invocation" ||
            p.type === "tool-result" ||
            p.type === "image" ||
            p.type === "file",
        );
      } else if (m.content) {
        newParts = [{ type: "text", text: m.content }];
      }

      const cleanMsg: any = {
        id: m.id,
        role: m.role,
        content: m.content || "",
      };
      if (newParts && newParts.length > 0) cleanMsg.parts = newParts;
      if (m.name) cleanMsg.name = m.name;
      if (m.toolInvocations) cleanMsg.toolInvocations = m.toolInvocations;

      return cleanMsg;
    });

    // Convert UI messages to model messages (removing frontend-specific fields)
    let modelMessages = await convertToModelMessages(sanitizedMessages);

    // Deep sanitize the core messages to remove any unsupported parts (like item_reference)
    // that cause crashes with local LLM providers.
    modelMessages = modelMessages.map((m: any) => {
      const cleanMsg = { ...m };

      // Remove providerMetadata if any, as Ollama doesn't support complex metadata injections
      if (cleanMsg.providerMetadata) {
        delete cleanMsg.providerMetadata;
      }

      if (Array.isArray(cleanMsg.content)) {
        cleanMsg.content = cleanMsg.content.filter((part: any) => {
          return (
            part.type === "text" ||
            part.type === "tool-call" ||
            part.type === "tool-result" ||
            part.type === "image" ||
            part.type === "file"
          );
        });

        // If all parts were filtered out, fallback to empty string
        if (cleanMsg.content.length === 0) {
          cleanMsg.content = "";
        }
      }
      return cleanMsg;
    });

    const mcpClient = await getMcpClient();
    if (!mcpClient) {
      return new Response("Failed to initialize MCP client", { status: 500 });
    }

    // Create tools dynamically based on MCP server's available tools
    const mcpTools: Record<string, any> = {};

    // We define specific wrapper tools that make it easier for the AI to understand
    // what to do, and then call the corresponding X API via MCP inside.

    mcpTools.listDocuments = {
      description:
        "Get the 'table of contents' (Index) of the user's knowledge base. Use this first to find which documents are relevant to the user's query.",
      parameters: z.object({
        category: z.string().optional().describe("Optional category filter"),
      }),
      execute: async ({ category }: any) => {
        try {
          const whereClause: any = { user_id: session.user.id };
          if (category) whereClause.category = category;

          const docs = await prisma.knowledgeDocument.findMany({
            where: whereClause,
            select: {
              id: true,
              kb_id: true,
              title: true,
              category: true,
              tags: true,
              updated_at: true,
            },
            orderBy: { updated_at: "desc" },
            take: 50,
          });

          if (docs.length === 0)
            return "No documents found in the knowledge base.";

          let indexStr = "Knowledge Base Index (Table of Contents):\n\n";
          docs.forEach((d) => {
            indexStr += `- ID: ${d.id} (KB${String(d.kb_id).padStart(7, "0")}) | Title: ${d.title} | Category: ${d.category} | Tags: ${d.tags.join(", ")}\n`;
          });
          return indexStr;
        } catch (e: any) {
          return `Error fetching document index: ${e.message}`;
        }
      },
    };

    mcpTools.readDocument = {
      description:
        "Read the full content of a specific document from the knowledge base using its ID.",
      parameters: z.object({
        id: z.string().describe("The unique ID of the document to read"),
      }),
      execute: async ({ id }: any) => {
        try {
          const doc = await prisma.knowledgeDocument.findUnique({
            where: { id, user_id: session.user.id },
          });
          if (!doc) return `Document with ID ${id} not found.`;
          return `Title: ${doc.title}\nCategory: ${doc.category}\nTags: ${doc.tags.join(", ")}\n\nContent:\n${doc.content}`;
        } catch (e: any) {
          return `Error reading document: ${e.message}`;
        }
      },
    };

    mcpTools.fetchAndSaveUserPosts = {
      description:
        "Fetch recent posts from a specific X (Twitter) user and save them to the knowledge base.",
      parameters: z.object({
        username: z
          .string()
          .describe("The X username (without @) to fetch posts from"),
        max_results: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of posts to fetch"),
      }),
      execute: async ({ username, max_results }: any) => {
        try {
          // 1. Get user ID from username
          const userRes = (await mcpClient.callTool({
            name: "getUsersByUsername",
            arguments: { username },
          })) as any;

          let userId = "";
          let rawUserRes = "";

          if (
            userRes.content &&
            userRes.content[0] &&
            userRes.content[0].type === "text"
          ) {
            rawUserRes = userRes.content[0].text;
            try {
              const userData = JSON.parse(rawUserRes);
              if (userData.data && userData.data.id) {
                userId = userData.data.id;
              }
            } catch (e) {
              console.error("Failed to parse user data", e);
            }
          }

          if (!userId) {
            return `Failed to find user ID for username: ${username}. Raw response: ${rawUserRes.substring(0, 100)}...`;
          }

          // 2. Get user's recent posts
          const postsRes = (await mcpClient.callTool({
            name: "getUsersPosts",
            arguments: {
              id: userId,
              max_results: max_results.toString(),
            },
          })) as any;

          let postData = null;
          if (
            postsRes.content &&
            postsRes.content[0] &&
            postsRes.content[0].type === "text"
          ) {
            try {
              postData = JSON.parse(postsRes.content[0].text);
            } catch (e) {
              return "Failed to parse posts data from X API.";
            }
          }

          if (!postData || !postData.data) {
            return `No posts found or failed to fetch posts for user ${username}.`;
          }

          // 3. Format to Markdown
          const markdownContent = formatXPostToMarkdown(postData);
          const title = `X Posts by @${username}`;

          // 4. Generate metadata via AI (Tagging, Category, Domain)
          let tags: string[] = ["x-post", username];
          let category = "Social Media";
          let domain = "General";

          try {
            const prompt = `
            Analyze the following X (Twitter) posts and provide a JSON response with 'tags' (array of strings, max 5), 'category' (string), and 'domain' (string).
            
            Posts Content:
            ${markdownContent.substring(0, 1500)}...
            
            Return ONLY valid JSON.
            `;

            let aiResponseText = "";
            const { useGemini } = getAiProviderInfo();
            if (useGemini) {
              const userKey = await getUserApiKey();
              const { createGoogleGenerativeAI } =
                await import("@ai-sdk/google");
              const google = createGoogleGenerativeAI({
                apiKey:
                  userKey ||
                  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
                  process.env.GEMINI_API_KEY ||
                  "",
              });
              const aiResponse = await generateText({
                model: google("gemini-2.5-pro") as any,
                prompt,
              });
              aiResponseText = aiResponse.text;
            } else {
              const { createOpenAI } = await import("@ai-sdk/openai");
              const ollamaProvider = createOpenAI({
                baseURL: "http://127.0.0.1:11434/v1",
                apiKey: "ollama",
              });
              const ollamaModelName = process.env.OLLAMA_MODEL || "gemma4";
              const aiResponse = await generateText({
                model: ollamaProvider(ollamaModelName),
                prompt,
              });
              aiResponseText = aiResponse.text;
            }

            try {
              // Basic JSON extraction
              const text = aiResponseText;
              const jsonStr = text.substring(
                text.indexOf("{"),
                text.lastIndexOf("}") + 1,
              );
              const aiData = JSON.parse(jsonStr);

              if (Array.isArray(aiData.tags)) tags = aiData.tags;
              if (aiData.category) category = aiData.category;
              if (aiData.domain) domain = aiData.domain;
            } catch (jsonErr) {
              console.warn("Failed to parse JSON from AI response", jsonErr);
            }
          } catch (e) {
            console.warn("AI metadata generation failed, using defaults", e);
          }

          // 5. Save to database
          const doc = await prisma.knowledgeDocument.create({
            data: {
              title,
              content: markdownContent,
              user_id: session.user.id,
              tags,
              category,
              domain,
            },
          });

          return `Successfully fetched ${postData.data.length} posts from @${username} and saved to knowledge base with ID: ${doc.id}.`;
        } catch (error: any) {
          console.error("Tool execution error:", error);
          return `Error executing tool: ${error.message}`;
        }
      },
    };

    mcpTools.searchXPosts = {
      description:
        "Search for recent posts on X (Twitter) matching a specific query.",
      parameters: z.object({
        query: z.string().describe("The search query"),
      }),
      execute: async (args: any) => {
        const { query } = args;
        try {
          const res = (await mcpClient.callTool({
            name: "searchPostsRecent",
            arguments: { query },
          })) as any;

          if (res.content && res.content[0] && res.content[0].type === "text") {
            return res.content[0].text;
          }
          return "No results or empty response.";
        } catch (error: any) {
          return `Error executing search: ${error.message}`;
        }
      },
    };

    const { useGemini } = getAiProviderInfo();
    let modelInstance;
    if (useGemini) {
      const userKey = await getUserApiKey();
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      const google = createGoogleGenerativeAI({
        apiKey:
          userKey ||
          process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
          process.env.GEMINI_API_KEY ||
          "",
      });
      modelInstance = google("gemini-2.5-pro") as any;
    } else {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const ollamaProvider = createOpenAI({
        baseURL: "http://127.0.0.1:11434/v1",
        apiKey: "ollama",
      });
      const ollamaModelName = process.env.OLLAMA_MODEL || "gemma4";
      modelInstance = ollamaProvider(ollamaModelName);
    }

    const result = await streamText({
      model: modelInstance,
      messages: modelMessages,
      tools: mcpTools,
      system: `
<system_prompt_version>4.2.1-omni-terminal</system_prompt_version>

<role_definition>
あなたは「Omni-Terminal」の最高司令官 (Supervisor Agent) です。
ユーザーの入力を解釈し、利用可能なツール(Tool Call)を発行するか、あるいは直接ユーザーに回答を生成してください。
</role_definition>

<cognitive_framework>
あなたは応答を生成する前に、必ず以下の「System 2」思考プロセスを実行しなければなりません。
1. [Intent Analysis]: ユーザーのクエリの真の意図は何か？（情報検索か、予測か、投稿か？）
2. [Data Dependency]: ユーザーの要求を満たすために不足しているデータは何か？
3. [Constraint Check]: ユーザーの要求がコンプライアンスに違反していないか？
</cognitive_framework>

<strict_constraints>
1. 【重要】もしユーザーがX（Twitter）の情報を求めた場合、推測で答えず必ずツール（searchXPosts または fetchAndSaveUserPosts）を使用してください。
2. ツールを使用した場合は、その結果の生データを出力するのではなく、ユーザーにとって分かりやすくフォーマットして解説してください。
3. 【重要】ユーザーの過去のドキュメントやナレッジについて聞かれた場合は、必ず「listDocuments」で目次（Index）を確認し、必要なファイルだけを「readDocument」で読んでから答えてください。不要なファイルまで一気に読んではいけません。
</strict_constraints>
`,
    });
    return result.toUIMessageStreamResponse();
  } catch (error: any) {
    console.error("Chat API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
}
