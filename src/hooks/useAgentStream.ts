import { useState } from "react";
import { useOmniStore } from "../store/omniStore";

export interface AgentMessage {
  id: string;
  type: "thought" | "result" | "tool_call";
  agent: string;
  content: string;
  timestamp: Date;
}

export const useAgentStream = (workspaceId: string) => {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const addWidgetToCanvas = useOmniStore((state) => state.addWidgetToCanvas);

  const handleSSEChunk = (chunk: string) => {
    const lines = chunk.split(/\r?\n/);
    let currentEvent = "";
    let currentData: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith("event: ")) {
        currentEvent = line.substring(7).trim();
      } else if (line.startsWith("data: ")) {
        currentData.push(line.substring(6));
      } else if (line === "" && currentData.length > 0) {
        // 空行で1つのイベントブロックが終了
        const joinedData = currentData.join("\n");

        if (currentEvent === "action") {
          try {
            const actionData = JSON.parse(joinedData);
            if (actionData.action === "add_widget") {
              addWidgetToCanvas(actionData.widget);
            }
          } catch (e) {
            console.error("Failed to parse action event data", e);
          }
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: Math.random().toString(),
              type:
                currentEvent === "completed" || currentEvent === "final_answer"
                  ? "result"
                  : "thought",
              agent: currentEvent === "tool_call" ? "Finance" : "Supervisor",
              content: joinedData,
              timestamp: new Date(),
            },
          ]);
        }

        currentEvent = "";
        currentData = [];
      }
    }
  };

  const sendMessage = async (text: string) => {
    setIsThinking(true);

    setMessages((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        type: "result",
        agent: "User",
        content: text,
        timestamp: new Date(),
      },
    ]);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/chat/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, stream: true }),
        },
      );

      if (!response.body) throw new Error("No response body");

      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += value;
        // 完全なSSEブロック（空行で終わる）を処理
        let parts = buffer.split("\n\n");
        buffer = parts.pop() || ""; // 最後の不完全な部分はバッファに残す

        for (const part of parts) {
          handleSSEChunk(part + "\n\n");
        }
      }
      if (buffer) {
        handleSSEChunk(buffer + "\n\n");
      }
    } catch (error) {
      console.error("Error in agent stream:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          type: "result",
          agent: "Supervisor",
          content: `Error: Could not connect to API Gateway. ${error}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return { messages, sendMessage, isThinking };
};
