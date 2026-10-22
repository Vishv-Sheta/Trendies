const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { processChatMessage } = require("./services/chatProcessor");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "ai-chat-service",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { message, userId } = req.body;

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

    const result = await processChatMessage(message, userId || null);
    return res.status(result.success ? 200 : 500).json(result);
  } catch (err) {
    console.error("ai-chat-service error:", err);
    return res.status(500).json({
      success: false,
      intent: null,
      message: "Internal server error in AI chat service.",
    });
  }
});

let server;
if (process.env.NODE_ENV !== "test") {
  server = app.listen(PORT, () => {
    console.log(`AI Chat Microservice running on port ${PORT}`);
  });
}

module.exports = { app, server };
