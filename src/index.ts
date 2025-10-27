import express, { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Types
interface Volume {
  volume: string;
  price: number;
}

interface Product {
  id: string;
  name: string;
  description: string;
  image: string;
  volumes: Volume[];
  categoryId: string;
  isLiked: boolean;
}

interface Category {
  id: string;
  name: string;
}

interface ProductReference {
  productId: string;
  recommendedVolumeIndex: number;
}

interface Collection {
  id: string;
  name: string;
  description: string;
  productIds: ProductReference[];
}

interface Settings {
  phoneNumber: string;
}

interface DataStore {
  products: Product[];
  categories: Category[];
  collections: Collection[];
  settings: Settings;
}

// Express app setup
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use("/images", express.static(path.join(__dirname, "public/images")));

// Data file paths
const CATEGORIES_FILE = path.join(__dirname, "data", "categories.json");
const PRODUCTS_FILE = path.join(__dirname, "data", "products.json");
const COLLECTIONS_FILE = path.join(__dirname, "data", "collections.json");
const SETTINGS_FILE = path.join(__dirname, "data", "settings.json");

// Load data from files
async function loadData(): Promise<DataStore> {
  try {
    const [categoriesData, productsData, collectionsData, settingsData] =
      await Promise.all([
        fs.readFile(CATEGORIES_FILE, "utf8"),
        fs.readFile(PRODUCTS_FILE, "utf8"),
        fs.readFile(COLLECTIONS_FILE, "utf8"),
        fs.readFile(SETTINGS_FILE, "utf8"),
      ]);

    return {
      categories: JSON.parse(categoriesData),
      products: JSON.parse(productsData),
      collections: JSON.parse(collectionsData),
      settings: JSON.parse(settingsData),
    };
  } catch (error) {
    console.error("Ошибка чтения данных:", error);
    return {
      products: [],
      categories: [],
      collections: [],
      settings: { phoneNumber: "" },
    };
  }
}

// Save data to files
async function saveData(data: DataStore): Promise<void> {
  try {
    await Promise.all([
      fs.writeFile(
        CATEGORIES_FILE,
        JSON.stringify(data.categories, null, 2),
        "utf8"
      ),
      fs.writeFile(
        PRODUCTS_FILE,
        JSON.stringify(data.products, null, 2),
        "utf8"
      ),
      fs.writeFile(
        COLLECTIONS_FILE,
        JSON.stringify(data.collections, null, 2),
        "utf8"
      ),
      fs.writeFile(
        SETTINGS_FILE,
        JSON.stringify(data.settings, null, 2),
        "utf8"
      ),
    ]);
  } catch (error) {
    console.error("Ошибка сохранения данных:", error);
    throw error;
  }
}

// ============ CATEGORIES ============

// Get all categories
app.get("/api/categories", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    res.json(data.categories);
  } catch (error) {
    res.status(500).json({ error: "Ошибка загрузки категорий" });
  }
});

// Get category by ID
app.get("/api/categories/:id", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    const category = data.categories.find((c) => c.id === req.params.id);

    if (category) {
      res.json(category);
    } else {
      res.status(404).json({ error: "Категория не найдена" });
    }
  } catch (error) {
    res.status(500).json({ error: "Ошибка загрузки категории" });
  }
});

// Create new category
app.post("/api/categories", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    const newCategory: Category = {
      id: Date.now().toString(),
      ...req.body,
    };

    data.categories.push(newCategory);
    await saveData(data);
    res.status(201).json(newCategory);
  } catch (error) {
    res.status(500).json({ error: "Ошибка создания категории" });
  }
});

// Update category
app.put("/api/categories/:id", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    const index = data.categories.findIndex((c) => c.id === req.params.id);

    if (index !== -1) {
      data.categories[index] = { ...data.categories[index], ...req.body };
      await saveData(data);
      res.json(data.categories[index]);
    } else {
      res.status(404).json({ error: "Категория не найдена" });
    }
  } catch (error) {
    res.status(500).json({ error: "Ошибка обновления категории" });
  }
});

// Delete category
app.delete("/api/categories/:id", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    const index = data.categories.findIndex((c) => c.id === req.params.id);

    if (index !== -1) {
      data.categories.splice(index, 1);
      await saveData(data);
      res.json({ message: "Категория удалена" });
    } else {
      res.status(404).json({ error: "Категория не найдена" });
    }
  } catch (error) {
    res.status(500).json({ error: "Ошибка удаления категории" });
  }
});

// ============ PRODUCTS ============

// Get all products with optional filters
app.get("/api/products", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    let products = data.products;

    // Filter by category
    if (req.query.categoryId) {
      products = products.filter((p) => p.categoryId === req.query.categoryId);
    }

    // Filter by liked
    if (req.query.isLiked === "true") {
      products = products.filter((p) => p.isLiked === true);
    }

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: "Ошибка загрузки товаров" });
  }
});

