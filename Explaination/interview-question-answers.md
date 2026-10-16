# Trendies - E-Commerce Platform: Interview Preparation (Why & How)

This document contains expected interview questions based on your resume points for the **Trendies** project, focusing on architectural decisions ("Why?") and implementation details ("How?").

---

## 1. Architecture and Tech Stack

### Q: Why did you choose the MERN stack for this project?
**Answer (Why):** 
I chose the MERN stack for a few key reasons:
1. **Single Language (JavaScript/TypeScript):** Using JavaScript across both the frontend (React) and backend (Node.js/Express) reduces context switching and allows for code reuse.
2. **Performance:** Node.js uses a non-blocking, event-driven architecture, making it highly efficient for handling concurrent API requests—which is crucial for an e-commerce platform processing searches, payments, and AI interactions simultaneously.
3. **Dynamic UI:** React's component-based architecture allowed me to build a highly interactive and responsive user interface for complex features like shopping carts, filtering, and the AI chatbot.

### Q: Why did you choose a NoSQL database like MongoDB over a traditional SQL database like PostgreSQL or MySQL?
**Answer (Why):**
For an e-commerce platform like Trendies, MongoDB was a better fit than SQL because:
1. **Flexible Schema for Products:** E-commerce products have highly variable attributes (e.g., a t-shirt has size/color, while a watch has dial-size/strap-material). MongoDB's document model allows me to store these diverse structures in a single collection without creating complex, sparsely-populated tables or writing heavy `JOIN` queries.
2. **JSON Compatibility:** MongoDB stores data in BSON (binary JSON), which maps seamlessly to the JavaScript objects used in Node.js and React, making data fetching and manipulation very straightforward.
3. **Agile Development:** As a solo developer, the flexible schema allowed me to iterate on product features quickly without constantly running database migration scripts.

### Q: Follow-up: How did you actually implement this flexible schema in your code?
**Answer (How):**
In my Mongoose `Product` model, instead of rigidly defining every possible product attribute (which would result in mostly empty fields depending on the item), I utilized a dynamic data structure for product specifics. 
I handled this by using the Mongoose `Map` type (or an array of key-value objects/`Schema.Types.Mixed`). Here's an example:
```javascript
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  // Flexible attributes that change based on product type!
  attributes: {
    type: Map,
    of: String // e.g., { "size": "L", "color": "Red" } OR { "dial_size": "42mm" }
  }
});
```
This approach allows the React frontend to pass whatever specific attributes are relevant to that product category, and MongoDB neatly stores them inside the exact same `products` collection. No need for complex SQL `JOIN`s or maintaining separate tables for 'Shirts', 'Shoes', and 'Watches'.

### Q: Why did you use Cloudinary?
**Answer (Why):**
Cloudinary was used for media management (product images). Instead of storing large image files on my own server (which slows down performance and eats up bandwidth), Cloudinary handles image hosting, optimization, and on-the-fly transformations (like resizing for thumbnails), ensuring the website loads quickly.

---

## 2. Authentication & User Management

### Q: Why did you implement Google OAuth instead of just standard email/password authentication?
**Answer (Why):**
1. **Frictionless Onboarding:** It significantly reduces the barrier to entry. Users can log in with one click instead of filling out a form, confirming their email, and remembering another password, which increases conversion rates.
2. **Security:** I don't have to store or hash sensitive user passwords on my database. I rely on Google's industry-leading security infrastructure.

### Q: How did you implement Google OAuth in your MERN app?
**Answer (How):**
I used Google Identity Services (or Passport.js). The flow works like this:
1. The user clicks "Login with Google" on the React frontend.
2. Google authenticates the user and returns an ID token or Auth Code.
3. The frontend sends this token to my Node.js backend.
4. The backend verifies the token with Google's servers. If valid, I check if the user exists in my MongoDB database. If not, I create a new user record using their Google email and name.
5. Finally, my backend generates a custom JWT (JSON Web Token), sends it back to the frontend (usually in an HttpOnly cookie), and uses that JWT for authenticating subsequent API requests.

---

## 3. Core E-Commerce Features (Search, Filtering, Recommendations)

