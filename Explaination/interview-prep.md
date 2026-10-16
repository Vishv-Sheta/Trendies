# E-Commerce Project: Interview Preparation Guide (With Code References)


This document contains 45 interview questions categorized by difficulty (Easy, Medium, Hard). **This version has been carefully corrected to reflect your actual project implementation.** Where an advanced feature (like Redis, Webhooks, or Vector Search) was mentioned in your original draft but not found in the code, it has been moved to a "Suggestion" section. These are excellent talking points for interviews when asked "how would you scale or improve this?"

---

## 🟢 Easy Category (Foundational Knowledge & Choices)

**1. Can you briefly explain what Google OAuth is and why you chose it over a traditional email/password system?**
> **Answer:** Google OAuth provides a frictionless onboarding experience. Instead of maintaining separate passwords, users authenticate via Firebase using their Google account. Once Firebase authenticates the user on the frontend, it sends their name and email to my backend, which either finds or registers them and issues an HTTP-only JWT cookie for session management.

*Reference Code / Deep Dive:*
```javascript
// Frontend (React) - Using Firebase for Google Sign-in
import { signInWithPopup } from 'firebase/auth';
import { auth, provider } from '../../utils/Firebase';

const googleSignin = async () => {
    const res = await signInWithPopup(auth, provider);
    const user = res.user;
    
    // Send user details to backend
    const result = await axios.post(serverUrl + "/api/auth/googlelogin", {
        name: user.displayName, 
        email: user.email
    }, { withCredentials: true });
};
```

**2. How did you implement product search in your application? Was it a simple text search or something more advanced?**
> **Answer:** The main store search is handled efficiently on the frontend. The application fetches the product catalog, and when a user types in the search bar, the React frontend filters the product list locally. However, for the AI chatbot, the backend executes a MongoDB query using case-insensitive regex (`$regex`) on both the product name and description based on terms extracted by the AI.

*Reference Code / Deep Dive:*
```javascript
// Frontend (Collection.jsx) - Local filtering
if (showSearch && search) {
  productCopy = productCopy.filter(item =>
    item.name && item.name.toLowerCase().includes(search.toLowerCase().trim())
  );
}

// Backend (productSearchService.js) - Chatbot Search
if (filters.searchTerm) {
  const searchRegex = new RegExp(filters.searchTerm, "i");
  query.$or = [
    { name: { $regex: searchRegex } },
    { description: { $regex: searchRegex } },
  ];
}
```

**3. What were the key filters available for products in your application, and how did they work?**
> **Answer:** The key filters included categories (Men, Women, Kids), sub-categories (TopWear, BottomWear, WinterWear), and specific price ranges (e.g., ₹0-₹50). When a user toggles these checkboxes on the frontend, a `useEffect` hook triggers an `applyFilter` function that dynamically filters the existing list of products in memory, providing an instant UI update.

*Reference Code / Deep Dive:*
```javascript
// Frontend (Collection.jsx) - Applying Filters locally
if (category.length > 0) {
  productCopy = productCopy.filter(item => {
    const itemCats = Array.isArray(item.category) ? item.category : [item.category];
    return itemCats.some(itemCat => 
      category.some(cat => cat.toLowerCase() === itemCat.toLowerCase().trim())
    );
  });
}
```
*Suggestion: As the catalog grows, this frontend filtering will become a bottleneck. You can mention in interviews that your next step is moving this filtering logic to the backend MongoDB queries with pagination.*

**4. Can you describe how the related product recommendations feature works at a high level?**
> **Answer:** The related product recommendations are calculated on the frontend. When viewing a specific product, the `RelatedProduct` component receives the current product's category and subcategory. It filters the globally available product list to find other items matching those categories (excluding the current item) and slices the top 4 results to display.

*Reference Code / Deep Dive:*
```javascript
// Frontend (RelatedProduct.jsx) - Finding related items
productCopy = productCopy.filter((item) => {
    const itemCats = Array.isArray(item.category) ? item.category : [item.category];
    return itemCats.some(c => matchCategories.includes(c));
});
productCopy = productCopy.filter((item) => currentProductId !== item._id);
setrelated(productCopy.slice(0, 4));
```

