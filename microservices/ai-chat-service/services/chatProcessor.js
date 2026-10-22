/**
 * Chat Processor — Microservice Business Logic
 * Combines AI intent classification, fashion styling, and store policies.
 * Communicates with backend service via internal network DNS when needed.
 */

const { classifyIntent, generateResponse, generateFashionAdvice } = require("./aiService");
const { getStoreInfo } = require("./storeInfoService");

const OUT_OF_SCOPE_MESSAGE =
  "I'm the fashion assistant for Trendies. I can help you with products, clothing advice, shopping assistance, and orders. Feel free to ask me anything about fashion! 👗";

const BACKEND_SERVICE_URL = process.env.BACKEND_SERVICE_URL || "http://backend:3000";

const processChatMessage = async (userMessage, userId = null) => {
  if (!userMessage || typeof userMessage !== "string" || userMessage.trim().length === 0) {
    return {
      success: false,
      intent: null,
      message: "Please type a message so I can help you! 😊",
    };
  }

  const trimmedMessage = userMessage.trim();

  // Fast-path: Quick store policy check for common store inquiry keywords
  const msgLower = trimmedMessage.toLowerCase();
  const isStorePolicyQuery =
    /\b(shipping|delivery|dispatch|returns?|refunds?|exchanges?|payments?|pay|cod|upi|contact|support|phone|email)\b/i.test(
      msgLower
    );

  if (isStorePolicyQuery) {
    const result = getStoreInfo(trimmedMessage);
    return {
      success: true,
      intent: "STORE_INFO",
      message: result.message,
    };
  }

  try {
    // 1. Classify intent via OpenRouter AI
    const { intent, filters } = await classifyIntent(trimmedMessage);


    switch (intent) {
      case "FASHION_ADVICE": {
        const advice = await generateFashionAdvice(trimmedMessage);
        return {
          success: true,
          intent: "FASHION_ADVICE",
          message: advice,
        };
      }

      case "STORE_INFO": {
        const result = getStoreInfo(trimmedMessage);
        return {
          success: true,
          intent: "STORE_INFO",
          message: result.message,
        };
      }

      case "PRODUCT_SEARCH": {
        let products = [];
        try {
          const params = new URLSearchParams();
          if (filters && filters.category) params.append("category", filters.category);
          if (filters && filters.subCategory) params.append("subCategory", filters.subCategory);
          if (filters && filters.searchTerm) params.append("search", filters.searchTerm);
          if (filters && filters.bestseller) params.append("bestseller", "true");
          const catalogRes = await fetch(`${BACKEND_SERVICE_URL}/api/product/catalog?${params.toString()}`);
          if (catalogRes.ok) {
            const catalogData = await catalogRes.json();
            products = catalogData.products || [];
          }
        } catch (fetchErr) {
          console.warn("Could not query backend catalog:", fetchErr.message);
        }

        const message = products.length > 0 
          ? `I found ${products.length} product(s) matching your request! 🛍️`
          : "I couldn't find any products matching those exact criteria, but feel free to browse our collection! ✨";

        return {
          success: true,
          intent: "PRODUCT_SEARCH",
          message,
          products,
        };
      }

      case "PRODUCT_INFO":
      case "PRODUCT_RECOMMENDATION": {
        let products = [];
        try {
          const catalogRes = await fetch(`${BACKEND_SERVICE_URL}/api/product/catalog`);
          if (catalogRes.ok) {
            const catalogData = await catalogRes.json();
            products = catalogData.products || [];
          }
        } catch (fetchErr) {
          console.warn("Could not query backend catalog:", fetchErr.message);
        }

        let aiMessage = "Here are our top recommended styles for you!";
        try {
          aiMessage = await generateResponse(intent, products, trimmedMessage);
        } catch {
          // Graceful fallback if second LLM pass is unavailable
        }

        return {
          success: true,
          intent,
          message: aiMessage,
          products: products.slice(0, 5),
        };
      }

      case "ORDER_STATUS":
      case "ORDER_HISTORY": {
        if (!userId) {
          return {
            success: true,
            intent,
            message: "Please log in to view your order details and tracking status. 📦",
            order: null,
            orders: [],
          };
        }
        return {
          success: true,
          intent,
          message: "You can track your orders anytime from your Orders page in your profile. 📦",
          order: null,
          orders: [],
        };
      }

      case "OUT_OF_SCOPE":
      default: {
        return {
          success: true,
          intent: "OUT_OF_SCOPE",
          message: OUT_OF_SCOPE_MESSAGE,
        };
      }
    }
  } catch (error) {
    console.error("ai-chat-service SYSTEM_ERROR:", error.message);
    return {
      success: false,
      intent: "SYSTEM_ERROR",
      message: "The AI assistant is temporarily unavailable. Please try again later.",
    };
  }
};

module.exports = { processChatMessage };
