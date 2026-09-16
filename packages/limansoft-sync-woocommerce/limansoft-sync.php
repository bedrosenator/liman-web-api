<?php
/**
 * Plugin Name: Limansoft Sync for WooCommerce
 * Plugin URI:  https://github.com/your-org/limansoft-sync-woocommerce
 * Description: Модуль повної прямої та зворотної синхронізації між обліковою системою Limansoft (REST API / MariaDB / MySQL) та WooCommerce. Підтримує імпорт каталогу, авто-групування варіативних товарів, переклади Polylang UA/RU, швидке оновлення цін і залишків, миттєве списання залишків при замовленнях та Two-Way Sync.
 * Version:     2.0.0
 * Author:      Limansoft Team & Antigravity
 * Author URI:  https://limansoft.com
 * License:     GPL-2.0+
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: limansoft-sync
 * Domain Path: /languages
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * WC requires at least: 7.0
 * WC tested up to: 9.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Константы плагина
define( 'LSW_VERSION',     '2.0.0' );
define( 'LSW_PLUGIN_FILE', __FILE__ );
define( 'LSW_PLUGIN_DIR',  plugin_dir_path( __FILE__ ) );
define( 'LSW_PLUGIN_URL',  plugin_dir_url( __FILE__ ) );
define( 'LSW_OPTION_KEY',  'limansoft_sync_settings' );
define( 'LSW_CRON_HOOK',   'limansoft_sync_cron_event' );

// Подключаем классы
require_once LSW_PLUGIN_DIR . 'includes/class-settings.php';
require_once LSW_PLUGIN_DIR . 'includes/class-direct-db.php';
require_once LSW_PLUGIN_DIR . 'includes/class-product-grouper.php';
require_once LSW_PLUGIN_DIR . 'includes/class-web-scraper.php';
require_once LSW_PLUGIN_DIR . 'includes/class-migrator.php';
require_once LSW_PLUGIN_DIR . 'includes/class-sync-client.php';
require_once LSW_PLUGIN_DIR . 'includes/class-cron.php';
require_once LSW_PLUGIN_DIR . 'includes/class-webhook.php';
require_once LSW_PLUGIN_DIR . 'admin/class-admin-page.php';

/**
 * Точка входа плагина
 */
function limansoft_sync_init() {
    // Загрузка переводов
    load_plugin_textdomain( 'limansoft-sync', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );

    // Инициализация компонентов
    LSW_Settings::get_instance();
    LSW_Direct_DB::get_instance();
    LSW_Migrator::get_instance();
    LSW_Cron::get_instance();
    LSW_Webhook::get_instance();

    if ( is_admin() ) {
        LSW_Admin_Page::get_instance();
    }
}
add_action( 'plugins_loaded', 'limansoft_sync_init' );

/**
 * Хук активации плагина
 */
function limansoft_sync_activate() {
    $settings = LSW_Settings::get_instance();
    if ( $settings->get( 'auto_sync_enabled' ) ) {
        LSW_Cron::get_instance()->schedule();
    }
    // Проверяем создание базовых атрибутов WooCommerce
    LSW_Migrator::get_instance()->ensure_wc_attributes();
    flush_rewrite_rules();
}
register_activation_hook( __FILE__, 'limansoft_sync_activate' );

/**
 * Хук деактивации плагина — очищаем все cron-задачи
 */
function limansoft_sync_deactivate() {
    LSW_Cron::get_instance()->unschedule();
    flush_rewrite_rules();
}
register_deactivation_hook( __FILE__, 'limansoft_sync_deactivate' );

/**
 * Объявляем совместимость с HPOS WooCommerce
 */
add_action( 'before_woocommerce_init', function () {
    if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
    }
} );

/**
 * WP-CLI интеграция (поддерживает limansoft-sync и columb-sync)
 */
if ( defined( 'WP_CLI' ) && WP_CLI ) {
    $wp_cli_handler = function( $args, $assoc_args ) {
        $action = isset( $assoc_args['action'] ) ? $assoc_args['action'] : ( isset( $assoc_args['type'] ) ? $assoc_args['type'] : 'tobacco' );
        $limit  = isset( $assoc_args['limit'] ) ? (int) $assoc_args['limit'] : 0;

        $migrator = LSW_Migrator::get_instance();

        if ( 'stock' === $action ) {
            WP_CLI::line( "Starting Stock & Price Sync..." );
            $updated = $migrator->sync_stock_and_prices();
            WP_CLI::success( "Updated {$updated} products." );
        } elseif ( 'cleanup' === $action ) {
            WP_CLI::line( "Starting duplicate cleanup..." );
            $deleted = $migrator->cleanup_duplicates();
            WP_CLI::success( "Deleted {$deleted} duplicates." );
        } elseif ( 'spider' === $action ) {
            WP_CLI::line( "Starting Web Spider..." );
            $enriched = $migrator->run_web_spider( $limit ?: 20 );
            WP_CLI::success( "Enriched {$enriched} products." );
        } elseif ( 'catalog' === $action ) {
            WP_CLI::line( "Starting Full Catalog Sync via Liman Web API..." );
            $res = LSW_Sync_Client::get_instance()->sync_catalog();
            if ( $res['success'] ) {
                WP_CLI::success( $res['message'] );
            } else {
                WP_CLI::error( $res['message'] );
            }
        } else {
            WP_CLI::line( "Starting Catalog Migration from Database..." );
            $migrator->run_tobacco_migration( $limit );
            WP_CLI::success( "Migration completed." );
        }

        foreach ( $migrator->get_logs() as $log ) {
            WP_CLI::line( $log );
        }
    };

    WP_CLI::add_command( 'limansoft-sync', $wp_cli_handler );
    if ( ! class_exists( 'Columb_Admin_Page' ) ) {
        WP_CLI::add_command( 'columb-sync', $wp_cli_handler );
    }
}
