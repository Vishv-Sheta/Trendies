# Database Locking Mechanism in Trendies

## The Exact Problems the Locking Mechanism Solves

Before diving into the code, here are the critical problems this locking system resolves in your e-commerce application:

1. **Overselling / Race Conditions**: In high-traffic scenarios (like a flash sale), two users might try to buy the last remaining unit of a product at the exact same millisecond. Without a lock, both might read the stock as `1`, both purchase the item, and the database updates the stock to `-1`, resulting in you having to cancel an order and upset a customer.
2. **Atomic Integrity**: It prevents "dirty reads" and "check-then-act" race conditions by combining the "check if stock is available" and "reduce the stock" steps into a single, indivisible database operation.
3. **Partial Order Fulfillment**: It allows the system to intelligently process a cart where *some* items are in stock but *others* just sold out, allowing the available items to proceed while notifying the user about the removed items, rather than crashing the entire transaction.

---

## Where the Lock is Applied

The locking mechanism is applied at the **Database level** utilizing MongoDB's WiredTiger storage engine document-level locks. 
Architecturally, it is implemented in two specific backend locations:
1. **`backend/services/stockService.js`**: The core logic where the atomic queries are defined.
2. **`backend/controller/orderController.js`**: The checkout controllers (`PlacedOrder` and `placeOrderRazorpay`) where the stock reservation is called before an order is confirmed.

---

## Walkthrough of the Enhanced Code

Here is the exact code implemented to create this locking system and how it works step-by-step.

### 1. The Core Locking Logic (`stockService.js`)
Instead of pulling the product, checking its stock in JavaScript, and then saving it back to the database, we use **MongoDB's `findOneAndUpdate`**.

```javascript
// backend/services/stockService.js
const reserveStock = async (items) => {
    const reservedItems = [];
    const failedItems = [];

    for (const item of items) {
        const qty = item.quantity || 1;

        // THE LOCK: Atomic find and update
        const product = await Product.findOneAndUpdate(
            {
                _id: item._id,
                [`sizes.${item.size}`]: { $gte: qty } // Condition: Stock must be >= requested quantity
            },
            {
                $inc: { [`sizes.${item.size}`]: -qty } // Action: Decrement the stock
            },
            { new: true } // Return the updated document
        );

        if (!product) {
            // Document lock failed: Stock insufficient or product not found
            const failedProduct = await Product.findById(item._id).lean();
            failedItems.push({
                ...item,
                name: failedProduct?.name || "Unknown product",
                availableQty: failedProduct?.sizes?.get?.(item.size) ?? failedProduct?.sizes?.[item.size] ?? 0
            });
        } else {
            // Document lock succeeded: Stock was reserved
            reservedItems.push(item);
        }
    }

    return { 
        success: reservedItems.length > 0, 
        reservedItems,
        failedItems 
    };
};
```

**How it works:** 
The query `{ [`sizes.${item.size}`]: { $gte: qty } }` acts as our lock. MongoDB guarantees that `findOneAndUpdate` is atomic. When two requests hit this simultaneously, the MongoDB engine queues them. The first one finds the stock, reduces it, and finishes. The second one will then evaluate the condition (`$gte: qty`) against the *newly updated* stock. If it's no longer sufficient, it returns null, preventing an oversell.

### 2. Implementing in the Order Controller (`orderController.js`)
We call this locking mechanism right before generating an order (for COD) or starting a payment gateway session (for Razorpay).

```javascript
// backend/controller/orderController.js
const PlacedOrder = async (req, res) => {
    try {
        const { items, address } = req.body;
        let { amount } = req.body;
        const userId = req.userId;

        // 1. ATTEMPT TO ACQUIRE LOCKS
        const stockResult = await reserveStock(items);
        
        // 2. COMPLETE FAILURE: If NO items could be reserved, stop immediately.
        if (!stockResult.success) {
            return res.status(409).json({
                message: "All items in your order are out of stock.",
                failedItems: stockResult.failedItems
            });
        }

        // 3. PARTIAL SUCCESS: Adjust the total bill to exclude out-of-stock items
        if (stockResult.failedItems.length > 0) {
            let failedAmount = 0;
            for (const item of stockResult.failedItems) {
                failedAmount += (item.price * item.quantity);
            }
            amount -= failedAmount;
        }

        // 4. SAVE ORDER: Save using only the reserved items
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
        
        // ... success response with partial fulfillment message ...
    }
}
```

### 3. Releasing the Lock on Failure
If a payment fails or is cancelled, we need to release the reserved stock back into the inventory.

```javascript
// backend/services/stockService.js
const releaseStock = async (items) => {
    for (const item of items) {
        await Product.findByIdAndUpdate(
            item._id,
            { $inc: { [`sizes.${item.size}`]: item.quantity } } // Increments stock back
        );
    }
};

// backend/controller/orderController.js (inside Razorpay verification or creation failure)
// ...
if (error) {
    // Release stock since Razorpay order creation failed
    releaseStock(stockResult.reservedItems);
    return res.status(500).json(error);
}
// ...
```

By coupling MongoDB's internal locking with a service that handles reservations and rollbacks, you guarantee inventory data integrity without needing complex external distributed locks like Redis.

That is an excellent question and it hits exactly on why this system was built the way it is!

Here is exactly what happens in your system when there is only 1 unit left in stock:

1. Adding to the Cart (The Stock Stays at 1)
When User A adds the last item to their cart, the system does not immediately deduct the stock in the database. In your cartController.js, it just does a "soft check" to make sure the item isn't already 0, and then saves it to User A's cartData. Because the database stock remains at 1, User B can also see the item on the website, click "Add to Cart", and have it sit in their cart too.

2. The Race to Checkout
At this point, both User A and User B have the "last item" in their carts. The actual race begins when they click "Place Order" or "Pay".

3. The Winner (Whoever pays/places the order first)
Let's say User A clicks the checkout button a fraction of a second before User B.

User A's request hits the backend.
The reserveStock function uses the database lock (findOneAndUpdate).
It successfully grabs the lock, sees the stock is 1, reduces it to 0, and secures the item for User A.
User A proceeds to the Razorpay payment gateway (or COD succeeds).
4. The Loser (What happens to User B?)
A fraction of a second later, User B's checkout request hits the backend.

The reserveStock function attempts to grab the database lock for User B.
However, the lock evaluates the condition ($gte: 1) against the live database. Because User A just reduced it, the stock is now 0.
The database lock fails for User B.
The backend immediately stops User B's transaction and returns a 409 Conflict error.
On the frontend: User B is shown a notification saying "This item is out of stock and has been removed from your order," and they are blocked from making the payment for that item.
Why do we do it this way?
If you reduced the stock to 0 the moment someone added it to their cart, people could maliciously add all your inventory to their carts and just let it sit there for days without buying it, preventing real customers from making a purchase. By waiting until the exact moment of checkout to lock the stock, you ensure your inventory is always available for whoever is ready to actually buy it!
