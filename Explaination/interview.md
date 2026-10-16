# TRENDIES â€” Complete Interview Preparation Guide
## Based on Actual Codebase Analysis (Not Assumptions)

---

# PART 1: PROJECT ARCHITECTURE (Reverse-Engineered from Code)

## Tech Stack (Verified)
| Technology | Where | Evidence |
|---|---|---|
| React 19 + Vite 7 | Frontend SPA | `frontend/package.json` |
| Tailwind CSS v4 | Styling | `@tailwindcss/vite` in deps |
| Express 5 | Backend API | `backend/package.json` |
| MongoDB Atlas + Mongoose 8 | Database | `backend/config/db.js` |
| JWT (jsonwebtoken) | Auth tokens | `backend/config/token.js` â€” 7-day expiry, stored in httpOnly cookies |
| Firebase Auth (Google) | Google OAuth popup on frontend | `frontend/utils/Firebase.js` â€” `signInWithPopup` |
| Razorpay | Online payments | `backend/controller/orderController.js` |
| Cloudinary | Image hosting | `backend/config/cloudinary.js` â€” stream upload to `trendies-products` folder |
| OpenRouter (DeepSeek v3) | AI chatbot | `backend/services/aiService.js` â€” model: `deepseek/deepseek-chat-v3-0324` |
| Framer Motion | Animations | `frontend/package.json` |
| Multer (memory storage) | File upload middleware | `backend/model/multer.js` |
| bcryptjs | Password hashing | `backend/controller/authController.js` |
| validator | Email validation | `backend/controller/authController.js` |

## Architecture Overview
```
Frontend (React+Vite on Render) â†’ Backend (Express on Render) â†’ MongoDB Atlas
                                    â†•                              â†•
                              Razorpay API                   Cloudinary CDN
                              OpenRouter API
                              Firebase Auth (frontend-only)
```

**Three separate deployments:**
- Frontend: `trendies-frontend-b7wv.onrender.com`
- Admin: `trendies-admin-o01i.onrender.com`  
- Backend: single Express server serving both

## MongoDB Models (5 collections + 1 utility)

### User Schema
- `name`, `email` (unique), `password` (hashed), `cartData` (Object, default `{}`)
- Cart stored as embedded object: `{ productId: { size: quantity } }`
- `timestamps: true`, `minimize: false` (preserves empty objects)

### Product Schema  
- `name`, `description`, `price`, `image1-4` (Cloudinary URLs), `category` ([String]), `subCategory` ([String]), `sizes` (Map of Stringâ†’Number for stock), `date`, `bestseller`

### Order Schema
- `userId` (String, NOT ObjectId ref), `items` (Array), `amount`, `address` (Object), `status` (default "Orderd Placed" â€” typo in code), `paymentMethod`, `payment` (Boolean), `date`

### Wishlist Schema
- `userId` (ObjectId refâ†’User), `productId` (ObjectId refâ†’Product)
- Compound unique index on `{userId, productId}`

### Idempotency Schema
- `key` (unique), `status` ("processing"/"completed"), `statusCode`, `response` (Mixed), `payloadHash`, `startedAt`, `createdAt` (TTL: 24 hours auto-delete)

## Authentication System (Verified)

### Regular Login/Register
1. Frontend sends email+password â†’ `POST /api/auth/login`
2. Backend validates with `validator.isEmail()`, bcrypt compare
3. JWT generated with `{userId}`, 7-day expiry
4. Token set as **httpOnly cookie** (`secure: true` + `sameSite: "None"` in production)

### Google OAuth Flow (Firebase-based, NOT traditional OAuth)
1. Frontend uses Firebase `signInWithPopup(auth, provider)` â€” popup opens Google consent
2. Firebase SDK handles the entire OAuth exchange client-side
3. Frontend extracts `user.displayName` and `user.email` from Firebase result
4. Sends `{name, email}` to `POST /api/auth/googlelogin`
5. Backend creates user if not exists (NO password stored for Google users)
6. JWT generated and set as cookie â€” same as regular login
7. **KEY INSIGHT**: Backend never sees Google tokens/passwords. Firebase handles verification.

### Admin Auth
- Hardcoded credentials in `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`)
- Plain-text comparison â€” `email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD`
- JWT generated with `{email}` payload (different from user JWT which has `{userId}`)
- **Security flaw**: `adminAuth` middleware only verifies JWT is valid, does NOT check if the email in the token matches `ADMIN_EMAIL`. Any valid JWT passes admin auth.

## Payment System (Verified)

### COD Flow
1. `reserveStock()` atomically decrements stock using `findOneAndUpdate` with `$gte` condition
2. Order created with `payment: false`, `paymentMethod: 'cod'`
3. Cart cleared immediately
4. When admin marks "Delivered", payment auto-set to `true` for COD orders

### Razorpay Flow
1. Stock reserved atomically â†’ Order created in MongoDB (`status: 'Pending Payment'`)
2. Razorpay order created via SDK with `receipt: mongoOrderId`
3. Frontend opens Razorpay checkout modal
4. On success: `POST /api/order/verifyrazorpay` â€” fetches Razorpay order, checks `status === 'paid'`, updates MongoDB
5. On modal dismiss: `POST /api/order/cancelrazorpay` â€” releases stock, sets status "Cancelled"
6. **Webhook backup**: `POST /api/webhooks/razorpay` â€” HMAC-SHA256 verification, handles `payment.captured` and `payment.failed`

### Idempotency System
- Frontend generates UUID via `crypto.randomUUID()` stored in `useRef`
- Sent as `Idempotency-Key` header
- Middleware uses MongoDB unique index as atomic lock
- Handles: duplicate requests, stale locks (2-min timeout), payload mutation detection

## AI Chatbot Architecture (Verified â€” CRITICAL SECTION)

### Flow
```
User Message â†’ chatController (validation) â†’ chatService (orchestrator)
  â†’ aiService.classifyIntent() [1st LLM call â€” DeepSeek via OpenRouter]
  â†’ Returns { intent, filters }
  â†’ Switch on intent:
     PRODUCT_SEARCH â†’ productSearchService.searchProducts(filters) â†’ MongoDB query â†’ programmatic response
     PRODUCT_INFO â†’ productInfoService â†’ MongoDB query â†’ 2nd LLM call for natural language
     PRODUCT_RECOMMENDATION â†’ productSearchService â†’ MongoDB query â†’ 2nd LLM call for styling advice
     FASHION_ADVICE â†’ aiService.generateFashionAdvice() â†’ standalone LLM call (no DB)
     ORDER_STATUS â†’ orderQueryService.getOrderStatus(userId) â†’ MongoDB query â†’ programmatic response
     ORDER_HISTORY â†’ orderQueryService.getOrderHistory(userId) â†’ MongoDB query â†’ programmatic response
     STORE_INFO â†’ storeInfoService â†’ static data, keyword matching â†’ programmatic response
     OUT_OF_SCOPE â†’ static fallback message
```

### What Makes It "Agentic" â€” Honest Analysis

**The system is an LLM-powered intent-based assistant with retrieval grounding. It is NOT a fully agentic system.**

What it DOES have:
1. **LLM-based intent classification** â€” the AI decides which action to take (8 intents)
2. **Filter extraction** â€” AI extracts structured filters from natural language
3. **Action dispatch** â€” classified intent routes to specific backend services
4. **Database grounding** â€” product data comes from MongoDB, not LLM imagination
5. **Multi-step flow** â€” some intents use 2 LLM calls (classify â†’ generate response)

What it does NOT have:
- âŒ No autonomous multi-step reasoning/planning
- âŒ No tool/function calling (OpenAI-style)
- âŒ No conversation memory (each message is independent â€” stated in code comments)
- âŒ No self-correction or retry loops
- âŒ No ability for AI to decide WHICH tools to call dynamically
- âŒ No vector embeddings or RAG pipeline

**Honest description**: "Intent-based LLM assistant with retrieval grounding" or "AI-powered chatbot with LLM intent classification and database-grounded responses"

### How to Defend "Agentic AI" in Interview

> "When I say Agentic AI, I mean the system uses an LLM to autonomously classify user intent and extract structured parameters from natural language â€” the AI decides which backend action to execute. It supports 8 intents including product search, recommendations, order tracking, and fashion advice. For product-related intents, the system queries MongoDB with AI-extracted filters, ensuring all responses are grounded in real data. I chose the term 'agentic' because the LLM acts as the decision-making layer â€” it's not just generating text, it's driving the application's behavior. That said, I'd describe it more precisely as an intent-based LLM assistant with retrieval grounding, rather than a fully autonomous agent with planning and tool-calling capabilities."

---

# PART 2: PROJECT DEFENSE MASTER SHEET

## 30-Second Introduction
> "Trendies is a full-stack e-commerce platform I built solo using the MERN stack. It features Google OAuth authentication, a product catalog with server-side filtering and pagination, Razorpay payment integration with webhook-based verification, an admin dashboard for product and order management, and an AI-powered fashion chatbot that uses OpenRouter's DeepSeek model for intent classification to enable natural language product search and order tracking â€” all grounded in real MongoDB data."

