/**
 * AI Service — OpenRouter integration for AI Chat Microservice
 */

const OpenAI = require("openai");
const INTENT_CLASSIFICATION_PROMPT = require("../prompts/intentClassification");
const {
  PRODUCT_INFO_RESPONSE_PROMPT,
  PRODUCT_RECOMMENDATION_PROMPT,
  FASHION_ADVICE_PROMPT,
} = require("../prompts/responseGeneration");

const AI_MODEL = process.env.AI_MODEL || "deepseek/deepseek-chat-v3-0324";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "placeholder",
});

const chatCompletion = async (systemPrompt, userMessage, maxTokens = 500, expectJson = false) => {
  try {
    const options = {
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: maxTokens,
    };

    if (expectJson) {
      options.response_format = { type: "json_object" };
    }

    const response = await client.chat.completions.create(options);

    if (!response || !response.choices || response.choices.length === 0) {
      throw new Error("Invalid or empty response from AI provider.");
    }

    return response.choices[0].message.content.trim();
  } catch (error) {
    throw new Error(error.message);
  }
};

const classifyIntent = async (message) => {
  const responseText = await chatCompletion(INTENT_CLASSIFICATION_PROMPT, message, 500, true);

  const cleanedText = responseText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleanedText);

  const validIntents = [
    "PRODUCT_SEARCH",
    "PRODUCT_INFO",
    "PRODUCT_RECOMMENDATION",
    "FASHION_ADVICE",
    "ORDER_STATUS",
    "ORDER_HISTORY",
    "STORE_INFO",
    "OUT_OF_SCOPE",
  ];

  if (!parsed.intent || !validIntents.includes(parsed.intent)) {
    return { intent: "OUT_OF_SCOPE", filters: {} };
  }

  return {
    intent: parsed.intent,
    filters: parsed.filters || {},
  };
};

const generateResponse = async (intent, products, userMessage) => {
  const systemPrompt =
    intent === "PRODUCT_RECOMMENDATION"
      ? PRODUCT_RECOMMENDATION_PROMPT
      : PRODUCT_INFO_RESPONSE_PROMPT;

  const productSummary = products
    .slice(0, 10)
    .map(
      (p) =>
        `- ${p.name} (₹${p.price}, Category: ${p.category}, SubCategory: ${p.subCategory}, Sizes: ${p.sizes?.join(", ") || "N/A"})`
    )
    .join("\n");

  const prompt = `User's question: "${userMessage}"

Products found in our database (${products.length} total):
${productSummary || "No products found."}

Please respond to the user's question based on this data.`;

  return await chatCompletion(systemPrompt, prompt);
};

const generateFashionAdvice = async (message) => {
  return await chatCompletion(FASHION_ADVICE_PROMPT, message);
};

module.exports = { classifyIntent, generateResponse, generateFashionAdvice };