**5. What is Razorpay, and why did you select it as your payment gateway for this project?**
> **Answer:** Razorpay is a payment gateway that provides robust APIs for integrating online payments in India. I chose it because of its comprehensive documentation, support for various payment methods (cards, UPI), and its easy-to-use checkout modal that integrates smoothly with React.

*Reference Code / Deep Dive:*
```javascript
// Backend (orderController.js) - Initializing Razorpay order
const Razorpay = require('razorpay');
const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const options = {
    amount: amount * 100, // paise
    currency: currency.toUpperCase(),
    receipt: newOrder._id.toString()
};
await razorpayInstance.orders.create(options, ...);
```

**6. How does the Cash on Delivery (COD) flow differ from the online payment flow in your application?**
> **Answer:** For online payments, the user is presented with the Razorpay checkout modal, and the order is only marked as paid after successful verification. For COD, the process is synchronous; the order is saved to the database with `paymentMethod: 'cod'` and `payment: false`, and the user is instantly redirected to their orders page. In both flows, inventory stock is atomically reserved before the order is placed.

*Reference Code / Deep Dive:*
```javascript
// Backend (orderController.js) - COD Order Creation
const orderData = {
    items: stockResult.reservedItems,
    amount,
    userId,
    address,
    paymentMethod: 'cod',
    payment: false,
    date: Date.now()
}
const newOrder = new Order(orderData);
await newOrder.save();
```

**7. What are the main features of the admin dashboard you built?**
> **Answer:** The admin dashboard is a secure interface that allows store owners to manage core data. It includes features to add new products with image uploads (handled via Cloudinary), list all inventory, edit stock quantities for different sizes directly inline, and view incoming user orders to update their delivery statuses (e.g., Shipped, Delivered).

*Reference Code / Deep Dive:*
```javascript
// Admin (List.jsx) - Inline Stock Editing
const handleStockChange = (size, value) => {
  const stock = Math.max(0, parseInt(value) || 0);
  setEditSizes(prev => ({ ...prev, [size]: stock }));
};
```

**8. What tech stack did you use to build the admin dashboard and why?**
> **Answer:** I built the admin panel using React.js and Tailwind CSS, mirroring the main frontend stack for code consistency. I used Context API (`AdminContext`) for managing admin authentication state and Axios for making protected API requests to the Node.js backend.

*Reference Code / Deep Dive:*
```javascript
// Admin (AdminContext.jsx)
const getAdmin = async () => {
  try {
    const result = await axios.get(serverUrl + "/api/user/getCurrentAdmin", { withCredentials: true });
    setadminData(result.data);
  } catch (err) { ... }
}
```

**9. What is the purpose of the AI-powered fashion chatbot in your e-commerce app?**
> **Answer:** The chatbot serves as an interactive virtual assistant named Trendies Assistant. It helps users find products using natural language, offers personalized styling advice, provides real-time information about store policies, and allows authenticated users to quickly check their recent order history.

*Reference Code / Deep Dive:*
```javascript
// Frontend (Chatbot.jsx) - UI connecting to API
const sendMessage = async (text) => {
  // ...
  const response = await axios.post(
    serverUrl + "/api/chat",
    { message: userMessage },
    { withCredentials: true }
  );
  // Displays AI message and product cards if applicable
};
```

**10. You mentioned using the OpenRouter API. What exactly is that, and why use it?**
> **Answer:** OpenRouter API is a unified gateway that provides access to various Large Language Models (LLMs) through a single interface. I configured it to use the `deepseek/deepseek-chat-v3-0324` model via the OpenAI SDK wrapper. It provides cost-effectiveness and the flexibility to easily swap out underlying models without changing my code.

*Reference Code / Deep Dive:*
```javascript
// Backend (aiService.js)
const OpenAI = require("openai");
const AI_MODEL = "deepseek/deepseek-chat-v3-0324";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});
```

