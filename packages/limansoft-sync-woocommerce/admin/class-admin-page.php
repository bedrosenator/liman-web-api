<?php
/**
 * Страница настроек плагина в WordPress Admin
 */
class LSW_Admin_Page {

    /** @var LSW_Admin_Page|null */
    private static $instance = null;

    /** @var LSW_Settings */
    private $settings;

    private function __construct() {
        $this->settings = LSW_Settings::get_instance();

        add_action( 'admin_menu', [ $this, 'add_menu_page' ] );
        add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_assets' ] );
        add_action( 'wp_ajax_lsw_save_settings', [ $this, 'ajax_save_settings' ] );
        add_action( 'wp_ajax_lsw_test_connection', [ $this, 'ajax_test_connection' ] );
        add_action( 'wp_ajax_lsw_sync_now', [ $this, 'ajax_sync_now' ] );
    }

    public static function get_instance(): self {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Добавить страницу в меню WooCommerce
     */
    public function add_menu_page(): void {
        add_submenu_page(
            'woocommerce',
            __( 'Limansoft Sync', 'limansoft-sync' ),
            __( 'Limansoft Sync', 'limansoft-sync' ),
            'manage_woocommerce',
            'limansoft-sync',
            [ $this, 'render_page' ]
        );
    }

    /**
     * Загрузить CSS/JS только на нашей странице
     *
     * @param string $hook
     */
    public function enqueue_assets( string $hook ): void {
        if ( false === strpos( $hook, 'limansoft-sync' ) ) {
            return;
        }

        wp_enqueue_style(
            'lsw-admin',
            LSW_PLUGIN_URL . 'admin/assets/admin.css',
            [],
            LSW_VERSION
        );

        wp_enqueue_script(
            'lsw-admin',
            LSW_PLUGIN_URL . 'admin/assets/admin.js',
            [ 'jquery' ],
            LSW_VERSION,
            true
        );

        wp_localize_script( 'lsw-admin', 'lsw_ajax', [
            'ajax_url' => admin_url( 'admin-ajax.php' ),
            'nonce'    => wp_create_nonce( 'lsw_nonce' ),
            'strings'  => [
                'testing'    => __( 'Проверяем подключение...', 'limansoft-sync' ),
                'syncing'    => __( 'Синхронизируем товары...', 'limansoft-sync' ),
                'saving'     => __( 'Сохраняем...', 'limansoft-sync' ),
                'saved'      => __( '✅ Настройки сохранены!', 'limansoft-sync' ),
                'error'      => __( '❌ Ошибка', 'limansoft-sync' ),
                'confirm_sync' => __( 'Запустить полную синхронизацию каталога? Это может занять несколько минут.', 'limansoft-sync' ),
            ],
        ] );
    }

    /**
     * AJAX: сохранить настройки
     */
    public function ajax_save_settings(): void {
        check_ajax_referer( 'lsw_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( __( 'Нет прав', 'limansoft-sync' ), 403 );
        }

        $data = [
            'api_url'           => sanitize_url( wp_unslash( $_POST['api_url'] ?? '' ) ),
            'api_key'           => sanitize_text_field( wp_unslash( $_POST['api_key'] ?? '' ) ),
            'tenant_id'         => sanitize_key( wp_unslash( $_POST['tenant_id'] ?? '' ) ),
            'price_column'      => sanitize_key( wp_unslash( $_POST['price_column'] ?? 'cena2' ) ),
            'stock_column'      => sanitize_key( wp_unslash( $_POST['stock_column'] ?? 'skl_k' ) ),
            'auto_sync_enabled' => isset( $_POST['auto_sync_enabled'] ) ? '1' : '0',
            'sync_interval'     => absint( $_POST['sync_interval'] ?? 15 ),
        ];

        $this->settings->save( $data );

        // Перепланировать cron при смене настроек расписания
        LSW_Cron::get_instance()->reschedule();

        $cron_status = LSW_Cron::get_instance()->get_status();

        wp_send_json_success( [
            'message'    => __( 'Настройки сохранены', 'limansoft-sync' ),
            'cron_status' => $cron_status,
        ] );
    }

    /**
     * AJAX: проверить подключение к API
     */
    public function ajax_test_connection(): void {
        check_ajax_referer( 'lsw_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( __( 'Нет прав', 'limansoft-sync' ), 403 );
        }

        $result = LSW_Sync_Client::get_instance()->test_connection();
        wp_send_json( $result );
    }

    /**
     * AJAX: запустить синхронизацию прямо сейчас
     */
    public function ajax_sync_now(): void {
        check_ajax_referer( 'lsw_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( __( 'Нет прав', 'limansoft-sync' ), 403 );
        }

        $result = LSW_Sync_Client::get_instance()->sync_catalog();

        if ( $result['success'] ) {
            wp_send_json_success( $result );
        } else {
            wp_send_json_error( $result );
        }
    }

    /**
     * Отрисовать страницу настроек
     */
    public function render_page(): void {
        include LSW_PLUGIN_DIR . 'admin/views/settings-page.php';
    }
}
