#!/usr/bin/env bash
# ============================================================
# Скрипт збірки плагіну limansoft-sync-woocommerce
# Використання: bash packages/limansoft-sync-woocommerce/build.sh
# Результат: packages/dist/limansoft-sync-woocommerce.zip
# ============================================================

set -e

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$(dirname "$PLUGIN_DIR")/dist"
ZIP_NAME="limansoft-sync-woocommerce.zip"
PLUGIN_SLUG="limansoft-sync-woocommerce"

echo "🏗  Збірка плагіну ${PLUGIN_SLUG} v$(grep 'Version:' "${PLUGIN_DIR}/limansoft-sync.php" | head -1 | awk '{print $NF}')"

# Створюємо директорію dist
mkdir -p "${DIST_DIR}"

# Тимчасова директорія для збірки
TMP_DIR=$(mktemp -d)
TMP_PLUGIN="${TMP_DIR}/${PLUGIN_SLUG}"
mkdir -p "${TMP_PLUGIN}"

# Копіюємо файли плагіну (виключаємо .git, build.sh, .DS_Store)
rsync -r \
    --exclude='.git' \
    --exclude='.DS_Store' \
    --exclude='*.sh' \
    --exclude='node_modules' \
    "${PLUGIN_DIR}/" "${TMP_PLUGIN}/"

# Створюємо zip
cd "${TMP_DIR}"
zip -r "${DIST_DIR}/${ZIP_NAME}" "${PLUGIN_SLUG}"

# Прибираємо тимчасові файли
rm -rf "${TMP_DIR}"

echo "✅ Готово! Файл збережено: ${DIST_DIR}/${ZIP_NAME}"
echo "📦 Розмір: $(du -sh "${DIST_DIR}/${ZIP_NAME}" | cut -f1)"
