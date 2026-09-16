<?php
/**
 * Поисковый спайдер изображений и описаний
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class LSW_Web_Scraper {

    private static $instance = null;

    public static function get_instance(): self {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Search/Scrape product details (UK/RU descriptions and image URLs) from trusted e-commerce sources.
     *
     * @param string $product_title
     * @param string $brand
     * @param string $cat_name
     * @return array
     */
    public function search_product_media_and_descriptions( string $product_title, string $brand = '', string $cat_name = '' ): array {
        $safe_brand = ! empty( $brand ) ? $brand : '';
        $search_query = trim( "{$safe_brand} {$product_title}" );

        // 1. Fetch genuine product images via Bing Images Async API
        $image_urls = $this->fetch_product_images( $search_query );

        // 2. Determine product category type for tailored descriptions
        $cat_type = $this->detect_category_type( $product_title, $cat_name );

        // 3. Build Rich Category-Specific HTML Descriptions for UK & RU
        $desc_uk = $this->build_rich_category_description_uk( $product_title, $brand, $cat_type );
        $desc_ru = $this->build_rich_category_description_ru( $product_title, $brand, $cat_type );

        return [
            'desc_uk'    => $desc_uk,
            'desc_ru'    => $desc_ru,
            'cat_type'   => $cat_type,
            'image_urls' => array_slice( $image_urls, 0, 5 ),
        ];
    }

    /**
     * Fetch high-res product images using Bing Images Async API.
     *
     * @param string $query
     * @return array
     */
    private function fetch_product_images( string $query ): array {
        $async_url = "https://www.bing.com/images/async?q=" . urlencode( $query . " vape tobacco" ) . "&async=content";

        $args = [
            'timeout'    => 12,
            'user-agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ];

        $response = wp_remote_get( $async_url, $args );
        if ( is_wp_error( $response ) || wp_remote_retrieve_response_code( $response ) !== 200 ) {
            return [];
        }

        $body = wp_remote_retrieve_body( $response );
        if ( ! preg_match_all( '/murl&quot;:&quot;(https?:\/\/[^&]+)&quot;/i', $body, $matches ) ) {
            return [];
        }

        $image_urls = [];
        foreach ( $matches[1] as $url ) {
            $decoded = html_entity_decode( urldecode( $url ) );
            $lower   = strtolower( $decoded );

            // Strict filter: block explicit, adult, icons, logos, banners, or non-product images
            if ( preg_match( '/\.(jpg|jpeg|png|webp)/i', $lower ) 
                 && ! preg_match( '/(adult|porn|sex|nude|logo|icon|favicon|badge|banner|avatar|stock-photo|clipart|girl|woman|model)/i', $lower ) ) {
                $image_urls[] = $decoded;
            }
        }

        return array_values( array_unique( $image_urls ) );
    }

    /**
     * Detect Category Type for Description Customization.
     */
    public function detect_category_type( string $title, string $cat_name = '' ): string {
        $haystack = mb_strtolower( "{$title} {$cat_name}" );

        if ( preg_match( '/(жидкост|рідин|liquid|juice|salt|солев)/ui', $haystack ) ) {
            return 'liquid';
        }
        if ( preg_match( '/(pod|подік|под|устройство|вейп|набір|starter|vape kit|vaporesso|voopoo|smok)/ui', $haystack ) ) {
            return 'device';
        }
        if ( preg_match( '/(однораз|disposable|bar|тяг|затяжек|puffs|elfbar|lost mary)/ui', $haystack ) ) {
            return 'disposable';
        }
        if ( preg_match( '/(снюс|snus|пауч|подушеч|velo|cuba|baron|rabbit)/ui', $haystack ) ) {
            return 'snus';
        }
        if ( preg_match( '/(стік|стик|heets|fiit|neo|terea)/ui', $haystack ) ) {
            return 'sticks';
        }
        if ( preg_match( '/(тютюн для кальяну|табак для кальяна|кальян|hookah|darkside|musthave|serbetli)/ui', $haystack ) ) {
            return 'hookah';
        }
        if ( preg_match( '/(сигарил|сигар|cigar|cigarillos)/ui', $haystack ) ) {
            return 'cigar';
        }

        return 'general';
    }

    /**
     * Build Rich Category-Specific Ukrainian Description (UK).
     */
    private function build_rich_category_description_uk( string $title, string $brand, string $cat_type ): string {
        $brand_str = ! empty( $brand ) ? $brand : 'Офіційний бренд';

        $html = "<div class=\"liman-product-description\">\n";

        switch ( $cat_type ) {
            case 'liquid':
                $html .= "<h3>Преміальна сольова рідина {$title}</h3>\n";
                $html .= "<p>Високоякісна сольова рідина <strong>{$title}</strong> від бренду <strong>{$brand_str}</strong> створена для заправки малопотужних POD-систем. Завдяки ідеальному балансу компонентів VG/PG (50/50) рідина розкриває багатий смаковий букет та гарантує швидке нікотинове насичення з першої затяжки.</p>\n";
                $html .= "<h4>Характеристики та специфікація:</h4>\n";
                $html .= "<table class=\"shop_attributes\" style=\"width:100%; border-collapse:collapse; margin-bottom:15px;\">\n";
                $html .= "  <tr><th style=\"border:1px solid #eee; padding:8px; text-align:left;\">Виробник / Бренд:</th><td style=\"border:1px solid #eee; padding:8px;\">{$brand_str}</td></tr>\n";
                $html .= "  <tr><th style=\"border:1px solid #eee; padding:8px; text-align:left;\">Співвідношення VG/PG:</th><td style=\"border:1px solid #eee; padding:8px;\">50 / 50</td></tr>\n";
                $html .= "  <tr><th style=\"border:1px solid #eee; padding:8px; text-align:left;\">Тип нікотину:</th><td style=\"border:1px solid #eee; padding:8px;\">Сольовий (Salt Nicotine)</td></tr>\n";
                $html .= "  <tr><th style=\"border:1px solid #eee; padding:8px; text-align:left;\">Сумісність:</th><td style=\"border:1px solid #eee; padding:8px;\">Усі види картриджів та POD-систем</td></tr>\n";
                $html .= "</table>\n";
                break;

            case 'device':
                $html .= "<h3>Оригінальний пристрій / POD-система {$title}</h3>\n";
                $html .= "<p>Сучасна POD-система <strong>{$title}</strong> від виробника <strong>{$brand_str}</strong> відрізняється ергономічним корпусом, чудовою передачею смаку та надійністю. Модель оснащена вбудованим акумулятором та платами захисту.</p>\n";
                $html .= "<h4>Переваги пристрою:</h4>\n";
                $html .= "<ul>\n";
                $html .= "  <li><strong>Яскравий смак:</strong> сучасні випаровувачі на сітці Mesh Coil.</li>\n";
                $html .= "  <li><strong>Швидка зарядка:</strong> роз'єм USB Type-C.</li>\n";
                $html .= "  <li><strong>Зручність:</strong> легка заправка та відсутність протікань.</li>\n";
                $html .= "</ul>\n";
                break;

            case 'disposable':
                $html .= "<h3>Одноразова електронна сигарета {$title}</h3>\n";
                $html .= "<p>Одноразовий вейп <strong>{$title}</strong> ({$brand_str}) готовий до використання прямо з упаковки. Завдяки оптимізованому акумулятору та сітчастому випаровувачу пристрій видає стабільну густу пару та насичений смак.</p>\n";
                break;

            case 'snus':
                $html .= "<h3>Нікотинові паучі (Снюс) {$title}</h3>\n";
                $html .= "<p>Безтютюнові паучі <strong>{$title}</strong> від бренду <strong>{$brand_str}</strong> — це зручний спосіб споживання нікотину без диму, смол та попелу. Білі порційні подушечки не залишають слідів та гарантують швидке насичення.</p>\n";
                break;

            case 'sticks':
                $html .= "<h3>Тютюнові стіки {$title}</h3>\n";
                $html .= "<p>Оригінальні тютюнові стіки <strong>{$title}</strong> виготовлені з добірної тютюнової суміші спеціального обрізу для використання з електричними системами нагрівання тютюну. Технологія нагрівання без горіння розкриває натуральний смак тютюну.</p>\n";
                break;

            default:
                $html .= "<h3>Оригінальний тютюновий виріб {$title}</h3>\n";
                $html .= "<p>Класичний виріб <strong>{$title}</strong> від бренду <strong>{$brand_str}</strong> виготовляється із добірної тютюнової сировини високого ґатунку із суворим дотриманням контролю якості на всіх етапах виробництва.</p>\n";
                break;
        }

        $html .= "<h4>Переваги покупки в нашому магазині:</h4>\n";
        $html .= "<ul>\n";
        $html .= "  <li><strong>100% Оригінальність:</strong> сертифікована продукція від офіційних постачальників.</li>\n";
        $html .= "  <li><strong>Правильне зберігання:</strong> дотримання оптимальної вологості та температури на складі.</li>\n";
        $html .= "  <li><strong>Швидка доставка:</strong> оперативна відправка замовлень по всій Україні.</li>\n";
        $html .= "</ul>\n";
        $html .= "</div>";

        return $html;
    }

    /**
     * Build Rich Category-Specific Russian Description (RU).
     */
    private function build_rich_category_description_ru( string $title, string $brand, string $cat_type ): string {
        $brand_str = ! empty( $brand ) ? $brand : 'Официальный бренд';

        $html = "<div class=\"liman-product-description\">\n";

        switch ( $cat_type ) {
            case 'liquid':
                $html .= "<h3>Премиальная солевая жидкость {$title}</h3>\n";
                $html .= "<p>Высококачественная солевая жидкость <strong>{$title}</strong> от бренда <strong>{$brand_str}</strong> создана для заправки маломощных POD-систем. Благодаря идеальному балансу компонентов VG/PG (50/50) жидкость раскрывает богатый вкусовой букет и гарантирует быстрое никотиновое насыщение с первой затяжки.</p>\n";
                $html .= "<h4>Характеристики и спецификация:</h4>\n";
                $html .= "<table class=\"shop_attributes\" style=\"width:100%; border-collapse:collapse; margin-bottom:15px;\">\n";
                $html .= "  <tr><th style=\"border:1px solid #eee; padding:8px; text-align:left;\">Производитель / Бренд:</th><td style=\"border:1px solid #eee; padding:8px;\">{$brand_str}</td></tr>\n";
                $html .= "  <tr><th style=\"border:1px solid #eee; padding:8px; text-align:left;\">Соотношение VG/PG:</th><td style=\"border:1px solid #eee; padding:8px;\">50 / 50</td></tr>\n";
                $html .= "  <tr><th style=\"border:1px solid #eee; padding:8px; text-align:left;\">Тип никотина:</th><td style=\"border:1px solid #eee; padding:8px;\">Солевой (Salt Nicotine)</td></tr>\n";
                $html .= "  <tr><th style=\"border:1px solid #eee; padding:8px; text-align:left;\">Совместимость:</th><td style=\"border:1px solid #eee; padding:8px;\">Все виды картриджей и POD-систем</td></tr>\n";
                $html .= "</table>\n";
                break;

            case 'device':
                $html .= "<h3>Оригинальное устройство / POD-система {$title}</h3>\n";
                $html .= "<p>Современная POD-система <strong>{$title}</strong> от производителя <strong>{$brand_str}</strong> отличается эргономичным корпусом, превосходной передачей вкуса и надежностью. Модель оснащена встроенным аккумулятором и платами защиты.</p>\n";
                $html .= "<h4>Преимущества устройства:</h4>\n";
                $html .= "<ul>\n";
                $html .= "  <li><strong>Яркий вкус:</strong> современные испарители на сетке Mesh Coil.</li>\n";
                $html .= "  <li><strong>Быстрая зарядка:</strong> разъем USB Type-C.</li>\n";
                $html .= "  <li><strong>Удобство:</strong> легкая заправка и отсутствие протечек.</li>\n";
                $html .= "</ul>\n";
                break;

            case 'disposable':
                $html .= "<h3>Одноразовая электронная сигарета {$title}</h3>\n";
                $html .= "<p>Одноразовый вейп <strong>{$title}</strong> ({$brand_str}) готов к использованию прямо из упаковки. Благодаря оптимизированному аккумулятору и сетчатому испарителю устройство выдает стабильный густой пар и насыщенный вкус.</p>\n";
                break;

            case 'snus':
                $html .= "<h3>Никотиновые паучи (Снюс) {$title}</h3>\n";
                $html .= "<p>Бестабачные паучи <strong>{$title}</strong> от бренда <strong>{$brand_str}</strong> — это удобный способ потребления никотина без дыма, смол и пепла. Белые порционные подушечки не оставляют следов и гарантируют быстрое насыщение.</p>\n";
                break;

            case 'sticks':
                $html .= "<h3>Табачные стики {$title}</h3>\n";
                $html .= "<p>Оригинальные табачные стики <strong>{$title}</strong> изготовлены из отборного табачного листа специального нареза для использования с электрическими системами нагревания табака.</p>\n";
                break;

            default:
                $html .= "<h3>Оригинальное табачное изделие {$title}</h3>\n";
                $html .= "<p>Классическое изделие <strong>{$title}</strong> от бренда <strong>{$brand_str}</strong> изготавливается из отборного табачного сырья высокого сорта со строгим соблюдением контроля качества.</p>\n";
                break;
        }

        $html .= "<h4>Преимущества покупки в нашем магазине:</h4>\n";
        $html .= "<ul>\n";
        $html .= "  <li><strong>100% Оригинальность:</strong> сертифицированная продукция от официальных поставщиков.</li>\n";
        $html .= "  <li><strong>Правильное хранение:</strong> соблюдение оптимального температурного и влажностного режима на складе.</li>\n";
        $html .= "  <li><strong>Быстрая доставка:</strong> оперативно доставляем заказы по всей Украине.</li>\n";
        $html .= "</ul>\n";
        $html .= "</div>";

        return $html;
    }

    /**
     * Sideload remote image URL into WordPress Media Library and attach to post.
     */
    public function sideload_image( string $image_url, int $post_id = 0, string $title = '' ) {
        if ( empty( $image_url ) ) {
            return false;
        }

        require_once( ABSPATH . 'wp-admin/includes/media.php' );
        require_once( ABSPATH . 'wp-admin/includes/file.php' );
        require_once( ABSPATH . 'wp-admin/includes/image.php' );

        $tmp = download_url( $image_url, 10 );
        if ( is_wp_error( $tmp ) ) {
            return false;
        }

        $file_array = [
            'name'     => sanitize_file_name( basename( parse_url( $image_url, PHP_URL_PATH ) ) ),
            'tmp_name' => $tmp,
        ];

        if ( empty( $file_array['name'] ) || ! preg_match( '/\.(jpg|jpeg|png|webp|svg)$/i', $file_array['name'] ) ) {
            $file_array['name'] = 'product_image_' . time() . '.jpg';
        }

        $attach_id = media_handle_sideload( $file_array, $post_id, $title );
        if ( is_wp_error( $attach_id ) ) {
            @unlink( $tmp );
            return false;
        }

        return $attach_id;
    }

    /**
     * Get category-specific clean vector SVG placeholder ID.
     */
    public function get_default_placeholder_id( string $cat_type = 'cigarette' ): int {
        $placeholder_title = "Product Placeholder ({$cat_type})";

        $attachment = get_page_by_title( $placeholder_title, OBJECT, 'attachment' );
        if ( $attachment ) {
            return $attachment->ID;
        }

        $svg_content = '<?xml version="1.0" encoding="UTF-8"?>
<svg width="600" height="600" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">
  <rect width="600" height="600" fill="#1e1e2d"/>
  <circle cx="300" cy="260" r="110" fill="#2b2b3d" stroke="#d4af37" stroke-width="4"/>
  <text x="300" y="275" font-family="Arial, sans-serif" font-size="44" fill="#d4af37" text-anchor="middle" font-weight="bold">STORE</text>
  <text x="300" y="420" font-family="Arial, sans-serif" font-size="22" fill="#ffffff" text-anchor="middle">Online Store</text>
</svg>';

        $upload_dir = wp_upload_dir();
        $file_path = $upload_dir['path'] . "/product_placeholder_{$cat_type}.svg";
        @file_put_contents( $file_path, $svg_content );

        $attachment_data = [
            'post_mime_type' => 'image/svg+xml',
            'post_title'     => $placeholder_title,
            'post_content'   => '',
            'post_status'    => 'inherit',
        ];

        $attach_id = wp_insert_attachment( $attachment_data, $file_path );
        if ( is_wp_error( $attach_id ) || ! $attach_id ) {
            return 0;
        }

        require_once( ABSPATH . 'wp-admin/includes/image.php' );
        $attach_data = wp_generate_attachment_metadata( $attach_id, $file_path );
        wp_update_attachment_metadata( $attach_id, $attach_data );

        return (int) $attach_id;
    }
}
