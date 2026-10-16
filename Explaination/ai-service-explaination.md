# AI Chatbot Architecture & Technical Flow

This document explains the technical implementation of the Trendies AI Fashion Assistant. The chatbot uses a **Semantic Routing + RAG (Retrieval-Augmented Generation)** architecture to ensure the AI provides accurate, hallucination-free answers grounded in the real MongoDB database.

---

## 1. High-Level Architecture

The chatbot is NOT a simple "prompt-in, text-out" wrapper. It uses an **Orchestrator-driven Pipeline**:
1. **Semantic Routing:** The AI acts as a router to understand *what* the user wants (Intent Classification) and extracts structured search terms.
2. **Data Retrieval:** The Node.js backend takes those terms and queries the real MongoDB database.
3. **Response Generation (RAG):** The raw database data is sent *back* to the AI so it can generate a natural, conversational response based ONLY on real stock and prices.

---

## 2. Step-by-Step Flow

When a user types a message (e.g., *"Show me cheap winter jackets"*), here is exactly what happens:

### Step 1: Entry Point
The frontend sends an HTTP POST request containing the `userMessage`.
- **`routes/chatRoute.js`** receives the request.
- **`controller/chatController.js`** validates the user token and passes the message to the service layer.

### Step 2: Intent Classification (First AI Call)
- **`services/chatService.js`** (The Orchestrator) receives the message and calls `classifyIntent` in **`services/aiService.js`**.
- The AI is prompted using **`prompts/intentClassification.js`**.
- **What happens:** The AI does *not* answer the user. It strictly acts as a JSON parser. It reads *"Show me cheap winter jackets"* and outputs:
  ```json
  {
    "intent": "PRODUCT_SEARCH",
    "filters": { "subCategory": "Winterwear", "maxPrice": 1000, "searchTerm": "jackets" }
  }
  ```

### Step 3: Database Retrieval
- The Orchestrator (`chatService.js`) uses a `switch(intent)` statement.
- Because the intent is `PRODUCT_SEARCH`, it routes the request to **`services/productSearchService.js`**.
- This service takes the `filters` object and queries MongoDB (`Product.find(...)`), fetching the actual products from the database.

### Step 4: Final Response (Second AI Call - Optional)
- Depending on the intent, we might want a conversational response.
- For intents like `PRODUCT_INFO` or `PRODUCT_RECOMMENDATION`, the Orchestrator takes the raw MongoDB products and sends them *back* to the AI using `generateResponse()` in **`services/aiService.js`**.
- The AI uses prompts from **`prompts/responseGeneration.js`** to read the raw JSON and write a beautiful sentence: *"I found some great winter jackets for you starting at just ₹999!"*
- The final response (text + product cards) is returned to the frontend.

---

## 3. Detailed Role of Every File

Here is the exact purpose of every file created for the chatbot, when it gets called, and how it responds.

### 🔌 API Layer

#### 1. `backend/routes/chatRoute.js`
- **Role:** Defines the API endpoint `/api/chat`.
- **When it is called:** Every time the user clicks "Send" in the frontend chat bubble.
- **How it responds:** Forwards the request through the authentication middleware to the controller.

#### 2. `backend/controller/chatController.js`
- **Role:** The HTTP handler. Extracts the `message` from the request body and the `userId` (if the user is logged in).
- **When it is called:** Immediately after the route catches the request.
- **How it responds:** Calls `chatService.processMessage()`. Once the service finishes, it takes the final result and sends it back to the frontend as an HTTP 200 JSON response (e.g., `{ success: true, message: "...", products: [...] }`).

---

### 🧠 The Core Orchestrator & AI Communicator

#### 3. `backend/services/chatService.js` (The Orchestrator / "The Boss")
- **Role:** The central brain of the backend logic. It doesn't query the DB or talk to the AI directly; it just delegates tasks.
- **When it is called:** For every single message sent by the user.
- **How it responds:** 
  1. Calls `aiService.classifyIntent()` to find out what the user wants.
  2. Uses a huge `switch(intent)` statement to figure out which specific domain service to call next.
  3. Formats the final response object and returns it to the controller.

#### 4. `backend/services/aiService.js` (The AI Communicator)
- **Role:** The *only* file allowed to talk to the external OpenRouter/DeepSeek API. 
- **When it is called:** 
  - **Always:** At the start of every message to classify the intent (`classifyIntent`).
  - **Sometimes:** At the end of the flow to generate human-readable text (`generateResponse`, `generateFashionAdvice`, `generateOrderResponse`).
- **How it responds:** Makes a network request to the AI model using `max_tokens` and `response_format` limits, and returns the raw text (or JSON) that the AI generated.

---

### 📝 The Prompts (The AI's Rulebooks)

#### 5. `backend/prompts/intentClassification.js`
- **Role:** The prompt that turns the AI into a strict data-extraction router.
- **When it is called:** Passed to `aiService.js` during the very first step of every message.
- **How it responds:** It forces the AI to output *only* a JSON object containing the `intent` (e.g., `PRODUCT_SEARCH`) and `filters` (e.g., `{ category: "Men" }`), forbidding it from talking conversationally.

#### 6. `backend/prompts/responseGeneration.js`
- **Role:** Contains multiple prompts (`PRODUCT_INFO_RESPONSE_PROMPT`, `FASHION_ADVICE_PROMPT`, etc.) that give the AI its personality and rules (e.g., "Use ₹ symbols", "Be empathetic", "Don't sound robotic").
- **When it is called:** Passed to `aiService.js` *after* a database query is completed, to format the final answer.
- **How it responds:** Forces the AI to write a natural, 3-4 sentence text response grounded in the provided data.

---

### 🗄️ The Domain Services (Database Query Handlers)

#### 7. `backend/services/productSearchService.js`
- **Role:** Finds products based on extracted filters.
- **When it is called:** If the intent is `PRODUCT_SEARCH` or `PRODUCT_RECOMMENDATION`.
- **How it responds:** Converts the JSON filters into a MongoDB query (e.g., `$regex`, `$lte` for maxPrice), searches the `Product` collection, and returns an array of products.

#### 8. `backend/services/productInfoService.js`
- **Role:** Answers specific questions about a product (e.g., sizes, materials).
- **When it is called:** If the intent is `PRODUCT_INFO`.
- **How it responds:** Queries MongoDB for the mentioned product, then passes that raw DB data *back* to the AI to generate a natural text answer (e.g., "Yes, the denim jacket is 100% cotton!").

#### 9. `backend/services/orderQueryService.js`
- **Role:** Handles order tracking and history.
- **When it is called:** If the intent is `ORDER_STATUS` or `ORDER_HISTORY`.
- **How it responds:** Queries the `Order` collection for the specific `userId`. It filters through the user's past orders to find specific items, formats a human-readable text block showing the item names, price, and status, and returns it.

#### 10. `backend/services/storeInfoService.js`
- **Role:** Handles generic FAQ questions (shipping, returns, payment methods).
- **When it is called:** If the intent is `STORE_INFO`.
- **How it responds:** It does *not* talk to the AI or the Database. It simply uses raw JavaScript string matching (`.includes("return")`) to find the right hardcoded policy text (like the 7-day return policy) and returns it instantly.