## 1-Minute Explanation
> "Trendies is a fashion e-commerce platform with three deployments â€” a React customer frontend, a React admin panel, and a shared Express backend, all connected to MongoDB Atlas. Authentication uses JWT stored in httpOnly cookies, with Google login via Firebase's signInWithPopup. The product catalog supports server-side filtering, search, sorting, and pagination through a dedicated catalog API endpoint. Payments use Razorpay with a pre-payment order creation pattern â€” I reserve stock atomically using MongoDB's findOneAndUpdate with a $gte condition before creating the Razorpay order, and I've implemented webhooks with HMAC-SHA256 verification as a safety net for browser-close scenarios. I also built an idempotency system using MongoDB's unique index as an atomic lock to prevent duplicate orders. The AI chatbot uses a two-phase architecture: first, DeepSeek classifies the user's intent and extracts filters, then the backend dispatches to the appropriate service â€” for product intents, it queries MongoDB with AI-extracted filters and either returns products directly or passes them to a second LLM call for natural language responses."

## 2-3 Minute Explanation
> Add to the above: "For stock management, I use MongoDB's document-level locking with $inc operations â€” the findOneAndUpdate only succeeds if the size has >= requested quantity, which prevents overselling even under concurrent requests. The order lifecycle handles partial stock failures â€” if some items are out of stock, the order proceeds with available items and the user is notified. For Razorpay, I've implemented three safety mechanisms: frontend verification on payment success, a cancel endpoint when users dismiss the modal (releases reserved stock), and Razorpay webhooks that catch edge cases like the user closing the browser mid-payment. The webhook uses HMAC-SHA256 signature verification and always returns 200 to prevent retry storms. The admin panel supports full product CRUD with Cloudinary image uploads â€” images are uploaded as buffers via Multer's memory storage, streamed to Cloudinary, and the returned secure URLs are stored in MongoDB. The chatbot's architecture separates concerns cleanly: chatController handles validation, chatService orchestrates the flow, aiService manages OpenRouter communication, and domain-specific services (productSearchService, orderQueryService, storeInfoService) handle data retrieval. The intent classification prompt defines 8 intents and includes filter extraction rules for structured MongoDB queries."

## Resume Claim Verification

| Resume Claim | Verified? | Evidence | What to Say |
|---|---|---|---|
| User authentication with Google OAuth | âœ… Partially | Uses Firebase `signInWithPopup` â€” NOT traditional server-side OAuth | "I use Firebase Auth for Google login â€” Firebase handles the OAuth flow client-side, then my backend creates/finds the user and issues a JWT" |
| Product search, filtering | âœ… Yes | `catalogProducts()` in productController â€” server-side with regex, price ranges, sort, pagination | "Server-side filtering with MongoDB queries â€” category, subcategory, price ranges, search, sort, pagination" |
| Related-product recommendations | âœ… Yes | `RelatedProduct.jsx` â€” queries catalog API with same category/subcategory | "I fetch products matching the same category and subcategory, excluding the current product" |
| Razorpay Payment Gateway | âœ… Yes | Full implementation with order creation, verification, cancellation, webhooks | Explain the complete flow |
| COD option | âœ… Yes | `PlacedOrder()` in orderController | "COD orders skip Razorpay, payment is marked true when admin sets status to Delivered" |
| Admin dashboard | âœ… Yes | Separate React app at `/Admin` with Add/List/Orders pages | "Separate React app for product CRUD, stock management, and order status updates" |
| AI-powered fashion chatbot | âœ… Yes | Full implementation in services/ and prompts/ | Explain the intent classification architecture |
| OpenRouter API with intent classification | âœ… Yes | `aiService.js` uses OpenRouter with DeepSeek model | "I use OpenRouter as a gateway to DeepSeek for intent classification" |
| Natural language product search | âœ… Yes | AI extracts filters â†’ `productSearchService.buildQuery()` â†’ MongoDB | Explain filter extraction to MongoDB query pipeline |
| Fashion advice | âœ… Yes | `FASHION_ADVICE` intent â†’ standalone LLM call | "Standalone LLM call without database â€” pure fashion styling advice" |
| Order tracking | âœ… Yes | `ORDER_STATUS`/`ORDER_HISTORY` intents â†’ orderQueryService | "Queries user's orders from MongoDB, formats programmatically" |
| Grounded in real-time MongoDB data | âœ… Yes | All product responses use MongoDB queries | "The LLM never invents products â€” it only references data from MongoDB queries" |
| **Agentic AI** | âš ï¸ Overstated | Intent classification + dispatch, but no autonomous planning/tool-calling | See defense script above â€” acknowledge it's intent-based, not fully agentic |

## Top 10 Project Weaknesses

| # | Weakness | Why It Matters | Honest Answer |
|---|---|---|---|
| 1 | Admin auth doesn't verify email in JWT | Any valid user JWT passes admin middleware | "I'd add a check comparing decoded.email to ADMIN_EMAIL, and ideally use role-based auth" |
| 2 | No conversation memory in chatbot | Each message is independent | "V1 has no memory. I'd add conversation history by passing previous messages to the LLM" |
| 3 | No rate limiting | API abuse possible | "I'd add express-rate-limit middleware, especially on auth and chat endpoints" |
| 4 | Secrets in .env committed to repo | Security risk | "In production I use Render's environment variables, but the .env should be in .gitignore" |
| 5 | No input sanitization for NoSQL injection | Regex in queries could be exploited | "I'd sanitize inputs with mongo-sanitize before using in regex queries" |
| 6 | Order.userId is String not ObjectId ref | No referential integrity | "I'd change to ObjectId with ref for proper population and data integrity" |
| 7 | No product update/edit endpoint | Admin can only add/remove | "I'd add a PUT endpoint for updating product details" |
| 8 | Status typo "Orderd Placed" | Looks unprofessional | "A typo that should be fixed â€” would need a data migration for existing orders" |
| 9 | Cart stored in User document | Not scalable for large carts | "I'd move cart to a separate collection for better performance" |
| 10 | No prompt injection protection | User could manipulate AI behavior | "I'd add input sanitization and output validation for the chatbot" |

## Things You Should NOT Claim

- âŒ Do NOT claim you use "RAG" â€” there are no vector embeddings or similarity search
- âŒ Do NOT claim "function calling" â€” the LLM doesn't use OpenAI function calling
- âŒ Do NOT claim "Redis caching" â€” no Redis anywhere
- âŒ Do NOT claim "session-based auth" â€” it's JWT in cookies
- âŒ Do NOT claim "traditional OAuth 2.0 server-side flow" â€” it's Firebase popup
- âŒ Do NOT claim "ML-based recommendations" â€” related products use simple category matching
- âŒ Do NOT claim "Razorpay signature verification on frontend verify endpoint" â€” `verifyRazorpay` fetches order status from Razorpay API, doesn't verify signature. Webhooks DO verify signature.
- âŒ Do NOT claim "autonomous agents" â€” the LLM classifies intent, backend code executes actions
# TRENDIES INTERVIEW â€” PART 2: EASY & MEDIUM QUESTIONS

---

# LEVEL 1 â€” EASY QUESTIONS (50 Questions)

## Q1. What is Trendies?
**Answer:** "Trendies is a full-stack fashion e-commerce platform I built solo. It allows users to browse, filter, and purchase clothing products with Razorpay or COD payment, and features an AI-powered fashion chatbot for natural language product search and styling advice."

**Follow-up:** Why fashion specifically?
**Answer:** "Fashion e-commerce presents interesting technical challenges â€” image-heavy product catalogs, size-based inventory management, and the opportunity to build an AI styling assistant that demonstrates natural language processing with real database grounding."

---

## Q2. What is the tech stack?
**Answer:** "React 19 with Vite for the frontend, Tailwind CSS v4 for styling, Express 5 with Node.js for the backend API, MongoDB Atlas with Mongoose for the database, JWT for authentication stored in httpOnly cookies, Firebase for Google login, Razorpay for payments, Cloudinary for image hosting, and OpenRouter with DeepSeek model for the AI chatbot."

**Follow-up:** Why MERN stack?
**Answer:** "JavaScript across the entire stack reduces context-switching. MongoDB's flexible schema was ideal for products with varying attributes. Express is lightweight and gives full control over middleware. React's component model works well for an e-commerce UI with reusable product cards and filters."

---

## Q3. Why MongoDB over PostgreSQL?
**Answer:** "MongoDB's document model naturally fits e-commerce data â€” products have varying attributes, cart data is a nested object stored directly on the user document, and order items are embedded arrays. The flexible schema let me iterate quickly. For stock management, I use MongoDB's atomic `findOneAndUpdate` with `$inc` operators, which provides document-level locking similar to row-level locks in SQL."

**Follow-up:** What would you choose differently for production?
**Answer:** "For a production system with complex relationships like order-product-user joins, I might consider PostgreSQL with JSONB columns for flexibility. MongoDB works well here because my queries are relatively simple â€” mostly document lookups and regex searches."

---

## Q4. How does Google OAuth work in your project?
**Answer:** "I use Firebase Authentication on the frontend. When the user clicks 'Sign in with Google', `signInWithPopup()` opens a Google consent popup. Firebase handles the entire OAuth exchange â€” my backend never sees Google tokens. After Firebase returns the user profile, my frontend sends just `{name, email}` to my backend's `/api/auth/googlelogin` endpoint. The backend creates the user if they don't exist (without a password), generates a JWT, and sets it as an httpOnly cookie."

**Follow-up:** Why Firebase instead of Passport.js?
**Answer:** "Firebase simplifies the Google OAuth flow â€” I don't need to manage OAuth callbacks, token exchange, or redirect URIs on my server. The tradeoff is that my backend trusts the frontend to send the correct Google email, which in a production system I'd verify by validating the Firebase ID token on the backend."

