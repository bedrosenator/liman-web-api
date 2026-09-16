<?php
/**
 * Мигратор и синхронизатор каталога WooCommerce (с группировкой, Polylang UA/RU и Веб-Пауком)
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class LSW_Migrator {

    /** @var LSW_Migrator|null */
    private static $instance = null;

    private $db;
    private $grouper;
    private $scraper;
    private $log = [];

    const LOG_OPTION_KEY = 'limansoft_sync_execution_logs';

    public static function get_instance(): self {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function __construct() {
        $this->db      = LSW_Direct_DB::get_instance();
        $this->grouper = new LSW_Product_Grouper();
        $this->scraper = LSW_Web_Scraper::get_instance();
        $this->log     = (array) get_option( self::LOG_OPTION_KEY, [] );
    }

    public function add_log( string $msg ): void {
        $timestamp = current_time( 'mysql' );
        $formatted = "[{$timestamp}] {$msg}";
        $this->log[] = $formatted;

        // Храним последние 200 строк
        if ( count( $this->log ) > 200 ) {
            $this->log = array_slice( $this->log, -200 );
        }

        update_option( self::LOG_OPTION_KEY, $this->log, false );
        error_log( "[Limansoft Sync] " . $msg );
    }

    public function get_logs(): array {
        return $this->log;
    }

    public function clear_logs(): void {
        $this->log = [];
        delete_option( self::LOG_OPTION_KEY );
    }

    /**
     * Register global WooCommerce attributes if they don't exist yet.
     */
    public function ensure_wc_attributes(): void {
        $attributes = [
            'flavor'   => 'Вкус / Смак',
            'color'    => 'Цвет / Колір',
            'brand'    => 'Бренд / Виробник',
            'volume'   => 'Объем / Об\'єм',
            'strength' => 'Крепость / Міцність',
            'puffs'    => 'Количество затяжек / Кількість затяжок',
        ];

        foreach ( $attributes as $slug => $name ) {
            $attribute_id = wc_attribute_taxonomy_id_by_name( $slug );
            if ( ! $attribute_id ) {
                wc_create_attribute( [
                    'name'         => $name,
                    'slug'         => $slug,
                    'type'         => 'select',
                    'order_by'     => 'menu_order',
                    'has_archives' => true,
                ] );
                $this->add_log( "Created WooCommerce attribute: {$name} (pa_{$slug})" );
            }
        }
    }

    /**
     * Helper to find existing product ID by title and language.
     */
    private function get_product_by_title_and_lang( string $title, string $lang = 'uk' ): ?int {
        global $wpdb;

        $query = $wpdb->prepare( "
            SELECT p.ID 
            FROM {$wpdb->posts} p
            LEFT JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
            LEFT JOIN {$wpdb->term_taxonomy} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id AND tt.taxonomy = 'language'
            LEFT JOIN {$wpdb->terms} t ON tt.term_id = t.term_id
            WHERE p.post_title = %s AND p.post_type = 'product' AND p.post_status != 'trash' AND (t.slug = %s OR t.slug IS NULL)
            ORDER BY p.ID ASC
            LIMIT 1
        ", $title, $lang );

        $id = $wpdb->get_var( $query );
        return $id ? (int) $id : null;
    }

    /**
     * Run Tobacco Migration process.
     *
     * @param int $limit
     * @return bool
     */
    public function run_tobacco_migration( int $limit = 0 ): bool {
        $this->ensure_wc_attributes();
        $this->add_log( "🚀 Запуск миграции каталога товаров из базы данных..." );

        $raw_items = $this->db->get_tobacco_products();
        if ( empty( $raw_items ) ) {
            $this->add_log( "⚠️ В таблице БД не найдено позиций для импорта." );
            return false;
        }

        $this->add_log( "📦 Получено " . count( $raw_items ) . " позиций из базы данных." );
        $grouped = $this->grouper->group_items( $raw_items );
        $this->add_log( "✨ Сгруппировано в " . count( $grouped ) . " товарных групп." );

        LSW_Webhook::suspend();

        $count = 0;
        try {
            foreach ( $grouped as $group_key => $group ) {
                if ( $limit > 0 && $count >= $limit ) {
                    break;
                }

                try {
                    if ( $group['is_variable'] ) {
                        $this->create_variable_product( $group );
                    } else {
                        $this->create_simple_product( $group );
                    }
                    $count++;
                } catch ( Throwable $e ) {
                    $this->add_log( "❌ Ошибка создания группы {$group['base_name']}: " . $e->getMessage() );
                }
            }
        } finally {
            LSW_Webhook::resume();
        }

        $this->add_log( "✅ Миграция каталога товаров завершена. Обработано групп: {$count}" );
        return true;
    }

    /**
     * Create or Update Variable Product with configurable language support (UK, RU, or Polylang UK+RU).
     */
    private function create_variable_product( array $group ): void {
        $settings = LSW_Settings::get_instance();
        $import_lang = $settings->get_import_language(); // 'uk', 'ru', 'both'
        $base_name = $group['base_name'];

        $primary_lang = ( 'ru' === $import_lang ) ? 'ru' : 'uk';

        // Check if Parent primary product already exists
        $existing_id = $this->get_product_by_title_and_lang( $base_name, $primary_lang );
        if ( $existing_id ) {
            $product_primary = wc_get_product( $existing_id );
            $product_primary_id = $existing_id;
            $this->add_log( "🔄 Обновление вариативного товара ({$primary_lang}: #{$product_primary_id}): {$base_name}" );
        } else {
            $this->add_log( "🆕 Создание вариативного товара: {$base_name} (" . count( $group['items'] ) . " вариаций, {$primary_lang})" );
            $web_data = $this->scraper->search_product_media_and_descriptions( $base_name, $group['brand'] ?? '', $group['category_name'] ?? '' );
            $placeholder_id = $this->scraper->get_default_placeholder_id();

            $desc = ( 'ru' === $primary_lang ) ? ( $web_data['desc_ru'] ?? '' ) : ( $web_data['desc_uk'] ?? '' );

            $product_primary = new WC_Product_Variable();
            $product_primary->set_name( $base_name );
            $product_primary->set_status( 'publish' );
            $product_primary->set_description( $desc );
            $product_primary->set_short_description( "Товар {$base_name}" );
            if ( $placeholder_id ) {
                $product_primary->set_image_id( $placeholder_id );
            }
            $this->set_product_category( $product_primary, $group['category_name'] ?? '' );

            // Build Attributes
            $flavor_terms = [];
            foreach ( $group['items'] as $it ) {
                $flavor = $it['attributes']['flavor'] ?? '';
                if ( $flavor && ! in_array( $flavor, $flavor_terms, true ) ) {
                    $flavor_terms[] = $flavor;
                }
            }

            if ( ! empty( $flavor_terms ) ) {
                $attr = new WC_Product_Attribute();
                $attr->set_id( wc_attribute_taxonomy_id_by_name( 'flavor' ) );
                $attr->set_name( 'pa_flavor' );
                $attr->set_options( $flavor_terms );
                $attr->set_position( 0 );
                $attr->set_visible( true );
                $attr->set_variation( true );

                $product_primary->set_attributes( [ $attr ] );
            }

            $product_primary_id = $product_primary->save();

            if ( function_exists( 'pll_set_post_language' ) ) {
                pll_set_post_language( $product_primary_id, $primary_lang );
            }

            // Create Variations Primary
            foreach ( $group['items'] as $item ) {
                $flavor = $item['attributes']['flavor'] ?? '';
                $variation = new WC_Product_Variation();
                $variation->set_parent_id( $product_primary_id );
                $variation->set_attributes( [ 'pa_flavor' => sanitize_title( $flavor ) ] );
                $variation->set_regular_price( $item['price'] );
                $variation->set_price( $item['price'] );
                $variation->set_sku( $item['tcod'] );
                $variation->set_manage_stock( true );
                $variation->set_stock_quantity( (int) $item['stock'] );
                $variation->set_status( 'publish' );
                $variation->save();
            }
        }

        // Two-Language Polylang Mode (only if 'both' is selected and Polylang is active)
        if ( 'both' === $import_lang && function_exists( 'pll_set_post_language' ) && isset( $product_primary_id ) ) {
            $existing_ru_id = $this->get_product_by_title_and_lang( $base_name, 'ru' );
            if ( ! $existing_ru_id ) {
                $web_data = $this->scraper->search_product_media_and_descriptions( $base_name, $group['brand'] ?? '', $group['category_name'] ?? '' );
                $placeholder_id = $this->scraper->get_default_placeholder_id();

                $product_ru = new WC_Product_Variable();
                $product_ru->set_name( $base_name );
                $product_ru->set_status( 'publish' );
                $product_ru->set_description( $web_data['desc_ru'] ?? '' );
                $product_ru->set_short_description( "Товар {$base_name}" );
                if ( $placeholder_id ) {
                    $product_ru->set_image_id( $placeholder_id );
                }
                $this->set_product_category( $product_ru, $group['category_name'] ?? '' );

                if ( ! empty( $flavor_terms ) ) {
                    $attr = new WC_Product_Attribute();
                    $attr->set_id( wc_attribute_taxonomy_id_by_name( 'flavor' ) );
                    $attr->set_name( 'pa_flavor' );
                    $attr->set_options( $flavor_terms );
                    $attr->set_position( 0 );
                    $attr->set_visible( true );
                    $attr->set_variation( true );
                    $product_ru->set_attributes( [ $attr ] );
                }

                $product_ru_id = $product_ru->save();
                pll_set_post_language( $product_ru_id, 'ru' );

                foreach ( $group['items'] as $item ) {
                    $flavor = $item['attributes']['flavor'] ?? '';
                    $variation_ru = new WC_Product_Variation();
                    $variation_ru->set_parent_id( $product_ru_id );
                    $variation_ru->set_attributes( [ 'pa_flavor' => sanitize_title( $flavor ) ] );
                    $variation_ru->set_regular_price( $item['price'] );
                    $variation_ru->set_price( $item['price'] );
                    $variation_ru->set_sku( $item['tcod'] . '_ru' );
                    $variation_ru->set_manage_stock( true );
                    $variation_ru->set_stock_quantity( (int) $item['stock'] );
                    $variation_ru->set_status( 'publish' );
                    $variation_ru->save();
                }

                if ( function_exists( 'pll_save_post_translations' ) ) {
                    pll_save_post_translations( [
                        'uk' => $product_primary_id,
                        'ru' => $product_ru_id,
                    ] );
                }
            }
        }
    }

    /**
     * Create or Update Simple Product with configurable language support (UK, RU, or Polylang UK+RU).
     */
    private function create_simple_product( array $group ): void {
        $settings = LSW_Settings::get_instance();
        $import_lang = $settings->get_import_language(); // 'uk', 'ru', 'both'

        $item = $group['items'][0];
        $name = $item['product_name'];
        $primary_lang = ( 'ru' === $import_lang ) ? 'ru' : 'uk';

        // Deduplication check by SKU
        $existing_id = wc_get_product_id_by_sku( $item['tcod'] );
        if ( $existing_id ) {
            $product_primary = wc_get_product( $existing_id );
            $this->add_log( "🔄 Обновление простого товара ({$primary_lang}: #{$existing_id}): {$name}" );
        } else {
            $this->add_log( "🆕 Создание простого товара: {$name} ({$primary_lang})" );
            $web_data = $this->scraper->search_product_media_and_descriptions( $name, $group['brand'] ?? '', $group['category_name'] ?? '' );
            $placeholder_id = $this->scraper->get_default_placeholder_id();

            $desc = ( 'ru' === $primary_lang ) ? ( $web_data['desc_ru'] ?? '' ) : ( $web_data['desc_uk'] ?? '' );

            $product_primary = new WC_Product_Simple();
            $product_primary->set_name( $name );
            $product_primary->set_status( 'publish' );
            $product_primary->set_description( $desc );
            $product_primary->set_sku( $item['tcod'] );
            if ( $placeholder_id ) {
                $product_primary->set_image_id( $placeholder_id );
            }
            $this->set_product_category( $product_primary, $group['category_name'] ?? '' );
        }

        $product_primary->set_regular_price( $item['price'] );
        $product_primary->set_price( $item['price'] );
        $product_primary->set_manage_stock( true );
        $product_primary->set_stock_quantity( (int) $item['stock'] );
        $product_primary_id = $product_primary->save();

        if ( function_exists( 'pll_set_post_language' ) ) {
            pll_set_post_language( $product_primary_id, $primary_lang );
        }

        // Two-Language Polylang Mode (only if 'both' is selected and Polylang is active)
        if ( 'both' === $import_lang && function_exists( 'pll_set_post_language' ) ) {
            $existing_ru_id = wc_get_product_id_by_sku( $item['tcod'] . '_ru' );
            if ( ! $existing_ru_id ) {
                $web_data = $this->scraper->search_product_media_and_descriptions( $name, $group['brand'] ?? '', $group['category_name'] ?? '' );
                $placeholder_id = $this->scraper->get_default_placeholder_id();

                $product_ru = new WC_Product_Simple();
                $product_ru->set_name( $name );
                $product_ru->set_status( 'publish' );
                $product_ru->set_description( $web_data['desc_ru'] ?? '' );
                $product_ru->set_sku( $item['tcod'] . '_ru' );
                $product_ru->set_regular_price( $item['price'] );
                $product_ru->set_price( $item['price'] );
                $product_ru->set_manage_stock( true );
                $product_ru->set_stock_quantity( (int) $item['stock'] );
                if ( $placeholder_id ) {
                    $product_ru->set_image_id( $placeholder_id );
                }
                $product_ru_id = $product_ru->save();

                pll_set_post_language( $product_ru_id, 'ru' );

                if ( function_exists( 'pll_save_post_translations' ) ) {
                    pll_save_post_translations( [
                        'uk' => $product_primary_id,
                        'ru' => $product_ru_id,
                    ] );
                }
            }
        }
    }

    /**
     * Assign Product Category.
     */
    private function set_product_category( WC_Product $product, string $cat_name ): void {
        if ( empty( $cat_name ) ) {
            return;
        }

        $term = get_term_by( 'name', $cat_name, 'product_cat' );
        if ( ! $term ) {
            $term_data = wp_insert_term( $cat_name, 'product_cat' );
            if ( ! is_wp_error( $term_data ) ) {
                $product->set_category_ids( [ (int) $term_data['term_id'] ] );
            }
        } else {
            $product->set_category_ids( [ (int) $term->term_id ] );
        }
    }

    /**
     * Fast Sync of Stock & Prices for all items.
     */
    public function sync_stock_and_prices(): int {
        global $wpdb;
        $settings = LSW_Settings::get_instance();
        $update_stock = $settings->is_update_stock_enabled();

        $status_note = $update_stock ? "" : " (тільки ціни, залишки вимкнено)";
        $this->add_log( "⚡ Запуск швидкої синхронізації цін та залишків{$status_note}..." );
        $raw_items = $this->db->get_all_products();
        if ( empty( $raw_items ) ) {
            $this->add_log( "⚠️ Товарів для синхронізації не знайдено." );
            return 0;
        }

        // Побудова карти артикулів SKU в один SQL-запит для максимальної швидкодії
        $sku_rows = $wpdb->get_results( "
            SELECT post_id, meta_value AS sku 
            FROM {$wpdb->postmeta} 
            WHERE meta_key = '_sku' AND meta_value != ''
        ", ARRAY_A );

        $sku_map = [];
        if ( ! empty( $sku_rows ) ) {
            foreach ( $sku_rows as $row ) {
                $sku_map[ (string) $row['sku'] ] = (int) $row['post_id'];
            }
        }

        LSW_Webhook::suspend();

        $updated = 0;
        $matched_ids = [];

        try {
            foreach ( $raw_items as $item ) {
                $tcod  = (string) $item['tcod'];
                $price = (float) ( $item['price'] ?? 0 );
                $stock = (int) ( $item['stock'] ?? 0 );
                $stock_status = ( $stock > 0 ) ? 'instock' : 'outofstock';

                $targets = [];
                if ( isset( $sku_map[ $tcod ] ) ) {
                    $targets[] = $sku_map[ $tcod ];
                }
                $ru_sku = $tcod . '_ru';
                if ( isset( $sku_map[ $ru_sku ] ) ) {
                    $targets[] = $sku_map[ $ru_sku ];
                }

                foreach ( $targets as $pid ) {
                    update_post_meta( $pid, '_regular_price', $price );
                    update_post_meta( $pid, '_price', $price );
                    if ( $update_stock ) {
                        update_post_meta( $pid, '_stock', $stock );
                        update_post_meta( $pid, '_stock_status', $stock_status );
                        update_post_meta( $pid, '_manage_stock', 'yes' );
                    }
                    $matched_ids[] = $pid;
                    $updated++;
                }
            }

            // Очистка кешей вариаций и товаров WooCommerce для обновленных ID
            if ( ! empty( $matched_ids ) ) {
                foreach ( array_unique( $matched_ids ) as $pid ) {
                    wc_delete_product_transients( $pid );
                }
            }
        } finally {
            LSW_Webhook::resume();
        }

        $this->add_log( "✅ Синхронізацію цін та залишків завершено. Оновлено позицій: {$updated}" );
        return $updated;
    }

    /**
     * Clean up duplicate WooCommerce products & variations from database.
     */
    public function cleanup_duplicates(): int {
        global $wpdb;
        $this->add_log( "🧹 Запуск процедуры очистки дубликатов..." );
        $deleted_count = 0;

        // 1. Delete posts sharing duplicate SKUs (keep lowest ID)
        $duplicate_skus = $wpdb->get_results( "
            SELECT meta_value AS sku, GROUP_CONCAT(post_id ORDER BY post_id ASC) AS post_ids, COUNT(*) AS cnt
            FROM {$wpdb->postmeta}
            WHERE meta_key = '_sku' AND meta_value != ''
            GROUP BY meta_value HAVING cnt > 1
        " );

        foreach ( $duplicate_skus as $dup ) {
            $ids = explode( ',', $dup->post_ids );
            $original_id = array_shift( $ids );
            foreach ( $ids as $duplicate_id ) {
                wp_delete_post( (int) $duplicate_id, true );
                $deleted_count++;
                $this->add_log( "Удален дубликат #{$duplicate_id} (SKU: {$dup->sku}, оставлен #{$original_id})" );
            }
        }

        // 2. Delete duplicate parent products sharing exact same title
        $duplicate_titles = $wpdb->get_results( "
            SELECT post_title, post_type, GROUP_CONCAT(ID ORDER BY ID ASC) AS post_ids, COUNT(*) AS cnt
            FROM {$wpdb->posts}
            WHERE post_type = 'product' AND post_status != 'trash'
            GROUP BY post_title, post_type HAVING cnt > 2
        " );

        foreach ( $duplicate_titles as $dup ) {
            $ids = explode( ',', $dup->post_ids );
            array_splice( $ids, 0, 2 ); // Сохраняем первые 2 (UK и RU переводы)
            foreach ( $ids as $duplicate_id ) {
                wp_delete_post( (int) $duplicate_id, true );
                $deleted_count++;
                $this->add_log( "Удален дубликат карточки #{$duplicate_id} ('{$dup->post_title}')" );
            }
        }

        $this->add_log( "✅ Очистка завершена. Всего удалено дубликатов: {$deleted_count}" );
        return $deleted_count;
    }

    /**
     * Run Web Spider to search manufacturer descriptions, translate UA/RU, download images and populate gallery.
     */
    public function run_web_spider( int $limit = 20 ): int {
        $this->add_log( "🕷️ Запуск Веб-Паука (поиск описаний, перевод UA/RU и загрузка фото)..." );

        $posts_per_page = ( $limit > 0 ) ? $limit : -1;

        $args = [
            'post_type'      => [ 'product' ],
            'post_status'    => 'publish',
            'posts_per_page' => $posts_per_page,
            'meta_query'     => [
                'relation' => 'OR',
                [
                    'key'     => '_lsw_spider_enriched',
                    'compare' => 'NOT EXISTS',
                ],
                [
                    'key'   => '_lsw_spider_enriched',
                    'value' => '0',
                ],
            ],
        ];

        $query = new WP_Query( $args );
        $enriched = 0;

        foreach ( $query->posts as $post ) {
            $product_id = $post->ID;
            $title      = $post->post_title;
            $product    = wc_get_product( $product_id );
            if ( ! $product ) {
                continue;
            }

            $this->add_log( "Поиск информации для #{$product_id}: '{$title}'..." );
            $web_data = $this->scraper->search_product_media_and_descriptions( $title );

            // Обновляем описание, если оно пустое или короткое
            if ( strlen( $product->get_description() ) < 100 && ! empty( $web_data['desc_uk'] ) ) {
                $product->set_description( $web_data['desc_uk'] );
            }

            // Скачиваем фото в галерею
            if ( ! empty( $web_data['image_urls'] ) ) {
                $gallery_ids = [];
                $first_image = true;

                foreach ( $web_data['image_urls'] as $img_url ) {
                    $attach_id = $this->scraper->sideload_image( $img_url, $product_id, $title );
                    if ( $attach_id ) {
                        if ( $first_image && ! $product->get_image_id() ) {
                            $product->set_image_id( $attach_id );
                            $first_image = false;
                        } else {
                            $gallery_ids[] = $attach_id;
                        }
                    }
                }

                if ( ! empty( $gallery_ids ) ) {
                    $existing_gallery = $product->get_gallery_image_ids();
                    $product->set_gallery_image_ids( array_merge( $existing_gallery, $gallery_ids ) );
                }
            }

            update_post_meta( $product_id, '_lsw_spider_enriched', '1' );
            $product->save();
            $enriched++;
        }

        $this->add_log( "✅ Веб-Паук завершил работу. Обогащено товаров: {$enriched}" );
        return $enriched;
    }
}
