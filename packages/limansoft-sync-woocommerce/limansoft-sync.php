<?php
/**
 * Plugin Name: Limansoft Sync for WooCommerce
 * Plugin URI:  https://github.com/your-org/limansoft-sync-woocommerce
 * Description: Синхронизация каталога товаров, цен и остатков между Limansoft (liman-web-api) и WooCommerce. Поддерживает автоматическое обновление по расписанию и мгновенное списание остатков при заказах.
 * Version:     1.0.0
 * Author:      Limansoft Team
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
define( 'LSW_VERSION',     '1.0.0' );
define( 'LSW_PLUGIN_FILE', __FILE__ );
define( 'LSW_PLUGIN_DIR',  plugin_dir_path( __FILE__ ) );
define( 'LSW_PLUGIN_URL',  plugin_dir_url( __FILE__ ) );
define( 'LSW_OPTION_KEY',  'limansoft_sync_settings' );
define( 'LSW_CRON_HOOK',   'limansoft_sync_cron_event' );

// Подключаем классы
require_once LSW_PLUGIN_DIR . 'includes/class-settings.php';
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