### Q: How did you implement product search and filtering?
**Answer (How):**
On the backend, I utilized MongoDB's querying capabilities. 
- For **filtering** (e.g., by category, price range), the frontend sends query parameters (like `?category=men&minPrice=500`). The backend parses these and uses MongoDB operators like `$match`, `$gte`, and `$lte` to filter the documents.
- For **search**, I used MongoDB's `$regex` operator (or Text Indexes) to perform case-insensitive matches against product names and descriptions.
- I also implemented backend pagination to ensure fast response times, rather than sending the entire catalog to the frontend at once.

### Q: How did you handle related product recommendations?
**Answer (How):**
*Note: Adjust this based on your actual implementation.*
I implemented a content-based recommendation system. When a user views a product, the backend queries MongoDB for other products that share the same `category` or `tags`, excluding the current product ID. To optimize this, I limit the query to return only the top 4-5 matching items.

---

## 4. Payment Gateway Integration

### Q: Why did you choose Razorpay?
**Answer (Why):**
Razorpay is highly reliable for the Indian market, supports a wide variety of payment methods (UPI, Cards, Netbanking), and provides excellent developer documentation with robust Webhook support, which is critical for handling asynchronous payment confirmations.

### Q: How did you implement the Razorpay payment flow and handle edge cases (like a user closing the browser during payment)?
**Answer (How):**
1. **Order Creation:** When a user checks out, my Node.js backend calls the Razorpay API to create an order and receives an `order_id`.
2. **Frontend Checkout:** The React frontend opens the Razorpay UI using this `order_id`.
3. **Webhooks (Crucial Step):** To handle edge cases like the user closing the browser or network drops, I implemented Razorpay Webhooks. 
4. When a payment succeeds, Razorpay hits my backend webhook endpoint (`payment.captured`). 
5. My backend verifies the webhook signature using `HMAC-SHA256` to ensure the request is genuinely from Razorpay. Once verified, I update the order status in MongoDB to "Paid" and adjust the inventory.
6. **Idempotency:** I added idempotency logic using the Razorpay `order_id` to ensure that if a webhook is received multiple times, the order is only processed once, preventing duplicate inventory deductions.

---

## 5. AI Chatbot Integration (The Standout Feature)

### Q: Why did you integrate an AI chatbot into an e-commerce platform?
**Answer (Why):**
I wanted to bridge the gap between physical and online shopping. A traditional search bar requires users to know exactly what they want. An AI chatbot acts as a virtual stylist—users can type natural language like *"I have a beach wedding to attend, what should I wear?"*, and the bot provides personalized advice while directly linking to my platform's products, boosting engagement and sales.

### Q: How did you build the AI Chatbot and integrate it with your MongoDB database?
**Answer (How):**
I built this using the OpenRouter API (which acts as a gateway to various LLMs).
1. **Intent Classification:** When a user sends a message, I use a specific system prompt to instruct the LLM to classify the user's intent (e.g., `SEARCH_PRODUCT`, `FASHION_ADVICE`, `ORDER_TRACKING`, `GENERAL_CHAT`).
2. **Dynamic Tools/RAG (Retrieval-Augmented Generation):** 
   - If the intent is `ORDER_TRACKING`, the backend extracts the order ID, queries MongoDB, and formats the status into a natural language response.
   - If the intent is `SEARCH_PRODUCT` or `FASHION_ADVICE`, the backend translates the LLM's identified keywords into a MongoDB query.
3. **Grounding in Real Data:** I fetch the actual product data (names, prices, links) from MongoDB and inject that data back into the LLM's context. The LLM then generates a conversational response that *only* recommends products actually available in my store, preventing hallucinations.

### Q: What were the challenges with the AI integration?
**Answer (How):**
The biggest challenge was "hallucination"—preventing the AI from recommending products I don't sell. I solved this by strictly enforcing Intent Classification and using the LLM primarily as a natural language router and formatter, while relying on my MongoDB database as the absolute source of truth for all product data.

---

## 6. Admin Dashboard

### Q: How does the Admin Dashboard interact with the main application?
**Answer (How):**
The Admin Dashboard is built with React and communicates with secured backend routes. 
- **Security:** Admin routes are protected by middleware that checks the JWT payload for a specific `role: 'admin'` flag. 
- **Functionality:** It allows for complete CRUD operations on products. When an admin uploads a new product, the images are sent to Cloudinary, and the returned secure URLs are saved alongside the product details in MongoDB. It also provides an interface to update order statuses (e.g., from "Processing" to "Shipped").
