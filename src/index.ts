import express, { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

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

// ============ CLOUDFLARE R2 CONFIGURATION ============

// Configure S3 client for Cloudflare R2
const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT, // e.g., https://your-account-id.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (
    req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ) => {
    // Accept only images
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Только изображения разрешены"));
    }
  },
});

// ============ IN-MEMORY CACHE ============

// Global in-memory cache for all data
let dataCache: DataStore = {
  products: [],
  categories: [],
  collections: [],
  settings: { phoneNumber: "" },
};

// Flag to track if cache is loaded
let isCacheLoaded = false;

// Load data from files into cache
async function loadDataIntoCache(): Promise<void> {
  try {
    console.log("📦 Загрузка данных в кэш...");
    const [categoriesData, productsData, collectionsData, settingsData] =
      await Promise.all([
        fs.readFile(CATEGORIES_FILE, "utf8"),
        fs.readFile(PRODUCTS_FILE, "utf8"),
        fs.readFile(COLLECTIONS_FILE, "utf8"),
        fs.readFile(SETTINGS_FILE, "utf8"),
      ]);

    dataCache = {
      categories: JSON.parse(categoriesData),
      products: JSON.parse(productsData),
      collections: JSON.parse(collectionsData),
      settings: JSON.parse(settingsData),
    };

    isCacheLoaded = true;
    console.log("✅ Кэш загружен успешно");
    console.log(`   - Продуктов: ${dataCache.products.length}`);
    console.log(`   - Категорий: ${dataCache.categories.length}`);
    console.log(`   - Коллекций: ${dataCache.collections.length}`);
  } catch (error) {
    console.error("❌ Ошибка загрузки данных в кэш:", error);
    // Keep default empty cache
    isCacheLoaded = true; // Set to true anyway to allow server to start
  }
}

// Get data from cache
function getCachedData(): DataStore {
  return dataCache;
}

// Save cache to files asynchronously (non-blocking)
function saveCacheAsync(): void {
  // Don't await - fire and forget
  Promise.all([
    fs.writeFile(
      CATEGORIES_FILE,
      JSON.stringify(dataCache.categories, null, 2),
      "utf8"
    ),
    fs.writeFile(
      PRODUCTS_FILE,
      JSON.stringify(dataCache.products, null, 2),
      "utf8"
    ),
    fs.writeFile(
      COLLECTIONS_FILE,
      JSON.stringify(dataCache.collections, null, 2),
      "utf8"
    ),
    fs.writeFile(
      SETTINGS_FILE,
      JSON.stringify(dataCache.settings, null, 2),
      "utf8"
    ),
  ]).catch((error) => {
    console.error("❌ Ошибка асинхронного сохранения данных:", error);
  });
}

// ============ CATEGORIES ============

// Get all categories
app.get("/api/categories", (req: Request, res: Response) => {
  try {
    const data = getCachedData();
    res.json(data.categories);
  } catch (error) {
    res.status(500).json({ error: "Ошибка загрузки категорий" });
  }
});

