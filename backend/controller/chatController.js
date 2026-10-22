/**
 * Chat Controller
 * 
 * Thin controller — validates input, calls chatService, returns JSON.
 * No business logic lives here.
 */

const { processMessage } = require("../services/chatService");

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || null;

const handleChatMessage = async (req, res) => {
  try {
    const { message } = req.body;

    // Input validation
    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        intent: null,
        message: "Message is required and must be a string.",
      });
    }

    if (message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        intent: null,
        message: "Message cannot be empty.",
      });
    }

    if (message.length > 500) {
      return res.status(400).json({
        success: false,
        intent: null,
        message: "Message is too long. Please keep it under 500 characters.",
      });
    }

    // userId is set by optionalAuth middleware (null if not logged in)
    const userId = req.userId || null;

    // Forward to independent AI Chat Microservice if configured
    if (AI_SERVICE_URL) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const aiResponse = await fetch(`${AI_SERVICE_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, userId }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const data = await aiResponse.json();
        return res.status(aiResponse.status).json(data);
      } catch (forwardErr) {
        console.warn(
          "AI microservice forward failed, falling back to local chat service:",
          forwardErr.message
        );
        const fallbackResponse = await processMessage(message, userId);
        return res.status(fallbackResponse.success ? 200 : 500).json(fallbackResponse);
      }
    }

    // Default local execution
    const response = await processMessage(message, userId);
    return res.status(response.success ? 200 : 500).json(response);
  } catch (error) {
    console.error("chatController error:", error.message);
    return res.status(500).json({
      success: false,
      intent: null,
      message: "Internal server error. Please try again later.",
    });
  }
};

module.exports = { handleChatMessage };

