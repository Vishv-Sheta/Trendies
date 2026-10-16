# E-Commerce Inventory Locking: Best Approaches

When dealing with high-concurrency e-commerce systems, one of the biggest architectural decisions is deciding *when* to deduct inventory.

## The Two Main Approaches

### Approach 1: Deduct Stock AFTER Payment Success (The Bad Way)
**How it works:** Users click checkout, they are redirected to Razorpay, they pay, and *only then* does the database reduce the stock to 0.
**Why it's dangerous:** 
Imagine you have 1 unit left. User A and User B both click checkout at the same time. Both go to Razorpay. Both successfully pay. Your backend webhook receives two successful payments and reduces the stock to `-1`. 
**Result:** Overselling. You now have two angry customers who paid for an item you only have one of. You have to manually issue a refund and apologize. This creates a terrible user experience.

### Approach 2: Deduct Stock WHEN STARTING Payment (The Best Practice / Your Current System)
**How it works:** When a user clicks checkout, the backend immediately "reserves" the stock (reduces it to 0). The user is then sent to the Razorpay gateway.
**Why it's better:** 
It mathematically guarantees you will never oversell. If you only have 1 unit, only the very first person to click checkout gets past your server to the payment gateway. Anyone who clicks checkout a millisecond later is blocked *before* they can give you their money.
**The Catch:** "Inventory Tying". If User A goes to Razorpay and just closes their browser without paying, that item is stuck at `0`. 
**The Solution:** This is why we implemented the `releaseStock` function. If the payment fails or is cancelled, we immediately put the stock back to `1`. In large-scale enterprise apps (like Amazon or Flipkart), they also use a time limit: if the payment isn't completed within 15 minutes, the stock is automatically released.

---

## How MongoDB Locking Exactly Solves This

Even if you choose Approach 2 (Deducting stock when starting payment), you still have a massive problem: **The Race Condition**.

What if User A and User B click the checkout button at the **exact same millisecond**? 

If you use standard JavaScript logic, it looks like this:
1. User A's code checks DB: Stock is 1.
2. User B's code checks DB: Stock is 1.
3. User A's code says: "Stock is > 0, so reduce stock to 0".
4. User B's code says: "Stock is > 0, so reduce stock to 0".
*Both users proceed to payment! You oversell!*

### The Lock (Atomic Operations)
We solved this by abandoning JavaScript-level checks and using a MongoDB Document-Level Lock via `findOneAndUpdate`.

```javascript
const product = await Product.findOneAndUpdate(
    {
        _id: item._id,
        [`sizes.${item.size}`]: { $gte: qty } // The Lock Condition
    },
    {
        $inc: { [`sizes.${item.size}`]: -qty } // The Action
    },
    { new: true }
);
```

**How this exact code prevents the millisecond race:**
When two requests hit the database at the same exact millisecond, MongoDB's storage engine (WiredTiger) forces them to form a single-file line. They cannot execute simultaneously.
1. **User A goes first:** MongoDB evaluates `{ $gte: 1 }`. It is true! MongoDB reduces the stock to `0`. 
2. **User B goes second:** MongoDB evaluates `{ $gte: 1 }`. But wait, User A just changed it to `0`. The condition is now FALSE.
3. MongoDB instantly kicks User B out, returning `null`. User B's transaction is halted, and they are shown an "Out of stock" message.

This lock operates entirely inside the database engine, ignoring JavaScript's asynchronous nature, guaranteeing that no matter how much traffic your site gets, it is physically impossible to oversell.