---

## Q5. How does user authentication work?
**Answer:** "JWT-based authentication with httpOnly cookies. On login/register, the backend generates a JWT containing `{userId}` with a 7-day expiry, and sets it as a cookie with `httpOnly: true`, `secure: true` in production, and `sameSite: 'None'` for cross-origin requests between my frontend and backend on Render."

**Follow-up:** Why cookies instead of localStorage?
**Answer:** "httpOnly cookies prevent XSS attacks from accessing the token via JavaScript. With `secure: true` and `sameSite: 'None'`, the cookie is sent automatically with every request, and I don't need to manually attach headers on the frontend."

---

## Q6. How does product search work?
**Answer:** "Server-side search using MongoDB regex. The `catalogProducts` endpoint accepts query parameters â€” search, category, subcategory, priceRanges, sort, page, limit. For text search, I use `{ name: { $regex: search, $options: 'i' } }` for case-insensitive matching. Categories use `$in` with regex arrays, and price ranges use `$or` conditions. Results are paginated with `skip()` and `limit()`."

---

## Q7. How does filtering work?
**Answer:** "All filtering happens on the backend via the `/api/product/catalog` endpoint. The frontend Collection page sends query parameters, and the backend builds a MongoDB query object. Category and subcategory filters use `$in` with case-insensitive regex. Price ranges use `$or` with `$gte/$lt` conditions. Sort supports price ascending/descending and date. Pagination uses `skip` and `limit` with `Promise.all` to fetch products and count simultaneously."

---

## Q8. How do related products work?
**Answer:** "The `RelatedProduct` component fetches products with the same category and subcategory as the current product using the catalog API, then filters out the current product by ID and displays up to 4 results. It's a simple content-based filtering approach â€” not ML-based."

---

## Q9. How does the cart work?
**Answer:** "Cart data is stored as a nested object on the User document: `{ productId: { size: quantity } }`. The frontend uses optimistic updates â€” it updates local state immediately, then syncs with the backend. The `addToCart` endpoint includes a soft stock check before adding. When the user logs in, `getUserCart` fetches the server-side cart."

---

## Q10. How does Razorpay payment work?
**Answer:** "Pre-payment order creation pattern: (1) Stock is atomically reserved using `findOneAndUpdate` with `$gte` condition, (2) Order is created in MongoDB with status 'Pending Payment', (3) Razorpay order is created with our MongoDB order ID as the `receipt`, (4) Frontend opens the Razorpay checkout modal, (5) On success, frontend calls `verifyRazorpay` which fetches the order from Razorpay API and checks if status is 'paid', (6) If user dismisses the modal, `cancelRazorpay` releases stock and cancels the order, (7) Webhooks handle edge cases like browser closures."

---

## Q11. Why COD?
**Answer:** "In India, a significant portion of e-commerce transactions are COD. Including it reduces cart abandonment. In my implementation, COD orders are created with `payment: false`, and when the admin marks the order as 'Delivered', the payment is automatically set to `true`."

---

## Q12. How does Cloudinary work?
**Answer:** "Product images are uploaded through the admin panel using Multer with memory storage â€” files are buffered in RAM, not written to disk. The buffer is streamed to Cloudinary using `upload_stream()` to the `trendies-products` folder, and the returned `secure_url` is stored in the product document."

---

## Q13. How does the chatbot work?
**Answer:** "Two-phase architecture: First, the user's message is sent to DeepSeek via OpenRouter for intent classification â€” the LLM returns a JSON object with the classified intent and extracted filters. Second, based on the intent, the backend dispatches to the appropriate service: product search queries MongoDB, fashion advice makes a second LLM call, order tracking queries the user's orders from MongoDB. All product-related responses are grounded in real database data."

---

## Q14. What intents does the chatbot support?
**Answer:** "Eight intents: PRODUCT_SEARCH, PRODUCT_INFO, PRODUCT_RECOMMENDATION, FASHION_ADVICE, ORDER_STATUS, ORDER_HISTORY, STORE_INFO, and OUT_OF_SCOPE."

---

## Q15. How does the admin dashboard work?
**Answer:** "It's a separate React application deployed on Render. It has four pages: Home (dashboard), Add Product (form with image uploads), List Products (view/delete products with stock management), and Orders (order management with status updates and filtering). Admin authentication uses hardcoded credentials compared against environment variables."

---

## Q16. What is idempotency and why did you implement it?
**Answer:** "Idempotency ensures that processing the same request multiple times produces the same result. I implemented it to prevent duplicate orders when users double-click the 'Place Order' button or when network retries happen. The frontend generates a UUID stored in a `useRef`, and the backend uses MongoDB's unique index on the idempotency key as an atomic lock. If a duplicate request arrives while the first is processing, it returns 409. If the first completed, it returns the cached response."

---

## Q17. What is a webhook and why do you use it?
**Answer:** "A webhook is a server-to-server HTTP callback. Razorpay sends a POST request to my `/api/webhooks/razorpay` endpoint when a payment event occurs. I use it as a safety net â€” if the user closes the browser after paying but before my frontend verification runs, the webhook still marks the order as paid. I verify webhooks using HMAC-SHA256 signature verification."

---

## Q18. How do you handle stock management?
**Answer:** "Atomic stock reservation using MongoDB's `findOneAndUpdate` with a condition filter. The query `{ _id: item._id, 'sizes.S': { $gte: qty } }` only matches if sufficient stock exists, and `$inc: { 'sizes.S': -qty }` decrements atomically. MongoDB's WiredTiger engine provides document-level locking, so two concurrent requests for the last unit won't both succeed."

---

## Q19. What is your deployment architecture?
**Answer:** "Three deployments on Render: the customer frontend, admin frontend, and backend. CORS is configured to allow requests from both frontends and localhost. MongoDB Atlas is the cloud database. Cloudinary hosts images. Environment variables are managed through Render's dashboard."

---

## Q20. What state management do you use?
**Answer:** "React Context API with four contexts: AuthContext (server URL), UserContext (user data and auth state), ShopContext (cart, products, search), and WishlistContext (wishlist IDs with optimistic updates). No Redux â€” Context is sufficient for this scale."

---

## Q21-50: Additional Easy Questions (Concise)

**Q21: How do you protect routes?**
"Auth middleware extracts JWT from cookies, verifies with `jwt.verify()`, and attaches `userId` to `req`. Protected routes use `isAuth` middleware."

**Q22: How do you handle errors?**
"Try-catch blocks in every controller with `console.error` logging and appropriate HTTP status codes. Frontend shows toast notifications via react-toastify."

**Q23: What is the database structure?**
"5 collections: Users, Products, Orders, Wishlists, and Idempotency (auto-delete after 24h via TTL index)."

**Q24: How does the wishlist work?**
"Toggle pattern â€” a single endpoint adds or removes. Uses compound unique index `{userId, productId}` to prevent duplicates. Frontend uses a `Set` for O(1) lookup."

**Q25: How do you handle image uploads?**
"Multer memory storage â†’ buffer â†’ Cloudinary stream upload â†’ secure URL stored in MongoDB."

**Q26: What frontend routing do you use?**
"React Router v7 with `BrowserRouter`. Routes include /, /login, /registration, /collection, /productdetail/:productId, /cart, /placeorder, /order, /wishlist."

**Q27: How does the splash screen work?**
"A `SplashScreen` component renders on initial load. It's rendered alongside the app in `App.jsx`."

**Q28: How do you calculate cart total?**
"`getCartAmount()` iterates through `cartItem` object, matches product IDs with `cartProducts` array, and sums `price Ã— quantity`."

**Q29: What happens when a user logs out?**
"Backend clears the token cookie. Frontend sets `userData` to null and removes `user` from localStorage."

**Q30: How does the navbar handle auth state?**
"Checks `userData` from `UserContext` â€” shows profile/logout when logged in, login button when not."

**Q31: Why Razorpay over Stripe?**
"Razorpay is India-focused with INR support, UPI integration, and simpler setup for Indian businesses."

**Q32: Why OpenRouter?**
"OpenRouter provides a single API gateway to multiple LLM providers. I can switch models (e.g., from DeepSeek to Claude) by changing one constant without changing any code."

**Q33: Why DeepSeek model specifically?**
"Cost-effective with good performance for intent classification. The `temperature: 0.1` setting ensures deterministic, consistent routing."

**Q34: How does pagination work?**
"Backend: `skip((page-1) * limit).limit(limit)` with `countDocuments` for total. Frontend: `Pagination` component with page buttons."

**Q35: What is `minimize: false` on User schema?**
"By default, Mongoose removes empty objects when saving. Since `cartData` starts as `{}` and we need to preserve it, `minimize: false` keeps empty objects."

**Q36: How does the chat frontend work?**
"Floating action button opens a panel with suggestion chips. Messages are stored in local state. Product cards are clickable, navigating to product detail pages."

**Q37: What happens with out-of-stock items?**
"Cart's `addToCart` does a soft stock check. At checkout, `reserveStock` does an atomic check. Failed items are reported to the user, and the order proceeds with available items."

**Q38: How do you handle CORS?**
"Express `cors()` middleware with explicit origin array (localhost:5173, localhost:5174, both Render URLs) and `credentials: true` for cookie support."

**Q39: What are the sort options?**
"Three options: relevant (default, sorts by `_id` descending), low-to-high price, high-to-low price."