// Get product by ID
app.get("/api/products/:id", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    const product = data.products.find((p) => p.id === req.params.id);

    if (product) {
      res.json(product);
    } else {
      res.status(404).json({ error: "Товар не найден" });
    }
  } catch (error) {
    res.status(500).json({ error: "Ошибка загрузки товара" });
  }
});

// Toggle product like
app.patch("/api/products/:id/like", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    const product = data.products.find((p) => p.id === req.params.id);

    if (product) {
      product.isLiked = !product.isLiked;
      await saveData(data);
      res.json(product);
    } else {
      res.status(404).json({ error: "Товар не найден" });
    }
  } catch (error) {
    res.status(500).json({ error: "Ошибка обновления товара" });
  }
});

// Create new product
app.post("/api/products", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    const newProduct: Product = {
      id: Date.now().toString(),
      ...req.body,
      isLiked: false,
    };

    data.products.push(newProduct);
    await saveData(data);
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: "Ошибка создания товара" });
  }
});

// Update product
app.put("/api/products/:id", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    const index = data.products.findIndex((p) => p.id === req.params.id);

    if (index !== -1) {
      data.products[index] = { ...data.products[index], ...req.body };
      await saveData(data);
      res.json(data.products[index]);
    } else {
      res.status(404).json({ error: "Товар не найден" });
    }
  } catch (error) {
    res.status(500).json({ error: "Ошибка обновления товара" });
  }
});

// Delete product
app.delete("/api/products/:id", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    const index = data.products.findIndex((p) => p.id === req.params.id);

    if (index !== -1) {
      data.products.splice(index, 1);
      await saveData(data);
      res.json({ message: "Товар удален" });
    } else {
      res.status(404).json({ error: "Товар не найден" });
    }
  } catch (error) {
    res.status(500).json({ error: "Ошибка удаления товара" });
  }
});

// ============ ADMIN AUTH ============

// Admin password verification
app.post("/api/admin/auth", async (req: Request, res: Response) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Пароль не указан",
      });
    }

    // Get admin password from environment variable
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (password === adminPassword) {
      res.json({
        success: true,
        message: "Авторизация успешна",
      });
    } else {
      res.status(401).json({
        success: false,
        message: "Неверный пароль",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Ошибка авторизации",
    });
  }
});

// ============ SETTINGS ============

// Get phone number for orders
app.get("/api/settings/phone", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    res.json({ phoneNumber: data.settings.phoneNumber });
  } catch (error) {
    res.status(500).json({ error: "Ошибка загрузки настроек" });
  }
});

// Update phone number for orders
app.put("/api/settings/phone", async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.body;

    if (phoneNumber === undefined) {
      return res.status(400).json({ error: "Номер телефона не указан" });
    }

    const data = await loadData();
    data.settings.phoneNumber = phoneNumber;
    await saveData(data);

    res.json({
      message: "Номер телефона обновлен",
      phoneNumber: data.settings.phoneNumber,
    });
  } catch (error) {
    res.status(500).json({ error: "Ошибка обновления настроек" });
  }
});

// ============ COLLECTIONS ============

// Get all collections
app.get("/api/collections", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    res.json(data.collections);
  } catch (error) {
    res.status(500).json({ error: "Ошибка загрузки коллекций" });
  }
});

// Get collection by ID with full product details
app.get("/api/collections/:id", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    const collection = data.collections.find((c) => c.id === req.params.id);

    if (collection) {
      // Expand product references with full product data
      const productsWithDetails = collection.productIds.map((ref) => {
        const product = data.products.find((p) => p.id === ref.productId);
        return {
          ...ref,
          product,
        };
      });

      res.json({
        ...collection,
        products: productsWithDetails,
      });
    } else {
      res.status(404).json({ error: "Коллекция не найдена" });
    }
  } catch (error) {
    res.status(500).json({ error: "Ошибка загрузки коллекции" });
  }
});

// Create new collection
app.post("/api/collections", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    const newCollection: Collection = {
      id: Date.now().toString(),
      ...req.body,
    };

    data.collections.push(newCollection);
    await saveData(data);
    res.status(201).json(newCollection);
  } catch (error) {
    res.status(500).json({ error: "Ошибка создания коллекции" });
  }
});

// Update collection
app.put("/api/collections/:id", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    const index = data.collections.findIndex((c) => c.id === req.params.id);

    if (index !== -1) {
      data.collections[index] = { ...data.collections[index], ...req.body };
      await saveData(data);
      res.json(data.collections[index]);
    } else {
      res.status(404).json({ error: "Коллекция не найдена" });
    }
  } catch (error) {
    res.status(500).json({ error: "Ошибка обновления коллекции" });
  }
});

// Delete collection
app.delete("/api/collections/:id", async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    const index = data.collections.findIndex((c) => c.id === req.params.id);

    if (index !== -1) {
      data.collections.splice(index, 1);
      await saveData(data);
      res.json({ message: "Коллекция удалена" });
    } else {
      res.status(404).json({ error: "Коллекция не найдена" });
    }
  } catch (error) {
    res.status(500).json({ error: "Ошибка удаления коллекции" });
  }
});

// ============ SERVER START ============

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
