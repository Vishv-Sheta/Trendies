# Comprehensive Guide to Webhooks

## 1. What is a Webhook?
A webhook is a way for one application to send automated, real-time information to another application whenever a specific event occurs. It is essentially a "reverse API."
Instead of your server constantly asking a third-party service (like Razorpay), *"Has the user paid yet? How about now?"* (which is called polling), you provide Razorpay with a URL. When the user successfully pays, Razorpay actively sends a POST request to your URL saying, *"Hey! This payment was just completed!"*

## 2. Problems Without Webhooks & Their Causes
Relying entirely on the frontend to verify payments is highly unreliable and insecure.

### The Problems
1. **The "Browser Close" Bug:** A user makes a payment on Razorpay. The money leaves their bank account. But before the Razorpay popup can close and trigger your frontend success function, the user closes the browser tab, or their phone battery dies, or their internet disconnects. Your backend never gets the signal that the payment succeeded. The user loses their money, but gets no order.
2. **Security Vulnerabilities:** If you only verify payments via the frontend, a malicious user can easily fake a success response or manipulate the network requests to trick your backend into marking an unpaid order as paid.
3. **Delayed Processing:** You have no real-time way to know if a payment failed or succeeded without the user actively keeping the webpage open.

### The Causes
- **Client-Side Dependency:** Frontend code runs on the user's device, which you do not control. It can be closed, paused, or manipulated at any time.

## 3. Cases That Must Be Handled
A robust webhook integration must handle the following scenarios:
1. **Authentication / Security:** How do you know the webhook actually came from Razorpay and not a hacker trying to fake a payment? You must verify cryptographic signatures.
2. **Payment Success (`payment.captured`):** The payment was successful. You need to mark the order as paid in your database.
3. **Payment Failure (`payment.failed`):** The payment failed (e.g., declined card). You need to release the reserved inventory stock so other customers can buy it, and update the order status.
4. **Idempotency (Duplicate Webhooks):** Razorpay guarantees "at least once" delivery. This means they might send the exact same webhook two or three times for the same event to ensure you received it. Your system must not process the same webhook twice.
5. **Fast Acknowledgement:** Razorpay requires you to respond with a `200 OK` status very quickly (usually within 5 seconds). If you take too long, they assume your server is down and will keep retrying.

---

## 4. How It Is Implemented In This Project
In this project, we implemented a secure endpoint (`/api/webhooks/razorpay`) to receive real-time updates from Razorpay regarding order payments.

### Step-by-Step Logic

#### A. Signature Verification (`webhookController.js`)
When a webhook arrives, the very first thing we do is verify its authenticity.
1. Razorpay signs the payload using a secret key (`RAZORPAY_WEBHOOK_SECRET`) and includes a cryptographic signature in the `x-razorpay-signature` header.
2. We take the incoming request body and generate our own HMAC SHA-256 hash using the same secret key.
3. We compare our hash to the signature header. If they match, we know the request is 100% authentically from Razorpay. If they don't, we reject it as a fake request.

#### B. Resolving the Order ID
Razorpay's webhook payload contains a `payment.entity.order_id` (which is Razorpay's internal order ID, e.g., `order_ABC123`). However, our database uses our own MongoDB `_id`. 
To bridge this gap, we use the Razorpay SDK (`razorpayInstance.orders.fetch`) to fetch the full order details. Inside those details is the `receipt` field, which we set to our MongoDB `_id` during order creation. This allows us to accurately find the correct order in our database.

#### C. Handling the Events
1. **If the event is `payment.captured`:**
   - We query the database for the order.
   - **Idempotency Check:** We check `if (!order.payment)`. If it is `false`, we update it to `true`, mark the status as "Orderd Placed", and clear the user's cart.
   - If it is already `true`, we know this is a duplicate webhook retry from Razorpay, and we simply ignore it to prevent double-processing.
   
2. **If the event is `payment.failed`:**
   - We query the database. If the payment is false, we update the status to "Payment Failed".
   - **Crucial Step:** We call `releaseStock(order.items)`. This returns the reserved inventory back to the system so other users can purchase those items, preventing dead stock.

#### D. The Fast `200 OK`
Regardless of what happens—even if there is a database error, or if the order was already processed—we always return `res.status(200).json({ received: true })` at the end of the try/catch block. This guarantees Razorpay receives a fast acknowledgement and stops spamming us with retries.