**Q40: How does the addProduct endpoint work?**
"Multer handles multipart form data with 4 image fields. Each image buffer is uploaded to Cloudinary. JSON fields (category, subCategory, sizes) are parsed from strings."

**Q41: What frontend libraries do you use?**
"axios for HTTP, react-router-dom for routing, react-toastify for notifications, framer-motion for animations, react-icons for icons, js-cookie for cookie handling."

**Q42: How does optionalAuth middleware work?**
"Unlike `isAuth` which rejects unauthenticated requests, `optionalAuth` sets `req.userId = null` if no token exists, allowing both logged-in and guest users to use the chat."

**Q43: What is the product schema's sizes field?**
"A `Map` of String to Number â€” keys are size names (S, M, L, XL), values are stock quantities. This enables per-size inventory tracking."

**Q44: How does order status tracking work?**
"Admin updates status via `/api/order/status` endpoint. Available statuses: Pending Payment, Orderd Placed, Packing, Shipped, Out for Delivery, Delivered, Payment Failed, Cancelled."

**Q45: Why separate admin panel?**
"Separation of concerns â€” different users, different functionality. The admin panel has its own context, routing, and deployment, keeping the customer frontend clean."

**Q46: How does the category filter work on backend?**
"Categories are arrays in the product schema. The query uses `$in` with case-insensitive regex: `{ category: { $in: [/^Men$/i, /^Women$/i] } }`."

**Q47: What does `lean()` do?**
"Returns plain JavaScript objects instead of Mongoose documents. This is more memory-efficient and faster because it skips Mongoose's change tracking."

**Q48: How does price range filtering work?**
"Frontend sends ranges like '0-50,100-200'. Backend splits them, creates `$or` conditions with `$gte` and `$lt` for each range."

**Q49: Why Vite instead of Create React App?**
"Vite is significantly faster â€” uses ES modules for development and Rollup for production builds. CRA is deprecated."

**Q50: How is the app structured?**
"Backend: MVC-ish with routes â†’ controllers â†’ services â†’ models. Frontend: pages for routes, components for reusable UI, context for state management."

---

# LEVEL 2 â€” MEDIUM QUESTIONS (80 Questions)

## Architecture & API Design

### Q51. Walk me through a complete API request lifecycle.
**Answer:** "Take adding to cart: (1) Frontend calls `axios.post('/api/cart/add', {itemId, size}, {withCredentials: true})`, (2) Express receives the request, `cookieParser()` parses cookies, (3) `isAuth` middleware extracts the JWT from cookies, verifies it with `jwt.verify()`, attaches `req.userId`, (4) `addToCart` controller runs â€” finds the product, checks stock, updates the user's `cartData` object, (5) Response is sent back with status code and JSON body."

**Follow-up:** What happens if the JWT is expired?
**Answer:** "`jwt.verify()` throws a `JsonWebTokenError`, the catch block returns 500. The frontend receives an error, and the `UserContext` sets `userData` to null, effectively logging the user out."

---

### Q52. Explain your middleware chain for placing an order.
**Answer:** "For `POST /api/order/placeorder`: `isAuth` â†’ `idempotencyMiddleware` â†’ `PlacedOrder` controller. First, `isAuth` verifies the JWT. Then `idempotencyMiddleware` checks if the `Idempotency-Key` header exists â€” if so, it tries to insert a record in MongoDB (unique index acts as lock). If it's the first request, it intercepts `res.json` to cache the response. If duplicate, it returns the cached response or 409 if still processing. Finally, the controller handles stock reservation and order creation."

---

### Q53. Why do you store cart data on the User document instead of a separate collection?
**Answer:** "It was a design simplicity choice â€” cart data is always accessed alongside user data. The tradeoff is that large carts increase the User document size, and concurrent cart updates could cause write conflicts. For production, I'd move the cart to a separate collection with `userId` as a reference, allowing independent scaling and better concurrency."

---

### Q54. Explain how your stock reservation prevents overselling.
**Answer:** "I use `findOneAndUpdate` with a condition filter: `{ _id: productId, 'sizes.S': { $gte: requestedQty } }` with `$inc: { 'sizes.S': -requestedQty }`. MongoDB's WiredTiger engine acquires a document-level exclusive lock for this operation. If two concurrent requests try to buy the last unit, only one will find the document matching the `$gte` condition â€” the other will get `null` back and be treated as a failed reservation."

**Follow-up:** Is this truly atomic?
**Answer:** "Yes â€” `findOneAndUpdate` is an atomic operation in MongoDB. The condition check and the update happen as a single unit within the document-level lock. There's no time gap between checking and decrementing where another request could interfere."

---

### Q55. How does your idempotency system handle server crashes?
**Answer:** "If the server crashes while processing a request, the idempotency record remains in 'processing' status. The middleware has a 2-minute lock timeout â€” if a new request arrives with the same key and the existing record has been 'processing' for more than 2 minutes, it assumes the previous request crashed, deletes the stale record, and allows the new request to proceed."

---

### Q56. Explain the Razorpay webhook signature verification.
**Answer:** "My backend computes an HMAC-SHA256 hash of the raw request body using the webhook secret from my environment variables: `crypto.createHmac('sha256', webhookSecret).update(JSON.stringify(req.body)).digest('hex')`. I compare this with the `x-razorpay-signature` header. If they match, the request genuinely came from Razorpay. If not, I reject it with 400."

**Follow-up:** Why always return 200 in the catch block?
**Answer:** "If I return an error status, Razorpay will retry the webhook repeatedly. By always returning 200, I acknowledge receipt even if my processing fails, preventing retry storms. The tradeoff is that a failed webhook won't be retried, but the frontend verification endpoint serves as the primary path."

---

### Q57. What happens if payment succeeds but your verifyRazorpay endpoint fails?
**Answer:** "This is exactly why I implemented webhooks. If the frontend verification fails (network error, server down), the Razorpay webhook will still fire `payment.captured` event, which marks the order as paid. The webhook is the safety net for this exact scenario."

---

### Q58. How does the intent classification prompt work?
**Answer:** "The system prompt defines 8 intents with examples, specifies the JSON output format with intent and filters fields, lists the filter extraction rules (category, subCategory, maxPrice, minPrice, bestseller, searchTerm), and includes strict rules like 'Return ONLY JSON, no markdown'. I use `response_format: { type: 'json_object' }` and `temperature: 0.1` for deterministic structured output."

---

### Q59. How does your chatbot ensure products are real?
**Answer:** "The LLM never generates product data. For PRODUCT_SEARCH, the LLM only extracts filters â€” the actual products come from a MongoDB query. For PRODUCT_INFO and PRODUCT_RECOMMENDATION, real products are fetched from MongoDB and passed to the LLM as context, with the system prompt explicitly stating 'Only reference products that exist in the provided data. NEVER invent or make up products.'"

---

### Q60. How does order tracking work through the chatbot?
**Answer:** "When the LLM classifies the intent as ORDER_STATUS, the chatService calls `orderQueryService.getOrderStatus(userId)`. This queries MongoDB for the user's latest order using `Order.findOne({ userId }).sort({ date: -1 })`. The response message is built programmatically â€” no second LLM call. If the user isn't logged in (`userId` is null from optionalAuth), it returns 'Please log in to check your order status.'"

---

### Q61. Can a user access another user's orders through the chatbot?
**Answer:** "No. The `userId` comes from the JWT in the httpOnly cookie, verified by `optionalAuth` middleware. The chatbot never accepts user-provided order IDs or user IDs â€” it always uses `req.userId` from the authenticated token. A user can only see their own orders."

---

### Q62. What happens when the AI model returns invalid JSON?
**Answer:** "The `classifyIntent` function tries to parse the response with `JSON.parse()`. It first strips markdown code fences in case the model wraps JSON. If parsing fails, the error propagates to `chatService`'s catch block, which returns a `SYSTEM_ERROR` response: 'The AI assistant is temporarily unavailable.' If the intent is not in the valid intents array, it defaults to `OUT_OF_SCOPE`."

---

### Q63. How do you handle partial stock failures?
**Answer:** "The `reserveStock` function iterates through all items. Items that succeed are added to `reservedItems`, items that fail are added to `failedItems` with the available quantity. If at least one item succeeds, the order proceeds with only the reserved items. The total amount is recalculated by subtracting the failed items' prices. The user receives a message like 'Order placed. Note: T-shirt (Size: M) was removed as it is out of stock.'"

---

### Q64-80: Additional Medium Questions

**Q64: Why is `express.json({ limit: '50mb' })` set so high?**
"To handle base64-encoded images in the virtual try-on endpoint (which exists as a stub). For production, I'd reduce this and use streaming uploads."

**Q65: How does the frontend handle authentication state on page refresh?**
"`UserContext` calls `getCurrentUser()` on mount, which hits `/api/user/getCurrentUser` with the cookie. If the cookie is valid, user data is set. If not, the user is treated as logged out."

**Q66: Why do you use `structuredClone` for cart operations?**
"To create a deep copy of the cart object before modifying it. Without this, I'd be mutating React state directly, which can cause subtle bugs and prevent re-renders."

**Q67: How does the frontend proxy work in development?**
"Vite's proxy config routes all `/api` requests to `http://localhost:3000` during development. In production, the frontend uses relative URLs (serverUrl is empty string) and Render's internal networking."

