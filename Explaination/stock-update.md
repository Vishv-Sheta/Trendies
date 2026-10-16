# Walkthrough: Dynamic Stock Updates & Multi-Category Logic

This document breaks down the exact backend logic implemented to allow dynamic stock updates and multi-category product capabilities in your system.

---

## 1. Dynamic Stock Updates (The Logic)

Previously, you could only set the stock when adding a product for the first time. We implemented a new, independent API to allow the admin to tweak stock quantities on the fly.

### The Route (`backend/routes/productRoute.js`)
We created a secure endpoint specifically for stock updates, protected by your `adminAuth` middleware.
```javascript
productRoute.post("/stock", adminAuth, updateStock);
```

### The Controller (`backend/controller/productController.js`)
The `updateStock` function is incredibly fast and efficient. It receives the `productId` and the newly updated `sizes` object from the admin frontend (e.g., `{ S: 10, M: 5, L: 0 }`).

```javascript
const updateStock = async (req, res) => {
  try {
    const { productId, sizes } = req.body;
    
    if (!productId || !sizes) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    
    // We use Mongoose's findByIdAndUpdate to directly overwrite the sizes object
    const product = await Product.findByIdAndUpdate(
      productId,
      { sizes }, // The new data
      { new: true } // Returns the updated document back to the client
    );
    
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    
    return res.status(200).json({ message: "Stock updated", product });
  } catch (error) {
    console.error("Update stock error:", error);
    return res.status(500).json({ message: "Update stock failed" });
  }
};
```
**Why this approach?**
By sending the entire `sizes` object, we don't have to worry about complicated `$inc` (increment/decrement) logic for admin updates. If you change a `5` to a `10` on the frontend, the backend simply replaces the old object with the new one.

---

## 2. Multi-Category and Sub-Category (The Logic)

We modified the system so a single product can belong to multiple categories simultaneously (e.g., "TopWear" AND "WinterWear").

### The Database Schema (`backend/model/productModel.js`)
We altered the Mongoose schema for the product. Mongoose is extremely flexible—by changing the type to `[String]`, we tell MongoDB to expect an **Array of Strings**.

```javascript
// BEFORE (Only allowed one string)
category: { type: String, required: true },
subCategory: { type: String, required: true },

// AFTER (Allows multiple strings in an array)
category: { type: [String], required: true },
subCategory: { type: [String], required: true },
```
*Note: Mongoose is smart enough to automatically convert your old, single-string database entries (like `"Men"`) into an array format (`["Men"]`) behind the scenes when querying.*

### The Parsing Logic (`backend/controller/productController.js`)
When adding a product with an image, you are using a `multipart/form-data` request. Standard form data **cannot natively send JavaScript arrays**; it can only send text strings and files. 

To solve this, the frontend converts the array into a JSON text string (`'["Men", "Kids"]'`) before sending it. We updated the backend `addProduct` controller to parse that text back into a real JavaScript array before saving it to the database.

```javascript
// Inside addProduct function...

const { name, description, price, category, subCategory, sizes, bestseller } = req.body;

const productData = {
    name,
    description,
    price: Number(price),
    // We use JSON.parse() to convert the stringified arrays back into real Arrays!
    category: JSON.parse(category),       
    subCategory: JSON.parse(subCategory), 
    sizes: JSON.parse(sizes),
    bestseller: bestseller === "true",
    date: Date.now(),
    image1, image2, image3, image4,
};

const product = await Product.create(productData);
```

By adding these small but powerful structural changes to the backend, the frontend UI logic is now free to support powerful multi-select checkboxes and precise inventory adjustments!