// Get category by ID
app.get("/api/categories/:id", (req: Request, res: Response) => {
  try {
    const data = getCachedData();
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
app.post("/api/categories", (req: Request, res: Response) => {
  try {
    const newCategory: Category = {
      id: Date.now().toString(),
      ...req.body,
    };

    dataCache.categories.push(newCategory);
    saveCacheAsync();
    res.status(201).json(newCategory);
  } catch (error) {
    res.status(500).json({ error: "Ошибка создания категории" });
  }
});

// Update category
app.put("/api/categories/:id", (req: Request, res: Response) => {
  try {
    const index = dataCache.categories.findIndex((c) => c.id === req.params.id);

    if (index !== -1) {
      dataCache.categories[index] = {
        ...dataCache.categories[index],
        ...req.body,
      };
      saveCacheAsync();
      res.json(dataCache.categories[index]);
    } else {
      res.status(404).json({ error: "Категория не найдена" });
    }
  } catch (error) {
    res.status(500).json({ error: "Ошибка обновления категории" });
  }
});

// Delete category
app.delete("/api/categories/:id", (req: Request, res: Response) => {
  try {
    const index = dataCache.categories.findIndex((c) => c.id === req.params.id);

    if (index !== -1) {
      dataCache.categories.splice(index, 1);
      saveCacheAsync();
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
app.get("/api/products", (req: Request, res: Response) => {
  try {
    const data = getCachedData();
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
app.get("/api/products/:id", (req: Request, res: Response) => {
  try {
    const data = getCachedData();
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
app.patch("/api/products/:id/like", (req: Request, res: Response) => {
  try {
    const product = dataCache.products.find((p) => p.id === req.params.id);

    if (product) {
      product.isLiked = !product.isLiked;
      saveCacheAsync();
      res.json(product);
    } else {
      res.status(404).json({ error: "Товар не найден" });
    }
  } catch (error) {
    res.status(500).json({ error: "Ошибка обновления товара" });
  }
});

// Create new product
app.post("/api/products", (req: Request, res: Response) => {
  try {
    const newProduct: Product = {
      id: Date.now().toString(),
      ...req.body,
      isLiked: false,
    };

    dataCache.products.push(newProduct);
    saveCacheAsync();
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: "Ошибка создания товара" });
  }
});

// Update product
app.put("/api/products/:id", (req: Request, res: Response) => {
  try {
    const index = dataCache.products.findIndex((p) => p.id === req.params.id);

    if (index !== -1) {
      dataCache.products[index] = { ...dataCache.products[index], ...req.body };
      saveCacheAsync();
      res.json(dataCache.products[index]);
    } else {
      res.status(404).json({ error: "Товар не найден" });
    }
  } catch (error) {
    res.status(500).json({ error: "Ошибка обновления товара" });
  }
});

// Delete product
app.delete("/api/products/:id", (req: Request, res: Response) => {
  try {
    const index = dataCache.products.findIndex((p) => p.id === req.params.id);

    if (index !== -1) {
      dataCache.products.splice(index, 1);
      saveCacheAsync();
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
app.post("/api/admin/auth", (req: Request, res: Response) => {
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
app.get("/api/settings/phone", (req: Request, res: Response) => {
  try {
    const data = getCachedData();
    res.json({ phoneNumber: data.settings.phoneNumber });
  } catch (error) {
    res.status(500).json({ error: "Ошибка загрузки настроек" });
  }
});

// Update phone number for orders
app.put("/api/settings/phone", (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.body;

    if (phoneNumber === undefined) {
      return res.status(400).json({ error: "Номер телефона не указан" });
    }

    dataCache.settings.phoneNumber = phoneNumber;
    saveCacheAsync();

    res.json({
      message: "Номер телефона обновлен",
      phoneNumber: dataCache.settings.phoneNumber,
    });
  } catch (error) {
    res.status(500).json({ error: "Ошибка обновления настроек" });
  }
});

// ============ COLLECTIONS ============

// Get all collections
app.get("/api/collections", (req: Request, res: Response) => {
  try {
    const data = getCachedData();
    res.json(data.collections);
  } catch (error) {
    res.status(500).json({ error: "Ошибка загрузки коллекций" });
  }
});

// Get collection by ID with full product details
app.get("/api/collections/:id", (req: Request, res: Response) => {
  try {
    const data = getCachedData();
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
app.post("/api/collections", (req: Request, res: Response) => {
  try {
    const newCollection: Collection = {
      id: Date.now().toString(),
      ...req.body,
    };

    dataCache.collections.push(newCollection);
    saveCacheAsync();
    res.status(201).json(newCollection);
  } catch (error) {
    res.status(500).json({ error: "Ошибка создания коллекции" });
  }
});

// Update collection
app.put("/api/collections/:id", (req: Request, res: Response) => {
  try {
    const index = dataCache.collections.findIndex(
      (c) => c.id === req.params.id
    );

    if (index !== -1) {
      dataCache.collections[index] = {
        ...dataCache.collections[index],
        ...req.body,
      };
      saveCacheAsync();
      res.json(dataCache.collections[index]);
    } else {
      res.status(404).json({ error: "Коллекция не найдена" });
    }
  } catch (error) {
    res.status(500).json({ error: "Ошибка обновления коллекции" });
  }
});

// Delete collection
app.delete("/api/collections/:id", (req: Request, res: Response) => {
  try {
    const index = dataCache.collections.findIndex(
      (c) => c.id === req.params.id
    );

    if (index !== -1) {
      dataCache.collections.splice(index, 1);
      saveCacheAsync();
      res.json({ message: "Коллекция удалена" });
    } else {
      res.status(404).json({ error: "Коллекция не найдена" });
    }
  } catch (error) {
    res.status(500).json({ error: "Ошибка удаления коллекции" });
  }
});

// ============ IMAGE UPLOAD ============

// Upload image to Cloudflare R2
app.post(
  "/api/upload",
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      const file = req.file as Express.Multer.File | undefined;

      if (!file) {
        return res.status(400).json({ error: "Файл не был загружен" });
      }

      // Generate unique filename
      const fileExtension = path.extname(file.originalname);
      const uniqueFilename = `${crypto.randomUUID()}${fileExtension}`;
      const key = `images/${uniqueFilename}`;

      // Upload to R2
      const uploadCommand = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME || "images",
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await r2Client.send(uploadCommand);

      // Construct public URL
      const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

      res.json({
        success: true,
        url: publicUrl,
        filename: uniqueFilename,
      });
    } catch (error) {
      console.error("Ошибка загрузки изображения:", error);
      res.status(500).json({ error: "Ошибка загрузки изображения" });
    }
  }
);

// ============ SERVER START ============

// Start server after loading cache
async function startServer() {
  try {
    // Load all data into cache before starting server
    await loadDataIntoCache();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
      console.log(`✨ Все данные загружены в память`);
      console.log(`⚡ Сервер готов к обработке запросов`);
    });
  } catch (error) {
    console.error("❌ Ошибка запуска сервера:", error);
    process.exit(1);
  }
}

// Initialize server
startServer();