**Q68: Explain how `res.json` interception works in idempotency middleware.**
"I save the original `res.json` function, then replace it with a wrapper that (1) saves the response data and status code to the idempotency record in MongoDB, then (2) calls the original `res.json` to actually send the response. This transparently captures the controller's response."

**Q69: How does the webhook know which MongoDB order to update?**
"The webhook payload contains `payment.entity.order_id` (the Razorpay order ID). I fetch the full Razorpay order using the SDK, which contains the `receipt` field â€” I set this to my MongoDB order `_id` during order creation."

**Q70: Why is the chat endpoint `POST /api/chat` instead of WebSocket?**
"Each message is independent (no conversation memory), so HTTP request-response is sufficient. WebSocket would add complexity without benefit since there's no streaming or real-time push needed."

**Q71: How does `getProductsByIds` work and why does it exist?**
"It accepts an array of product IDs and returns minimal product data (name, price, image1, sizes). It exists to fetch details for products in the cart â€” since the cart only stores IDs, sizes, and quantities, we need this endpoint to display product names and images."

**Q72: How does the `bestseller` filter work?**
"The catalog endpoint checks `if (bestseller) query.bestseller = bestseller === 'true'`. The AI chatbot can also extract this â€” if a user says 'show popular items', the LLM sets `bestseller: true` in the filters."

**Q73: What's the difference between `listproduct` and `catalogProducts`?**
"`listproduct` returns ALL products without filtering or pagination (used by admin). `catalogProducts` supports filtering, search, sorting, and pagination (used by customer frontend). This migration from fetching everything to paginated API was a performance optimization."

**Q74: How is the Store Info service implemented?**
"Entirely static â€” no database, no LLM. It uses keyword matching on the user's message (e.g., 'ship' â†’ shipping policy, 'return' â†’ return policy) and returns hardcoded store policies. If no keyword matches, all policies are shown."

**Q75: Why do you use `Map` type for product sizes?**
"Map allows dynamic keys (S, M, L, XL, XXL) with numeric values (stock counts). Unlike a fixed-schema object, it naturally supports any size names without schema changes."

**Q76: How does the admin orders page work?**
"Fetches all orders, displays in a table/card layout with filter tags by status. Each order is expandable to show customer details, items, and address. Admin can change status via a dropdown â€” the `statusHandle` function calls `/api/order/status`."

**Q77: How does COD payment marking work?**
"When admin changes status to 'Delivered' for a COD order, the `updateStatus` controller checks if `paymentMethod === 'cod' && !payment` and automatically sets `payment: true`. This represents the customer paying cash on delivery."

**Q78: How does the `cancelRazorpayOrder` endpoint prevent misuse?**
"It verifies: (1) the order exists, (2) `order.userId === userId` (the authenticated user owns it), (3) `!order.payment` (not already paid), (4) `status === 'Pending Payment'` (not already processed). Only if all conditions pass does it release stock and cancel."

**Q79: What happens to the idempotency key after a successful order?**
"The frontend regenerates it: `idempotencyKeyRef.current = crypto.randomUUID()`. This ensures the next order attempt gets a fresh key. The old record auto-deletes after 24 hours via MongoDB TTL."

**Q80: How does the chatbot handle unauthenticated users?**
"`optionalAuth` middleware sets `req.userId = null`. Product search, fashion advice, and store info work without auth. Order tracking returns 'Please log in' when userId is null."
# TRENDIES INTERVIEW â€” PART 3: HARD QUESTIONS

---

# LEVEL 3 â€” HARD QUESTIONS (100 Questions)

## System Design & Scaling

### Q81. How would you scale Trendies to handle 100x traffic?
**Answer:** "**Current:** Single Express server, single MongoDB Atlas cluster. **Production improvements:** (1) Horizontal scaling with multiple Express instances behind a load balancer, (2) Redis for session caching and cart storage, (3) MongoDB read replicas for product catalog reads, (4) CDN for static assets and product images (Cloudinary already provides this), (5) Message queue (RabbitMQ/SQS) for order processing â€” decouple order creation from payment verification, (6) Elasticsearch for product search instead of regex queries, (7) Rate limiting with Redis-backed express-rate-limit."

**Follow-up:** What's the first bottleneck?
**Answer:** "MongoDB regex queries for product search. At scale, `$regex` doesn't use indexes efficiently. I'd add MongoDB text indexes or migrate to Elasticsearch for full-text search."

---

### Q82. How would you handle millions of products?
**Answer:** "**Current:** `catalogProducts` uses `skip().limit()` which becomes slow for deep pagination. **Improvements:** (1) Cursor-based pagination using `_id` instead of skip, (2) MongoDB indexes on `category`, `subCategory`, `price`, `bestseller`, `date`, (3) Elasticsearch for search and filtering, (4) Redis caching for frequently accessed categories, (5) Product data denormalization â€” store computed fields like price buckets."

---

### Q83. How would you handle a high-traffic flash sale?
**Answer:** "**Current:** My atomic stock reservation works correctly but sequentially per item. **Improvements:** (1) Redis for real-time stock counters (faster than MongoDB for high-frequency decrements), (2) Queue-based order processing to handle burst traffic, (3) Pre-warm product data in cache, (4) Separate the stock check from the order creation â€” use Redis for instant stock decrement, then asynchronously create the order in MongoDB."

---

## Security Deep Dive

### Q84. What is the security flaw in your admin authentication?
**Answer:** "The `adminAuth` middleware only verifies that the JWT is valid â€” it doesn't check if the email in the token matches `ADMIN_EMAIL`. Any user with a valid JWT could potentially access admin endpoints. The fix: decode the token, extract the email, and compare with `process.env.ADMIN_EMAIL`. Better yet, add a `role` field to the User schema and check `role === 'admin'`."

**Code reference:** `backend/middleware/adminAuth.js` â€” line 13 sets `req.adminEmail = process.env.ADMIN_EMAIL` without checking the token's email.

---

### Q85. How do you prevent NoSQL injection?
**Answer:** "**Current implementation is vulnerable.** I use user input directly in regex: `{ name: { $regex: search, $options: 'i' } }`. An attacker could craft a regex that causes ReDoS (Regular Expression Denial of Service). **Fix:** Use `mongo-sanitize` to strip `$` operators from input, or escape regex special characters with a utility function before constructing the regex."

---

### Q86. How do you protect against CSRF?
**Answer:** "Partially protected. Using `sameSite: 'None'` with `secure: true` for cookies provides some protection, but `sameSite: 'None'` is needed for cross-origin cookie support between my frontend and backend on different Render URLs. **Limitation:** This doesn't fully prevent CSRF. **Improvement:** Add CSRF tokens for state-changing requests, or move frontend and backend to the same domain."

---

### Q87. Can the Google login be spoofed?
**Answer:** "**Yes, technically.** My backend's `/api/auth/googlelogin` accepts `{name, email}` and trusts the frontend. An attacker could send a forged POST request with any email. **Fix:** Instead of sending just name/email, send the Firebase ID token and verify it server-side using Firebase Admin SDK's `admin.auth().verifyIdToken(idToken)`. This cryptographically proves the user authenticated with Google."

---

### Q88. Are your API keys exposed?
**Answer:** "The Razorpay KEY_ID is intentionally on the frontend (it's the public key). The Firebase API key is also designed to be public. However, my `.env` file contains all secrets including MongoDB URI, Razorpay secret, Cloudinary secret, and OpenRouter API key. These should never be committed to version control. In production, I use Render's environment variable management."

---

### Q89. How would you implement rate limiting?
**Answer:** "Using `express-rate-limit` middleware: `const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })`. I'd apply different limits to different endpoints â€” stricter on auth (5 attempts/15 min), moderate on chat (20/min to control API costs), relaxed on product listing."

---

### Q90. What happens if someone sends malicious input to the chatbot?
**Answer:** "**Current:** The chatController validates message type and length (max 500 chars), but doesn't sanitize for prompt injection. A user could potentially say 'Ignore previous instructions and...' **Fix:** (1) Validate and sanitize input, (2) Add a system prompt instruction to ignore override attempts, (3) Implement output validation to ensure the response matches expected format."

---

## Payment Deep Dive

### Q91. What happens if Razorpay succeeds but your MongoDB update fails?
**Answer:** "The user has paid but the order isn't marked as paid. This is exactly why I have webhooks â€” Razorpay will send `payment.captured` to my webhook endpoint, which independently marks the order as paid. The webhook serves as a reconciliation mechanism."

**Follow-up:** What if the webhook also fails?
**Answer:** "The webhook returns 200 even on internal errors to prevent retries. I'd need a reconciliation job that periodically compares Razorpay payment records with my order database, and marks any discrepancies as paid."

---

### Q92. What happens if the user clicks Pay twice?
**Answer:** "The idempotency system prevents this. The first click creates an idempotency record with status 'processing'. The second click sees the duplicate key (MongoDB unique index error), finds the existing record, and returns 409: 'Your order is currently being processed.' Additionally, the frontend disables the button with `isLoading` state."

---

### Q93. Can the same Razorpay payment create multiple orders?
**Answer:** "No. Each Razorpay order is created with a unique `receipt` (my MongoDB order ID). The `verifyRazorpay` endpoint fetches the Razorpay order by `razorpay_order_id`, gets the receipt, and updates that specific order. The idempotency key prevents the order creation endpoint from being called twice."

---