**11. What do you mean by "intent classification" in the context of your chatbot?**
> **Answer:** Intent classification is the process of determining what the user is trying to achieve. When a message comes in, I pass it to the AI with a strict system prompt that instructs it to classify the message into one of 8 specific intents (e.g., `PRODUCT_SEARCH`, `ORDER_STATUS`, `FASHION_ADVICE`) and extract relevant filters like category or max price, returning a pure JSON object.

*Reference Code / Deep Dive:*
```javascript
// Backend (intentClassification.js prompt)
const INTENT_CLASSIFICATION_PROMPT = `
... return a JSON object with the intent and any relevant filters.
1. PRODUCT_SEARCH
2. PRODUCT_INFO
3. PRODUCT_RECOMMENDATION
4. FASHION_ADVICE
...
{
  "intent": "INTENT_NAME",
  "filters": { "category": null, "searchTerm": null ... }
}
`;
```

**12. How does the chatbot handle natural language product searches?**
> **Answer:** Once the AI extracts the intent (`PRODUCT_SEARCH`) and filters (like `category`, `price`, `searchTerm`) into JSON, my Node.js backend uses those filters to dynamically construct a MongoDB query. It searches the database and returns the matched products along with a programmatic response message, completely avoiding a second LLM call to save time and cost.

*Reference Code / Deep Dive:*
```javascript
// Backend (productSearchService.js)
const buildQuery = (filters) => {
  const query = {};
  if (filters.category) {
    query.category = { $regex: new RegExp(filters.category, "i") };
  }
  if (filters.searchTerm) {
    const searchRegex = new RegExp(filters.searchTerm, "i");
    query.$or = [{ name: { $regex: searchRegex } }, { description: { $regex: searchRegex } }];
  }
  return query;
};
```

**13. Give me an example of the kind of "fashion advice" your chatbot can provide.**
> **Answer:** If a user asks, "What should I wear for a college party?", the initial AI call classifies the intent as `FASHION_ADVICE`. The backend then sends the user's message to the AI with a specialized prompt instructing it to act as a fashion expert, offering styling tips and suggesting clothing categories (without hallucinating fake products).

*Reference Code / Deep Dive:*
```javascript
// Backend (aiService.js / responseGeneration.js)
const FASHION_ADVICE_PROMPT = `
You are a fashion expert assistant for "Trendies"...
RULES:
1. Give practical, modern fashion advice.
...
5. You can suggest categories of clothing but NEVER invent specific product names or prices.
`;
```

**14. How does the chatbot track orders for a user?**
> **Answer:** The chatbot's endpoint uses an `optionalAuth` middleware. If the user is logged in, their `userId` is attached to the request. When the intent is classified as `ORDER_STATUS`, the backend uses that `userId` to query the MongoDB `Orders` collection for their most recent order, returning its status and payment state programmatically.

*Reference Code / Deep Dive:*
```javascript
// Backend (orderQueryService.js)
const getOrderStatus = async (userId) => {
  if (!userId) return { message: "Please log in to check your order status. 🔐" };
  
  const latestOrder = await Order.findOne({ userId }).sort({ date: -1 }).lean();
  return { 
    message: `Your latest order (₹${latestOrder.amount}) ... is currently: **${latestOrder.status}**.` 
  };
};
```

**15. What database did you use, and why did you choose MongoDB for this project?**
> **Answer:** I used MongoDB because its flexible, document-based schema is ideal for an e-commerce catalog where products might have varying attributes (like maps of sizes and quantities). It integrates seamlessly with Node.js and allows for rapid iteration.

*Reference Code / Deep Dive:*
```javascript
// Backend (productModel.js)
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    sizes: { 
        type: Map, 
        of: Number, // Stores size variants and stock counts (e.g., M: 10, L: 5)
        default: {} 
    }
});
```

---

## 🟡 Medium Category (Implementation & Architecture)

**1. Walk me through the exact authentication flow when a user clicks "Login with Google".**
> **Answer:** The user clicks the button on the frontend, which triggers Firebase's `signInWithPopup`. Firebase handles the actual Google authentication. Once successful, my frontend extracts the user's name and email from Firebase and sends them to my backend. The backend checks if the user exists in MongoDB (creating them if not), generates an application-specific JWT, and stores it in an HTTP-only cookie.

