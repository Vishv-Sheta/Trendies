# E-Commerce Project: Advanced Architecture Interview Prep (Part 2)

This document contains a specialized set of interview questions focusing entirely on the **advanced architectural improvements** you recently implemented: API Idempotency, Razorpay Webhooks, Backend Pagination, and Atomic Database Locking. 

These are the exact types of questions Senior Engineers will ask when probing your resume points about "seamless payment processing" and "full-stack development at scale."

---

## 🟢 Easy Category (Foundational Concepts)

**1. You mentioned integrating Razorpay. Why did you decide to implement Webhooks instead of just relying on the frontend success callback?**
> **Answer:** Relying solely on the frontend success callback is vulnerable to the "browser-close" bug. If a user's internet drops or they close their tab the exact millisecond the payment succeeds, the frontend never tells the backend, leaving the order unpaid in the database. Webhooks solve this by enabling direct server-to-server communication, ensuring my backend gets the payment confirmation directly from Razorpay regardless of what happens on the user's device.

**2. What is API Idempotency and why is it critical for your checkout flow?**
> **Answer:** Idempotency guarantees that making the same request multiple times has the same effect as making it once. In an e-commerce checkout, if a user experiences a laggy network and spams the "Place Order" button, or if their browser auto-retries a timed-out request, an idempotent API ensures they are only charged once and only one order is created, preventing duplicate orders and double-billing.

**3. Why did you move product filtering and pagination from the frontend to the backend?**
> **Answer:** Initially, the frontend fetched the entire product catalog and used JavaScript `.filter()` in memory. While fast for 50 items, this breaks down at scale. Fetching 10,000 items wastes massive amounts of server RAM, bandwidth, and causes the user's browser to freeze. By migrating to the backend, MongoDB does the heavy lifting, returning only the exact 12 products needed for the current page, which keeps the API response in milliseconds.

---

## 🟡 Medium Category (Implementation Details)

**4. Walk me through exactly how you implemented API Idempotency in Node.js.**
> **Answer:** When the checkout page loads, the frontend generates a unique UUID and stores it in a `useRef`. When the user submits, this UUID is sent in the `Idempotency-Key` header. My backend middleware intercepts this and attempts to insert the key into a MongoDB collection that has a `Unique Index`. This unique index acts as an atomic lock. If the insert succeeds, it's the first request, and we process it. If it fails with a duplicate key error, we intercept the error and return the cached response of the original request.

**5. How do you verify that a webhook is actually coming from Razorpay and not a malicious hacker trying to fake payments?**
> **Answer:** Razorpay signs every webhook payload using a secret key we share. In my webhook controller, I use Node's native `crypto` module to generate an HMAC-SHA256 hash of the incoming `req.body` using my environment variable secret. I then compare my generated hash against the `x-razorpay-signature` header sent by Razorpay. If they match, the payload is 100% authentic.

**6. How does your backend dynamically build MongoDB queries based on user filters?**
> **Answer:** The frontend sends a query string (e.g., `?category=Men,Kids&priceRanges=0-50`). My backend parses this and dynamically builds a `query` object. For text search, I use `$regex` with case-insensitivity. For categories, I split the string into an array and use the `$in` operator. For price ranges, I map the ranges into `$gte` (greater than) and `$lt` (less than) conditions, and wrap them in an `$or` array so a product can match any of the selected ranges.

**7. How does your stock management system handle two users trying to buy the exact same last item at the exact same millisecond?**
> **Answer:** I implemented row-level locking using MongoDB's atomic operations. When reserving stock, I don't just fetch the product and update it in Node.js. Instead, I use `findOneAndUpdate` with a specific query condition: `[`sizes.${size}`]: { $gte: requested_qty }`. This tells MongoDB at the database level to only decrement the stock if there is enough available. The database naturally serializes these requests, so one user succeeds and the other gets an out-of-stock error, preventing negative inventory.

---

## 🔴 Hard Category (Edge Cases & Deep Architecture)

**8. What is the "Ghost Cart" vulnerability, and how does your idempotency system prevent it?**
> **Answer:** The Ghost Cart bug happens when a user attempts to reuse an idempotency key with different payload data (e.g., they successfully order a $10 shirt, then intercept the request and replay the exact same idempotency key but with a $1000 laptop in the payload). To prevent this, my middleware hashes the `req.body` using SHA-256 and saves it. If a duplicate request arrives, I compare the new payload's hash to the saved `payloadHash`. If they differ, I reject the request with a 400 Bad Request, strictly tying the key to its original cart data.

**9. In your webhook implementation, why do you return a `200 OK` to Razorpay even if your database throws an error?**
> **Answer:** Razorpay operates on a strict retry schedule. If my server returns a `500 Internal Error` because my database temporarily went down, Razorpay will assume the message wasn't received and will continually retry sending the webhook. This can effectively DDoS my own server. By returning a `200 OK` in the `catch` block, I acknowledge receipt of the message to stop the retries. (In a production environment, I would log the failed payload to a file or Sentry so it can be manually processed later).

**10. How does your idempotency system recover if your Node.js server crashes halfway through processing an order?**
> **Answer:** If the server crashes during processing, the database lock will be stuck in a `"processing"` state forever. To fix this, my MongoDB schema includes a `startedAt` timestamp. When a duplicate request arrives and sees the lock is "processing", it checks how much time has elapsed. If the lock is older than a defined timeout (e.g., 2 minutes), the system assumes the original server process died, deletes the stale lock, and safely allows the retry request to take over.

**11. Razorpay's `payment.captured` webhook payload doesn't include your MongoDB Order ID directly. How did you bridge this gap?**
> **Answer:** This is a tricky edge case. The webhook payload only gives us the `razorpay_order_id`. To bridge the gap, my webhook controller uses the Razorpay Node.js SDK (`razorpayInstance.orders.fetch`) to make a quick API call back to Razorpay to fetch the full order details. Inside that full order object is the `receipt` field, which is where I originally embedded my MongoDB Order `_id` during the checkout initialization.

**12. How did you optimize the performance of your backend pagination queries?**
> **Answer:** I implemented two major optimizations. First, I use Mongoose's `.lean()` method, which strips away all the heavy Mongoose wrappers and returns raw JSON, significantly speeding up serialization. Second, pagination requires two queries: fetching the 12 products and counting the total documents for the UI pages. Instead of awaiting them sequentially, I run `.find()` and `.countDocuments()` simultaneously using `Promise.all()`, effectively cutting the database latency in half.