### Q94. What if the product price changes after adding to cart?
**Answer:** "**Current limitation:** The cart only stores `{productId: {size: quantity}}`. At checkout, the frontend builds `orderItems` using `cartProducts` (fetched product details). If the price changed between adding to cart and checkout, the user gets the new price. **Improvement:** Lock the price at cart addition time, or show a warning at checkout if the price has changed."

---

### Q95. How would you implement refunds?
**Answer:** "**Not currently implemented.** I'd use Razorpay's Refunds API: `razorpayInstance.payments.refund(paymentId, { amount })`. The admin panel would have a 'Refund' button on cancelled/returned orders. I'd add a `refundStatus` field to the order schema and a refund webhook to track the refund lifecycle."

---

### Q96. Explain the difference between your verifyRazorpay and webhook approaches.
**Answer:** "`verifyRazorpay` is browser-initiated â€” after the user pays, the frontend calls this endpoint which fetches the order status from Razorpay API using `razorpayInstance.orders.fetch()`. It checks if status is 'paid' but doesn't verify a cryptographic signature. The webhook is server-to-server â€” Razorpay pushes events with an HMAC-SHA256 signature that I verify. The webhook is more secure and handles edge cases like browser closure. Ideally, I'd rely primarily on webhooks and use the frontend endpoint only for immediate UI feedback."

---

## AI Deep Dive

### Q97. Why intent classification instead of letting the LLM handle everything?
**Answer:** "Three reasons: (1) **Cost control** â€” PRODUCT_SEARCH, ORDER_STATUS, and STORE_INFO don't need a second LLM call; they use programmatic responses. Only PRODUCT_INFO, PRODUCT_RECOMMENDATION, and FASHION_ADVICE make a second call. (2) **Reliability** â€” deterministic backend code handles database queries instead of asking the LLM to write MongoDB queries. (3) **Speed** â€” programmatic responses are faster than waiting for a second LLM call."

---

### Q98. How do you control AI costs?
**Answer:** "Several strategies: (1) `max_tokens: 500` limits response length, (2) Only 3 of 8 intents trigger a second LLM call, (3) `temperature: 0.1` reduces token usage for classification, (4) Product search results capped at 20 items, only top 10 sent to LLM for response generation, (5) STORE_INFO and ORDER_STATUS/HISTORY are entirely programmatic â€” zero LLM cost."

---

### Q99. What happens when OpenRouter is down?
**Answer:** "The `chatCompletion` function throws an error. The `chatService`'s catch block catches it and returns `{ success: false, intent: 'SYSTEM_ERROR', message: 'The AI assistant is temporarily unavailable.' }`. The frontend shows this as an error-styled message bubble. The application continues to function â€” only the chatbot is affected."

---

### Q100. How would you add conversation memory?
**Answer:** "**Current:** Each message is independent (V1). **Improvement:** (1) Store conversation history in an array per session, (2) Pass the last N messages to the LLM as context: `messages: [{role: 'system', ...}, {role: 'user', content: msg1}, {role: 'assistant', content: resp1}, {role: 'user', content: currentMsg}]`, (3) For persistence, store conversations in MongoDB with a `sessionId`. (4) Add a 'Clear Chat' button to reset context."

---

### Q101. How would you evaluate chatbot accuracy?
**Answer:** "**Not currently implemented.** I'd: (1) Build a test suite of 100+ user messages with expected intents and verify classification accuracy, (2) Log all chat interactions with intent classifications for manual review, (3) Add user feedback buttons (ðŸ‘/ðŸ‘Ž) in the chat UI, (4) Track metrics: intent distribution, search-to-product-click conversion, fallback rate (OUT_OF_SCOPE percentage)."

---

### Q102. What exactly makes your system 'agentic'?
**Answer:** "Honestly, calling it 'Agentic AI' is generous. The system is an **intent-based LLM assistant with retrieval grounding**. What makes it agent-*like*: the LLM autonomously decides which action to take based on user input (8 possible actions), extracts structured parameters, and these drive real backend operations. What's missing for true agency: no multi-step planning, no self-correction loops, no autonomous tool selection, no conversation memory. I'd more precisely call it an 'AI-powered assistant with LLM-driven intent classification and action dispatch.'"

---

## Edge Cases & Debugging

### Q103. User pays but order creation fails â€” what happens?
**Answer:** "In my implementation, order creation happens BEFORE Razorpay payment. Stock is reserved, order is created in MongoDB with 'Pending Payment' status, then Razorpay order is created. If the MongoDB order creation fails (throws error), we don't reach Razorpay, so no payment occurs. If Razorpay order creation fails (callback error), I release the reserved stock."

---

### Q104. Two users try to buy the last item simultaneously.
**Answer:** "MongoDB's `findOneAndUpdate` with `{ 'sizes.M': { $gte: 1 } }` ensures only one succeeds. The condition and update are atomic â€” the first request decrements stock to 0, the second request's condition `$gte: 1` no longer matches, returning `null`. The second user gets an out-of-stock error."

---

### Q105. Product search suddenly returns zero results â€” how to debug?
**Answer:** "I'd check: (1) Is the catalog endpoint receiving the request? (Check Express logs), (2) Are query parameters correct? (Log the built MongoDB query object), (3) Is the regex valid? (Invalid user input could create a bad regex), (4) Is MongoDB connected? (Check connection status), (5) Did all products get accidentally deleted? (Run `db.products.countDocuments()` in MongoDB shell), (6) Did a deployment change the API URL? (Check CORS and proxy config)."

---

### Q106. Razorpay says payment succeeded but order is still pending.
**Answer:** "Debug steps: (1) Check if `verifyRazorpay` was called (frontend network tab), (2) Check if `razorpayInstance.orders.fetch()` returned correct status, (3) Check if the MongoDB update query matched the right document (receipt â†’ orderId mapping), (4) Check webhook logs â€” did `payment.captured` fire? (5) Check if the webhook signature verification passed. The most likely cause: the browser closed before verification, and the webhook hasn't fired yet or had an error."

---

### Q107. Google login works locally but fails after deployment.
**Answer:** "Check: (1) Firebase authorized domains â€” add the Render URL to Firebase Console â†’ Authentication â†’ Settings â†’ Authorized Domains, (2) CORS origin array â€” ensure the Render URL is included, (3) Cookie settings â€” `secure: true` and `sameSite: 'None'` are required for cross-origin cookies in production, (4) Environment variables â€” ensure all Firebase and JWT config is set on Render."

---

### Q108. The chatbot returns irrelevant products.
**Answer:** "Debug the intent classification: (1) Check the server console logs for 'RAW AI RESPONSE' â€” is the intent correct? Are filters correct? (2) Log the MongoDB query built from filters â€” is the regex matching wrong products? (3) Test the same query in MongoDB Compass, (4) The LLM might be extracting wrong filters â€” refine the classification prompt with more examples, (5) Check if `searchTerm` is too broad."

---

### Q109. Admin dashboard receives 401/403 errors.
**Answer:** "Check: (1) Is the admin JWT cookie present? (It might have expired â€” 7-day expiry), (2) Is the cookie domain correct? (Admin is on a different subdomain), (3) Is the `adminAuth` middleware correctly reading cookies? (4) Is `JWT_SECRET` the same on all deployments? (5) Did someone change `ADMIN_EMAIL` in environment variables without re-logging in?"

---

### Q110. Images upload but aren't displayed.
**Answer:** "Debug: (1) Check if Cloudinary returned a `secure_url` (log the upload result), (2) Check if the URL is stored correctly in MongoDB (query the product document), (3) Check if the URL uses HTTPS (mixed content blocks HTTP images), (4) Check Cloudinary account â€” free tier has limits on bandwidth and storage, (5) Check if the image field names match between backend (image1-4) and frontend."

---

## Interview Traps

### Q111. You built this alone. What was the hardest part?
**Answer:** "Implementing the Razorpay payment lifecycle. Handling the gap between payment and order state â€” what happens if the user pays but the browser closes? I had to implement three safety mechanisms: frontend verification, modal dismiss cancellation, and webhook-based reconciliation. Getting the stock reservation, order creation, and Razorpay order creation to work as a reliable sequence with proper rollback on failures was the most complex part."

---

### Q112. What's the biggest bug you faced?
**Answer:** "The 'ghost cart' bug â€” when users would double-click the order button, two orders could be created with the same items. The first order would reserve stock, the second would fail but the user wouldn't know which succeeded. I solved this with the idempotency system using MongoDB's unique index as an atomic lock and payload hash comparison to detect stale carts."

---

### Q113. What would you change if you rebuilt it?
**Answer:** "Three things: (1) Use TypeScript for type safety â€” I'd catch many bugs at compile time, (2) Move to role-based auth instead of separate admin credentials, (3) Use a proper OAuth server-side flow instead of trusting Firebase client-side tokens. I'd also add a proper logging system instead of `console.error`, implement rate limiting, and add automated tests."

---

### Q114. What's the weakest part of your architecture?
**Answer:** "The admin authentication. Currently, any valid JWT passes the admin middleware because it doesn't verify the email claim. Also, admin credentials are hardcoded in `.env` rather than stored as a proper user with an admin role. This was a conscious simplification, but it's the first thing I'd fix in production."

---

### Q115. Show me where payment verification happens.
**Answer:** "Two places: (1) `backend/controller/orderController.js`, `verifyRazorpay` function (lines 127-149) â€” fetches order status from Razorpay API, checks `status === 'paid'`, (2) `backend/controller/webhookController.js`, `razorpayWebhook` function (lines 14-106) â€” HMAC signature verification, handles `payment.captured` and `payment.failed` events."