*Reference Code / Deep Dive:*
```javascript
// Backend (authController.js)
const googleLogin = async (req, res) => {
  let { name, email } = req.body;
  let user = await User.findOne({ email });
  if (!user) user = await User.create({ name, email });
  
  const token = await genToken(user._id);
  res.cookie("token", token, cookieOptions); // httpOnly cookie
  return res.status(200).json(user);
};
```

**2. How did you store the user's session state after a successful login?**
> **Answer:** On the backend, the JWT is stored in an `httpOnly`, `secure` cookie, preventing XSS attacks. On the frontend, a React Context (`UserContext`) makes a request to `/api/user/getCurrentUser` on load. If the cookie is valid, the backend returns the user data, which is then held in state to control the UI (like showing the profile icon vs login button).

*Reference Code / Deep Dive:*
```javascript
// Backend (authMiddleware.js)
const isAuth = (req, res, next) => {
  const token = req.cookies.token; 
  if (!token) return res.status(400).json({ message: "User not found" });

  const tokenVerify = jwt.verify(token, process.env.JWT_SECRET);
  req.userId = tokenVerify.userId; 
  next();
};
```

**3. For the main store filtering, did you perform the filtering on the frontend or backend? Why?**
> **Answer:** In my current implementation, the filtering is performed on the frontend. The backend sends the entire product catalog, and the React app filters the array based on selected categories, subcategories, and price ranges. While this creates a very snappy, instant UI response for a small catalog, it's not feasible for thousands of products.
> *[Suggestion: Mention that migrating to backend pagination and query-based filtering is the planned next step for scalability.]*

*Reference Code / Deep Dive:*
```javascript
// Frontend (Collection.jsx) - Applying multiple filters in-memory
if (priceRanges.length > 0) {
  const selectedRanges = PRICE_RANGES.filter(r => priceRanges.includes(r.key));
  productCopy = productCopy.filter(item =>
    selectedRanges.some(range => item.price >= range.min && item.price < range.max)
  );
}
```

**4. How did you implement the shopping cart?**
> **Answer:** The shopping cart is a hybrid approach. For logged-in users, the cart is persisted in MongoDB within the `User` document as an object mapping `productId` to `sizes` and `quantities`. On the frontend, `ShopContext` maintains a synchronized local copy of this state. When a user adds an item, the local state updates instantly for UI responsiveness, while an API call updates the database in the background.

*Reference Code / Deep Dive:*
```javascript
// Backend (cartController.js)
const cartData = userData.cartData || {};
if(cartData[itemId]){
    if(cartData[itemId][size]) cartData[itemId][size] += 1;
    else cartData[itemId][size] = 1;
} else {
    cartData[itemId] = {};
    cartData[itemId][size] = 1;
}
await User.findByIdAndUpdate(req.userId , {cartData});
```

**5. How do you handle Razorpay payment verification?**
> **Answer:** When a user completes a payment in the Razorpay checkout modal, Razorpay calls a success handler on the frontend. My frontend takes the `razorpay_order_id` and immediately sends it to my backend's `/verifyRazorpay` endpoint. The backend uses the Razorpay SDK to fetch the actual payment status directly from Razorpay's servers. If paid, it marks the order as complete; if failed, it releases the reserved inventory stock.

The Problem with the Current Approach
Right now, your payment flow looks like this:

The user pays on Razorpay.
Razorpay tells the user's browser (React frontend) that the payment was successful.
Your browser then calls your backend API (/verifyRazorpay) to update the database and mark the order as paid.
The Edge Case: What happens if the user makes the payment, but their phone dies, their internet drops, or they accidentally close the browser tab the exact millisecond the payment succeeds? Because the browser closed, Step 3 never happens. Razorpay has deducted their money, but your backend doesn't know about it. The order remains "Unpaid" in your database, the stock might be released, and you will have a very angry customer.

The Solution: Razorpay Webhooks
A Webhook is a direct server-to-server communication. If you implement webhooks, the flow changes:

The user pays on Razorpay.
Razorpay's servers send an HTTP request directly to your backend server (e.g., a new endpoint like /api/webhooks/razorpay) saying, "Hey, order_123 was just successfully paid."
Your backend updates the database.
Because webhooks communicate server-to-server, it completely bypasses the user's browser. It doesn't matter if the user closes the app, loses internet connection, or throws their computer out the window—your backend will still get the payment confirmation directly from Razorpay.

Why mention this in an interview?
Interviewers love this. It shows that you aren't just thinking about the "happy path" where everything works perfectly. By mentioning webhooks, you are proving that you understand edge cases, network failures, and how real-world, enterprise-level architectures handle fault tolerance.

*Reference Code / Deep Dive:*
```javascript
// Backend (orderController.js)
const verifyRazorpay = async (req, res) => {
    const { razorpay_order_id } = req.body
    const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id)
    if (orderInfo.status === 'paid') {
        await Order.findByIdAndUpdate(orderInfo.receipt, { payment: true })
        // ...
    } else {
        // Payment failed — release the reserved stock
        await releaseStock(order.items);
    }
}
```
*[Suggestion: Mention that for a fully production-grade system, implementing Razorpay Webhooks is best practice in case the user's browser closes before the success handler fires.]*

**6. How did you secure the admin dashboard to ensure only authorized personnel can access it?**
> **Answer:** The admin dashboard is protected by an `adminAuth` middleware. When the admin logs in, a JWT is issued specifically for them and stored in an HTTP-only cookie. Any request to an admin route (like adding/removing products or updating order statuses) passes through this middleware, which decodes the JWT and validates it.

*Reference Code / Deep Dive:*
```javascript
// Backend (adminAuth.js)
const adminAuth = async (req, res, next) => {
    const token = req.cookies.token;
    if(!token) return res.status(400).json({message:"Not Authorized"});
    
    const verifytoken = jwt.verify(token, process.env.JWT_SECRET);
    req.adminEmail = process.env.ADMIN_EMAIL;
    next();
}
```

**7. Can you explain how you grounded the AI chatbot in real-time product data?**
> **Answer:** When a user's intent is classified as `PRODUCT_INFO` or `PRODUCT_RECOMMENDATION`, the backend first queries MongoDB using extracted filters to find matching products. It limits the results to a small set (e.g., top 10), stringifies essential details (name, price, category), and injects them directly into the LLM's system prompt as context. The LLM is strictly instructed to only recommend products from that provided list.

*Reference Code / Deep Dive:*
```javascript
// Backend (aiService.js)
const productSummary = products
  .slice(0, 10)
  .map(p => `- ${p.name} (₹${p.price}, Category: ${p.category}, Sizes: ${p.sizes?.join(", ")})`)
  .join("\n");

const prompt = `User's question: "${userMessage}"
Products found in our database:
${productSummary}
Please respond to the user's question based on this data.`;
```

**8. If a user asks the chatbot a question completely unrelated to fashion, how is it handled?**
> **Answer:** The initial intent classification prompt instructs the AI to return an `OUT_OF_SCOPE` intent for anything not related to fashion or the store. My backend `switch` statement catches this and returns a standard, hardcoded response explaining that the bot is a fashion assistant, without making a second LLM call.

*Reference Code / Deep Dive:*
```javascript
// Backend (chatService.js)
case "OUT_OF_SCOPE":
default: {
  return {
    success: true,
    intent: "OUT_OF_SCOPE",
    message: "I'm the fashion assistant for Trendies. I can help you with products, clothing advice, shopping assistance, and orders.",
  };
}
```

**9. How do you handle stock availability during the checkout process?**
> **Answer:** I implemented an atomic stock reservation system. When a user initiates checkout (either COD or Razorpay), the backend iterates through their cart items and uses `findOneAndUpdate` with a query condition that checks if `stock >= requested_qty`. If it matches, it automatically decrements the stock. This prevents race conditions where two users buy the last item simultaneously.

*Reference Code / Deep Dive:*
```javascript
// Backend (stockService.js)
const product = await Product.findOneAndUpdate(
    {
        _id: item._id,
        [`sizes.${item.size}`]: { $gte: qty } // Condition: sufficient stock
    },
    {
        $inc: { [`sizes.${item.size}`]: -qty } // Atomic decrement
    },
    { new: true }
);
```

**10. How did you structure your MongoDB schema to handle past orders effectively?**
> **Answer:** The `Order` schema contains an `items` array which stores a snapshot of the products at the time of purchase. Instead of just storing references to Product IDs, the backend clones the product data (name, size, price, quantity) into the order. This ensures that if a product's price changes or it is deleted later, historical order receipts remain accurate.

*Reference Code / Deep Dive:*
```javascript
// Backend (orderController.js)
let orderItems = [];
for (const items in cartItem) {
  // ...
  const product = structuredClone(products.find((p) => p._id === items));
  product.size = item;
  product.quantity = cartItem[items][item];
  orderItems.push(product);
}
// Saved inside Order Document
```

---

## 🔴 Hard Category (Edge Cases, Scaling & Deep Dives)

**1. If someone buys the last item right before another user clicks "Place Order", how do you handle it gracefully?**
> **Answer:** Because of my atomic `findOneAndUpdate` logic in `stockService.js`, the second user's database update will simply return `null` (because the condition `stock >= qty` fails). The backend detects this, rolls back any other items that *were* successfully reserved for that user by incrementing them back, and returns an HTTP 409 Conflict. The frontend catches this, removes the out-of-stock items from the user's cart, and displays a toast notification explaining what happened.

*Reference Code / Deep Dive:*
```javascript
// Backend (stockService.js)
if (!product) {
    // Stock insufficient — skip this item
    failedItems.push({ ...item, availableQty: ... });
}

// Frontend (PlaceOrder.jsx) - Auto-correcting cart
if (err.response?.status === 409 && err.response.data.failedItems) {
    toast.error(err.response.data.message);
    let updatedCart = structuredClone(cartItem);
    err.response.data.failedItems.forEach((item) => {
        delete updatedCart[item._id][item.size];
    });
    setcartItem(updatedCart);
}
```

**2. How would you handle a scenario where the Razorpay payment window is closed by the user mid-payment?**
> **Answer:** My implementation anticipates this. When initiating Razorpay, I first atomically reserve the stock. If the Razorpay callback returns an error or if the verification endpoint detects the payment failed (e.g., status is not 'paid'), my backend executes a `releaseStock` function. This loops through the order items and increments the `sizes` stock back to its original state so other users can buy it.

*Reference Code / Deep Dive:*
```javascript
// Backend (stockService.js)
const releaseStock = async (items) => {
    for (const item of items) {
        await Product.findByIdAndUpdate(
            item._id,
            { $inc: { [`sizes.${item.size}`]: item.quantity } }
        );
    }
};
```

**3. Imagine OpenRouter API goes down. What fallback mechanisms have you implemented?**
> **Answer:** In the `chatService.js`, the entire intent classification and dispatch flow is wrapped in a high-level `try/catch` block. If the AI provider times out or returns a 500 error, the backend catches the exception and returns a graceful fallback response indicating the assistant is temporarily unavailable, preventing the UI from crashing or showing raw error traces.

*Reference Code / Deep Dive:*
```javascript
// Backend (chatService.js)
catch (error) {
  console.error("chatService SYSTEM_ERROR:", error.message);
  return {
    success: false,
    intent: "SYSTEM_ERROR",
    message: "The AI assistant is temporarily unavailable. Please try again later.",
  };
}
```

**4. How do you prevent users from double-clicking the "Place Order" button and creating duplicate orders?**
> **Answer:** On the frontend, I utilize React state (`isLoading`). As soon as the "Place Order" function is called, `setIsLoading(true)` is executed, which disables the submit button and changes its text to "Placing Order...". This prevents additional clicks while the async operations (stock reservation and order creation) resolve.
> *[Suggestion: Mention that for a robust backend, you would also implement an Idempotency-Key header stored in Redis to catch duplicate requests.]*

*Reference Code / Deep Dive:*
```javascript
// Frontend (PlaceOrder.jsx)
<button type="submit" disabled={isLoading} className={`... ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
  {isLoading ? 'Placing Order...' : 'Place Order'}
</button>
```

**5. How would you optimize search and chatbot grounding if the product catalog grew to 1 million items?**
> **Answer:** *[Suggestion]* Currently, my system uses MongoDB regex search (`$regex`), which scans documents and becomes O(N) slow at scale. To fix this, I would migrate to MongoDB Atlas Vector Search or a dedicated engine like Elasticsearch. By generating vector embeddings for product descriptions, the chatbot could use semantic search (cosine similarity) to instantly fetch the most relevant 5 items without scanning the entire DB.

**6. In Google OAuth, how do you handle token expiration without interrupting the user's session?**
> **Answer:** *[Suggestion]* Currently, the JWT expires after 7 days, requiring a hard re-login. To improve this, I would implement a dual-token system. The backend would issue a short-lived Access Token and a long-lived HTTP-only Refresh Token. An Axios interceptor on the frontend would catch 401 Unauthorized errors, automatically hit a `/refresh` endpoint to get a new Access Token, and seamlessly retry the failed request.

**7. How did you structure your AI service to keep latency low?**
> **Answer:** The primary optimization is that for the most common action—`PRODUCT_SEARCH`—the system only makes *one* LLM call to classify the intent and extract filters. The backend then queries the database and programmatically builds the response (e.g., "Here are 5 products I found"). A second LLM call is *only* made for complex advice intents where natural language generation is strictly necessary.

*Reference Code / Deep Dive:*
```javascript
// Backend (chatService.js) - Fast path for Search
case "PRODUCT_SEARCH": {
  const result = await searchProducts(filters); // DB Query
  return {
    success: true,
    intent: "PRODUCT_SEARCH",
    message: result.message, // Hardcoded string, NO 2nd LLM call
    products: result.products,
  };
}
```

**8. Explain the transaction management strategy when an order is placed.**
> **Answer:** Currently, I am using sequential asynchronous updates with atomic document-level operations (`findOneAndUpdate` with $inc) for stock, followed by saving the Order document. 
> *[Suggestion]* For true ACID compliance across multiple documents, I would implement MongoDB Transactions (`session.startTransaction()`). That way, if order creation fails after stock is deducted, the database engine would automatically rollback the stock changes without requiring manual `releaseStock` logic.

**9. How do you handle prompt injection attacks tricking the chatbot?**
> **Answer:** The system is inherently protected by its routing architecture. The user's input is never directly evaluated as code or DB queries. The first step forces the AI to output a strict JSON schema (Intent and predefined filters). My backend parses this JSON and heavily validates the intent against an allowed array (`validIntents`). If the AI outputs something anomalous due to an injection attempt, it defaults to `OUT_OF_SCOPE`.

*Reference Code / Deep Dive:*
```javascript
// Backend (aiService.js)
const validIntents = ["PRODUCT_SEARCH", "PRODUCT_INFO", "PRODUCT_RECOMMENDATION", ...];
if (!parsed.intent || !validIntents.includes(parsed.intent)) {
  return { intent: "OUT_OF_SCOPE", filters: {} };
}
```

**10. How do you maintain a fast UI for the product catalog?**
> **Answer:** The frontend uses React `useMemo` hooks extensively in `Collection.jsx`. By wrapping the filtered product list, total page calculation, and displayed products slice in `useMemo`, React avoids recalculating these arrays on every render unless the dependencies (like search term or selected filters) actually change, ensuring smooth UI performance even when toggling options.

*Reference Code / Deep Dive:*
```javascript
// Frontend (Collection.jsx)
const displayProducts = useMemo(() => {
  if (isRefinedView) {
    const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE;
    return filterProduct.slice(startIndex, startIndex + PRODUCTS_PER_PAGE);
  }
  return filterProduct;
}, [isRefinedView, filterProduct, currentPage]);
```
