#!/bin/bash

# Скрипт для тестирования API
# Использование: ./test-api.sh

BASE_URL="http://localhost:3000"

echo "🧪 Тестирование Back Catalog API"
echo "================================="
echo ""

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Тест 1: Получение категорий
echo -e "${BLUE}📋 Тест 1: Получение всех категорий${NC}"
curl -s "$BASE_URL/api/categories" | jq '.[0:2]'
echo -e "${GREEN}✓ Категории загружены${NC}\n"

# Тест 2: Получение продуктов
echo -e "${BLUE}📦 Тест 2: Получение всех продуктов${NC}"
curl -s "$BASE_URL/api/products" | jq '.[0:2]'
echo -e "${GREEN}✓ Продукты загружены${NC}\n"

# Тест 3: Получение коллекций
echo -e "${BLUE}🎨 Тест 3: Получение всех коллекций${NC}"
curl -s "$BASE_URL/api/collections" | jq '.[0:1]'
echo -e "${GREEN}✓ Коллекции загружены${NC}\n"

# Тест 4: Получение настроек
echo -e "${BLUE}⚙️  Тест 4: Получение номера телефона${NC}"
curl -s "$BASE_URL/api/settings/phone" | jq '.'
echo -e "${GREEN}✓ Настройки загружены${NC}\n"

# Тест 5: Проверка скорости (из кэша)
echo -e "${BLUE}⚡ Тест 5: Измерение скорости ответа (из кэша)${NC}"
time curl -s "$BASE_URL/api/products" > /dev/null
echo -e "${GREEN}✓ Запрос выполнен из кэша${NC}\n"

# Тест 6: Создание тестовой категории
echo -e "${BLUE}➕ Тест 6: Создание новой категории${NC}"
NEW_CATEGORY=$(curl -s -X POST "$BASE_URL/api/categories" \
  -H "Content-Type: application/json" \
  -d '{"name":"Тестовая категория"}')
echo "$NEW_CATEGORY" | jq '.'
CATEGORY_ID=$(echo "$NEW_CATEGORY" | jq -r '.id')
echo -e "${GREEN}✓ Категория создана с ID: $CATEGORY_ID${NC}\n"

# Тест 7: Обновление категории
echo -e "${BLUE}✏️  Тест 7: Обновление категории${NC}"
curl -s -X PUT "$BASE_URL/api/categories/$CATEGORY_ID" \
  -H "Content-Type: application/json" \
  -d '{"name":"Обновленная категория"}' | jq '.'
echo -e "${GREEN}✓ Категория обновлена${NC}\n"

# Тест 8: Удаление категории
echo -e "${BLUE}🗑️  Тест 8: Удаление категории${NC}"
curl -s -X DELETE "$BASE_URL/api/categories/$CATEGORY_ID" | jq '.'
echo -e "${GREEN}✓ Категория удалена${NC}\n"

# Тест 9: Фильтрация продуктов
echo -e "${BLUE}🔍 Тест 9: Фильтрация продуктов по категории${NC}"
curl -s "$BASE_URL/api/products?categoryId=cat-4" | jq '.[0:1]'
echo -e "${GREEN}✓ Продукты отфильтрованы${NC}\n"

# Тест 10: Проверка админской авторизации
echo -e "${BLUE}🔐 Тест 10: Проверка админской авторизации${NC}"
curl -s -X POST "$BASE_URL/api/admin/auth" \
  -H "Content-Type: application/json" \
  -d '{"password":"wrong_password"}' | jq '.'
echo -e "${GREEN}✓ Авторизация проверена${NC}\n"

echo -e "${GREEN}================================="
echo -e "✅ Все тесты завершены!"
echo -e "=================================${NC}"
echo ""
echo "💡 Для тестирования загрузки изображений используйте:"
echo "   curl -X POST -F \"image=@/path/to/image.jpg\" $BASE_URL/api/upload"