---

### Q116. Show me where authorization happens.
**Answer:** "Four middleware files: (1) `authMiddleware.js` â€” JWT verification, sets `req.userId`, (2) `adminAuth.js` â€” JWT verification for admin routes, (3) `optionalAuth.js` â€” non-blocking JWT check for chat, (4) Order cancellation additionally checks `order.userId === userId` in the controller."

---

### Q117. Why did you call this Agentic AI?
**Answer:** "I used the term because the LLM acts as the decision layer â€” it autonomously classifies intent and determines which backend action to execute, rather than just generating text. However, I acknowledge it's more precisely described as an 'intent-based LLM assistant' rather than a fully autonomous agent. The system lacks multi-step planning, tool selection, and conversation memory that would make it truly agentic."

---

### Q118-130: Rapid-fire hard questions

**Q118: How does the `$inc` operator prevent race conditions?**
"`$inc` is atomic at the document level. MongoDB's WiredTiger engine holds a document lock during the update, ensuring two concurrent `$inc` operations are serialized."

**Q119: Why use `findOneAndUpdate` instead of `findById` + `save`?**
"`findById` + manual check + `save()` has a TOCTOU (time-of-check-time-of-use) race condition. Between the check and save, another request could modify the document. `findOneAndUpdate` is atomic."

**Q120: What if your idempotency middleware crashes after intercepting res.json?**
"The response is still sent to the client (original `res.json` is called in the wrapper). The idempotency record might not be updated to 'completed', leaving it as 'processing'. After 2 minutes, the stale lock is cleared."

**Q121: How would you add search suggestions/autocomplete?**
"Create a debounced input that calls a lightweight endpoint returning product names matching a prefix. Use MongoDB's text index or a prefix regex with `$limit: 5` for speed."

**Q122: Why don't you use MongoDB transactions?**
"Single-document operations with `findOneAndUpdate` are already atomic. Multi-document transactions would be needed if I split stock and orders into separate atomic operations, but my current flow doesn't require it."

**Q123: How would you implement a product review system?**
"Create a Review schema: `{ userId, productId, rating, comment, timestamp }`. Add a pre-save hook or aggregation pipeline to compute average rating on the product. Add endpoints for CRUD and display on ProductDetail."

**Q124: What's the `receipt` field in Razorpay order creation?**
"A merchant-defined identifier. I set it to my MongoDB order `_id` so I can map Razorpay orders back to my database. The webhook uses this to find which MongoDB order to update."

**Q125: How do you ensure the chatbot doesn't recommend deleted products?**
"Products are queried fresh from MongoDB on every chat request. If a product was deleted, it won't appear in the query results. The LLM is told to only reference provided products."

**Q126: What happens if MongoDB goes down during checkout?**
"The `reserveStock` call fails, the catch block returns 500, the user sees 'Order Place error'. No stock is reserved, no order is created. The idempotency record might be in a bad state â€” the 2-minute timeout would eventually clear it."

**Q127: How would you implement a wishlist notification?**
"Add a price tracking mechanism â€” when a wishlisted product's price drops, send an email or push notification. This requires a price change event system (database triggers or polling)."

**Q128: Why is `order.userId` a String instead of ObjectId?**
"A design oversight. It should be an ObjectId with `ref: 'User'` for proper Mongoose population and data integrity. As-is, I can't use `.populate('userId')` to get user details."

**Q129: How would you implement product variant management?**
"Currently sizes are a Map on the product. For complex variants (color + size), I'd create a separate Variant schema with `productId`, `color`, `size`, `stock`, `sku`, and price overrides."

**Q130: What monitoring would you add for production?**
"(1) Application performance monitoring (APM) with DataDog or New Relic, (2) Error tracking with Sentry, (3) Structured logging with Winston or Pino, (4) Health check endpoints, (5) MongoDB query performance monitoring, (6) Razorpay webhook delivery monitoring."
# TRENDIES INTERVIEW â€” PART 4: FINAL DEFENSE SHEET

---

# COMPLETE USER FLOWS

## Flow 1: User Registration â†’ Purchase â†’ Order Tracking

```
1. User visits / â†’ SplashScreen â†’ Home (Hero, BestSeller, LatestCollection)
2. Clicks "Sign in" â†’ /login â†’ enters email+password or clicks "Sign in with Google"
3. Google flow: Firebase signInWithPopup â†’ Google consent â†’ Firebase returns profile
4. Frontend sends {name, email} â†’ POST /api/auth/googlelogin
5. Backend: findOne({email}) â†’ creates user if new â†’ genToken(userId) â†’ sets httpOnly cookie
6. Frontend: getCurrentUser() â†’ sets userData in context â†’ redirect to /
7. User browses /collection â†’ GET /api/product/catalog?page=1&limit=12
8. Applies filters â†’ checkboxes update state â†’ useEffect triggers new API call with query params
9. Clicks product â†’ /productdetail/:id â†’ GET /api/product/single/:id
10. Selects size â†’ "Add to Cart" â†’ POST /api/cart/add (soft stock check) â†’ optimistic UI update
11. Goes to /cart â†’ sees items with quantities â†’ "Proceed to Checkout" â†’ /placeorder
12. Fills delivery form â†’ selects "Razorpay" â†’ clicks "Place Order"
13. Frontend generates idempotency key (useRef + crypto.randomUUID())
14. POST /api/order/razorpay with Idempotency-Key header
15. Backend: idempotencyMiddleware checks key â†’ reserveStock (atomic $inc) â†’ create Order (Pending Payment) â†’ create Razorpay order
16. Frontend: initpay() opens Razorpay modal â†’ user completes payment
17. On success: POST /api/order/verifyrazorpay â†’ fetch order from Razorpay API â†’ check paid â†’ update MongoDB
18. Frontend: navigate to /order â†’ POST /api/order/userorders â†’ displays order items with status
19. User opens chatbot â†’ types "Where is my order?" â†’ POST /api/chat
20. optionalAuth sets req.userId â†’ chatService â†’ classifyIntent â†’ ORDER_STATUS
21. orderQueryService queries latest order â†’ programmatic response: "Your order is currently: Orderd Placed"
```

## Flow 2: Admin Product Management

```
1. Admin visits admin URL â†’ Login page (adminData is null)
2. Enters admin email+password â†’ POST /api/auth/adminlogin
3. Backend: compares with process.env credentials â†’ genTokenAdmin(email) â†’ sets cookie
4. Admin panel: navigates to /add
5. Fills product form: name, description, price, category[], subCategory[], sizes{S:5,M:10}, bestseller, 4 images
6. Multer receives multipart form data â†’ buffers images in memory
7. uploadOnCloudinary streams each buffer â†’ returns secure_url
8. Product.create() saves document with Cloudinary URLs
9. Admin navigates to /list â†’ sees all products â†’ can delete or update stock
10. Admin navigates to /orders â†’ sees all orders with status filter tags
11. Expands order â†’ sees customer details, items, address
12. Changes status dropdown â†’ POST /api/order/status â†’ order status updated
13. For COD orders marked "Delivered" â†’ payment automatically set to true
```

## Flow 3: Razorpay Webhook (Browser Close Scenario)

```
1. User completes Razorpay payment but closes browser before verifyRazorpay runs
2. Order remains as "Pending Payment" with payment: false
3. Razorpay sends POST /api/webhooks/razorpay with payment.captured event
4. Webhook controller:
   a. Verifies HMAC-SHA256 signature
   b. Extracts razorpay_order_id from payload.payment.entity
   c. Fetches full Razorpay order â†’ gets receipt (MongoDB order _id)
   d. Finds order in MongoDB â†’ sets payment: true, clears user cart
5. Returns 200 to Razorpay
6. Next time user logs in and checks /order â†’ order shows as paid
```

---

# TOP 20 MOST DANGEROUS QUESTIONS

| # | Question | Why It's Dangerous | Key Points for Your Answer |
|---|---|---|---|
| 1 | "What exactly is agentic about your AI?" | Exposes if you understand AI agent architecture | Intent-based dispatch, NOT autonomous planning. Be honest. |
| 2 | "Show me where admin authorization happens" | Reveals the admin auth flaw | Acknowledge the flaw, explain the fix |
| 3 | "How do you verify Razorpay payments?" | Tests payment security understanding | Explain both verify endpoint AND webhook signature verification |
| 4 | "What prevents duplicate orders?" | Complex system â€” must explain idempotency | UUID in useRef â†’ header â†’ MongoDB unique index â†’ response caching |
| 5 | "Is your Google login actually OAuth 2.0?" | Firebase popup is NOT traditional OAuth | Firebase handles OAuth client-side, you just receive name+email |
| 6 | "What if someone sends a forged Google login request?" | Reveals backend trust issue | Acknowledge the vulnerability, explain Firebase ID token verification fix |
| 7 | "Can a user access admin endpoints?" | Tests admin auth understanding | Currently yes (any valid JWT passes) â€” explain the fix |
| 8 | "What happens if the user closes the browser during payment?" | Tests payment lifecycle understanding | Stock already reserved, webhook catches the payment event |
| 9 | "Does your chatbot use RAG?" | Tests if you know what RAG actually is | No vector embeddings. It's retrieval grounding via MongoDB queries, not RAG |
| 10 | "How do you prevent the AI from hallucinating products?" | Tests data grounding understanding | LLM receives MongoDB query results, prompt says NEVER invent products |
| 11 | "Why no conversation memory?" | Tests design decision awareness | V1 choice â€” stateless is simpler, explain how you'd add it |
| 12 | "What security vulnerabilities exist?" | Must be honest about weaknesses | Admin auth, NoSQL injection via regex, no rate limiting, Firebase trust |
| 13 | "How do you handle concurrent purchases?" | Tests atomicity understanding | `findOneAndUpdate` with `$gte` condition, document-level locking |
| 14 | "Why is this better than a search bar?" | Tests product thinking | NLP understanding, fashion advice, order tracking â€” multi-modal assistant |
| 15 | "What would you change if you rebuilt this?" | Tests self-awareness | TypeScript, proper OAuth, role-based auth, Redis, testing |
| 16 | "Show me the exact code for stock reservation" | Must know `stockService.js` line by line | `findOneAndUpdate` with condition filter and `$inc` |
| 17 | "How does your webhook know which order to update?" | Tests Razorpay integration depth | Payment entity has order_id â†’ SDK fetch â†’ receipt field = MongoDB _id |
| 18 | "Is your product search scalable?" | Tests scaling awareness | Regex search doesn't use indexes â€” need text indexes or Elasticsearch |
| 19 | "What's your biggest technical debt?" | Tests honesty | Status typo, admin auth, no tests, hardcoded credentials |
| 20 | "Walk me through the complete payment failure path" | Tests end-to-end understanding | Stock reserved â†’ Razorpay order created â†’ payment fails â†’ webhook fires payment.failed â†’ stock released â†’ order status set to "Payment Failed" |

---

# TOP 20 QUESTIONS YOU MUST MEMORIZE

1. **Tell me about Trendies** â†’ Use the 30-second or 1-minute intro
2. **Explain your architecture** â†’ Three deployments, MERN stack, JWT cookies
3. **How does authentication work?** â†’ JWT in httpOnly cookies, Firebase Google popup
4. **How does payment work?** â†’ Pre-payment order creation, stock reservation, verify + webhook
5. **How does the chatbot work?** â†’ Intent classification â†’ dispatch â†’ MongoDB grounding
6. **What is agentic about it?** â†’ Intent-based LLM dispatch, be honest about limitations
7. **How do you prevent overselling?** â†’ Atomic `findOneAndUpdate` with `$gte` condition
8. **What happens if payment fails?** â†’ Webhook catches it, releases stock, marks "Payment Failed"
9. **How does product search work?** â†’ Server-side filtering with MongoDB regex, pagination
10. **Why these technology choices?** â†’ JS full-stack, MongoDB flexibility, Razorpay for India, OpenRouter for model flexibility
11. **What would you improve?** â†’ TypeScript, proper OAuth, Redis, testing, logging
12. **Security weaknesses?** â†’ Admin auth flaw, regex injection, Firebase trust, no rate limiting
13. **How does Google login work?** â†’ Firebase popup â†’ name+email to backend â†’ JWT cookie
14. **How do webhooks work?** â†’ HMAC-SHA256 verification, payment.captured/failed handlers
15. **What is idempotency?** â†’ UUID key â†’ MongoDB unique index lock â†’ cached responses
16. **How does the AI access data?** â†’ AI extracts filters, backend queries MongoDB, products passed to AI
17. **How does order tracking work?** â†’ Intent classified, orderQueryService queries MongoDB by userId
18. **Hardest technical challenge?** â†’ Payment lifecycle with stock reservation + failure recovery
19. **How do related products work?** â†’ Same category/subcategory query, NOT ML-based
20. **Why separate admin panel?** â†’ Different users, different concerns, independent deployment

---

# RED FLAGS AN INTERVIEWER MIGHT CHALLENGE

| Red Flag | What They'll Ask | Your Honest Answer |
|---|---|---|
| "Agentic AI" on resume | "Define agentic. Is yours truly agentic?" | "It's intent-based with LLM dispatch. I'd more precisely call it an LLM-powered assistant." |
| "Google OAuth" claim | "Is this really OAuth 2.0?" | "Firebase handles the OAuth protocol. My backend receives the authenticated identity." |
| No tests | "How do you know it works?" | "Manual testing and production monitoring. I'd add Jest/Vitest unit tests and API integration tests." |
| Hardcoded admin | "How secure is this?" | "It's a simplification. I'd implement role-based access control." |
| "Orderd Placed" typo | "Did you review your code?" | "A typo that persisted â€” would need a data migration to fix in production." |
| `.env` in repo | "Are your secrets committed?" | "The `.env` is gitignored in production. These are test/development keys." |
| No rate limiting | "What stops API abuse?" | "Not implemented yet. I'd add express-rate-limit, especially on auth and chat." |
| Single server | "What happens under load?" | "Current architecture is single-instance. I'd add load balancing and horizontal scaling." |

---

# FINAL RAPID-FIRE ROUND (50 Questions)

| # | Question | Concise Answer |
|---|---|---|
| 1 | Framework? | Express 5 + React 19 |
| 2 | Database? | MongoDB Atlas with Mongoose 8 |
| 3 | Auth mechanism? | JWT in httpOnly cookies, 7-day expiry |
| 4 | How many MongoDB collections? | 5: Users, Products, Orders, Wishlists, Idempotency |
| 5 | Payment gateway? | Razorpay (test mode) |
| 6 | Image hosting? | Cloudinary, `trendies-products` folder |
| 7 | AI model? | DeepSeek v3 via OpenRouter |
| 8 | How many intents? | 8 |
| 9 | Conversation memory? | No â€” each message is independent (V1) |
| 10 | How is cart stored? | Embedded object on User document |
| 11 | How are sizes stored? | Map of Stringâ†’Number on Product |
| 12 | Stock reservation method? | Atomic `findOneAndUpdate` with `$gte` + `$inc` |
| 13 | Webhook security? | HMAC-SHA256 signature verification |
| 14 | Frontend styling? | Tailwind CSS v4 |
| 15 | State management? | React Context API (4 contexts) |
| 16 | Deployment platform? | Render (3 separate services) |
| 17 | File upload library? | Multer with memory storage |
| 18 | Password hashing? | bcryptjs, salt rounds: 10 |
| 19 | Email validation? | `validator.isEmail()` |
| 20 | Minimum password length? | 6 characters |
| 21 | JWT payload for users? | `{ userId }` |
| 22 | JWT payload for admin? | `{ email }` |
| 23 | Cookie settings in prod? | httpOnly, secure, sameSite: "None" |
| 24 | CORS origins? | localhost:5173, localhost:5174, both Render URLs |
| 25 | Product images count? | 4 per product (image1-image4) |
| 26 | Max chat message length? | 500 characters |
| 27 | Idempotency key TTL? | 24 hours (MongoDB TTL index) |
| 28 | Stale lock timeout? | 2 minutes |
| 29 | Products per page? | 12 |
| 30 | Max products in chat search? | 20 from DB, top 10 sent to LLM |
| 31 | AI temperature? | 0.1 for classification |
| 32 | Order statuses? | Pending Payment, Orderd Placed, Packing, Shipped, Out for Delivery, Delivered, Payment Failed, Cancelled |
| 33 | How are Google users stored? | name + email, NO password field |
| 34 | Virtual try-on implemented? | No â€” stub endpoint returning dummy URL |
| 35 | Related products logic? | Same category + subcategory, limit 4, exclude current |
| 36 | Price range filter example? | "0-50", "50-100", "100-200", "200+" |
| 37 | How does search work in chatbot? | AI extracts `searchTerm` â†’ regex on name + description |
| 38 | Admin credentials storage? | Environment variables (hardcoded comparison) |
| 39 | How many LLM calls per chat? | 1 (classification only) or 2 (classification + response generation) |
| 40 | Which intents need 2nd LLM call? | PRODUCT_INFO, PRODUCT_RECOMMENDATION, FASHION_ADVICE |
| 41 | Which intents are programmatic? | PRODUCT_SEARCH, ORDER_STATUS, ORDER_HISTORY, STORE_INFO, OUT_OF_SCOPE |
| 42 | Frontend animation library? | Framer Motion |
| 43 | Notification library? | react-toastify |
| 44 | Admin panel pages? | Home, Add, List, Orders |
| 45 | How does COD payment confirm? | Admin marks "Delivered" â†’ payment auto-set to true |
| 46 | What happens on modal dismiss? | cancelRazorpay releases stock, sets status "Cancelled" |
| 47 | Category options? | Men, Women, Kids |
| 48 | SubCategory options? | Topwear, Bottomwear, Winterwear |
| 49 | Currency? | INR (â‚¹) |
| 50 | Delivery fee? | â‚¹5 (hardcoded in ShopContext) |

---

# HOW TO USE THIS GUIDE

1. **Before the interview:** Read Parts 1-4 completely. Memorize the Top 20 Must-Know questions.
2. **30-second intro:** Use verbatim when they say "Tell me about your project"
3. **When challenged on "Agentic AI":** Use the defense script from Part 1. Be honest.
4. **When asked about weaknesses:** Acknowledge them and explain production improvements.
5. **When asked to show code:** Reference specific files and line numbers from this guide.
6. **Key principle:** Never claim features that don't exist. Explain simple implementations well.

> **Remember: An interviewer respects honesty about limitations far more than exaggerated claims. Explain what you built, why you built it that way, and what you'd improve.**
