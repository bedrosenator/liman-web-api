<?php
/**
 * Страница настроек и пульт управления синхронизацией в WordPress Admin
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class LSW_Admin_Page {

    /** @var LSW_Admin_Page|null */
    private static $instance = null;

    /** @var LSW_Settings */
    private $settings;

    private function __construct() {
        $this->settings = LSW_Settings::get_instance();

        add_action( 'admin_menu', [ $this, 'add_menu_page' ] );
        add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_assets' ] );

        // AJAX Handlers
        add_action( 'wp_ajax_lsw_save_settings', [ $this, 'ajax_save_settings' ] );
        add_action( 'wp_ajax_lsw_test_connection', [ $this, 'ajax_test_connection' ] );
        add_action( 'wp_ajax_lsw_test_db_connection', [ $this, 'ajax_test_db_connection' ] );
        add_action( 'wp_ajax_lsw_sync_now', [ $this, 'ajax_sync_now' ] );
        add_action( 'wp_ajax_lsw_sync_status', [ $this, 'ajax_sync_status' ] );
        add_action( 'wp_ajax_lsw_run_tobacco_migration', [ $this, 'ajax_run_tobacco_migration' ] );
        add_action( 'wp_ajax_lsw_run_stock_sync', [ $this, 'ajax_run_stock_sync' ] );
        add_action( 'wp_ajax_lsw_run_web_spider', [ $this, 'ajax_run_web_spider' ] );
        add_action( 'wp_ajax_lsw_run_cleanup_duplicates', [ $this, 'ajax_run_cleanup_duplicates' ] );
        add_action( 'wp_ajax_lsw_clear_logs', [ $this, 'ajax_clear_logs' ] );
        add_action( 'wp_ajax_lsw_get_logs', [ $this, 'ajax_get_logs' ] );
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
            __( 'Limansoft Sync for WooCommerce', 'limansoft-sync' ),
            __( 'Limansoft Sync', 'limansoft-sync' ),
            'manage_woocommerce',
            'limansoft-sync',
            [ $this, 'render_page' ]
        );
    }

    /**
     * Загрузить CSS/JS только на нашей странице
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
                'testing'          => __( 'Перевіряємо підключення...', 'limansoft-sync' ),
                'testing_db'       => __( 'Перевірка зв\'язку з БД Limansoft...', 'limansoft-sync' ),
                'syncing'          => __( 'Синхронізуємо товари...', 'limansoft-sync' ),
                'importing'        => __( 'Виконується імпорт товарів з БД Limansoft...', 'limansoft-sync' ),
                'updating_prices'  => __( 'Оновлення цін та залишків...', 'limansoft-sync' ),
                'cleaning_dups'    => __( 'Очищення дублікатів...', 'limansoft-sync' ),
                'saving'           => __( 'Зберігаємо...', 'limansoft-sync' ),
                'saved'            => __( '✅ Налаштування збережено!', 'limansoft-sync' ),
                'error'            => __( '❌ Помилка', 'limansoft-sync' ),
                'network_error'    => __( '❌ Помилка мережі при запиті', 'limansoft-sync' ),
                'log_cleared'      => __( 'Лог очищено.', 'limansoft-sync' ),
                'confirm_sync'     => __( 'Запустити повну синхронізацію каталогу через API? Це може зайняти кілька хвилин.', 'limansoft-sync' ),
                'confirm_cleanup'  => __( 'Ви впевнені, що хочете видалити дублікати товарів та варіацій?', 'limansoft-sync' ),
                'confirm_tobacco'  => __( 'Запустити повний імпорт товарів з БД Limansoft з угрупованням варіацій?', 'limansoft-sync' ),
                'sync_now'         => __( '🚀 Синхронізувати зараз', 'limansoft-sync' ),
                'test_conn'        => __( '🔍 Перевірити підключення', 'limansoft-sync' ),
                'done'             => __( 'Готово!', 'limansoft-sync' ),
                'next_run_in'      => __( 'Наступний запуск: через %s', 'limansoft-sync' ),
                'schedule_off'     => __( 'Розклад вимкнено', 'limansoft-sync' ),
            ],
        ] );
    }

    /**
     * AJAX: сохранить настройки
     */
    public function ajax_save_settings(): void {
        check_ajax_referer( 'lsw_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( __( 'Немає прав', 'limansoft-sync' ), 403 );
        }

        $data = [
            'api_url'             => sanitize_url( wp_unslash( $_POST['api_url'] ?? '' ) ),
            'api_key'             => sanitize_text_field( wp_unslash( $_POST['api_key'] ?? '' ) ),
            'tenant_id'           => sanitize_key( wp_unslash( $_POST['tenant_id'] ?? '' ) ),
            'price_column'        => sanitize_key( wp_unslash( $_POST['price_column'] ?? 'cena2' ) ),
            'stock_column'        => sanitize_key( wp_unslash( $_POST['stock_column'] ?? 'skl_k' ) ),
            'auto_sync_enabled'   => isset( $_POST['auto_sync_enabled'] ) ? '1' : '0',
            'auto_update_product' => isset( $_POST['auto_update_product'] ) ? '1' : '0',
            'sync_interval'       => absint( $_POST['sync_interval'] ?? 15 ),
            'direct_db_enabled'   => isset( $_POST['direct_db_enabled'] ) ? '1' : '0',
            'db_host'             => sanitize_text_field( wp_unslash( $_POST['db_host'] ?? '' ) ),
            'db_name'             => sanitize_text_field( wp_unslash( $_POST['db_name'] ?? '' ) ),
            'db_user'              => sanitize_text_field( wp_unslash( $_POST['db_user'] ?? '' ) ),
            'db_pass'              => sanitize_text_field( wp_unslash( $_POST['db_pass'] ?? '' ) ),
            'spider_auto_enrich'   => isset( $_POST['spider_auto_enrich'] ) ? '1' : '0',
            'update_stock_enabled' => sanitize_key( wp_unslash( $_POST['update_stock_enabled'] ?? '1' ) ),
        ];

        $this->settings->save( $data );

        // Перепланировать cron
        LSW_Cron::get_instance()->reschedule();
        $cron_status = LSW_Cron::get_instance()->get_status();

        wp_send_json_success( [
            'message'     => __( 'Налаштування успішно збережено', 'limansoft-sync' ),
            'cron_status' => $cron_status,
        ] );
    }

    /**
     * AJAX: проверить подключение к Liman Web API
     */
    public function ajax_test_connection(): void {
        check_ajax_referer( 'lsw_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( __( 'Немає прав', 'limansoft-sync' ), 403 );
        }

        $client = LSW_Sync_Client::get_instance();
        $result = $client->test_connection();

        if ( $result['success'] ) {
            wp_send_json_success( $result );
        } else {
            wp_send_json_error( $result );
        }
    }

    /**
     * AJAX: проверить прямое подключение к базе данных (БД)
     */
    public function ajax_test_db_connection(): void {
        check_ajax_referer( 'lsw_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( __( 'Немає прав', 'limansoft-sync' ), 403 );
        }

        $db = LSW_Direct_DB::get_instance();
        $status = $db->get_connection_status();

        if ( $status['connected'] ) {
            wp_send_json_success( $status );
        } else {
            wp_send_json_error( $status );
        }
    }

    /**
     * AJAX: запустить синхронизацию каталога через API
     */
    public function ajax_sync_now(): void {
        check_ajax_referer( 'lsw_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( __( 'Немає прав', 'limansoft-sync' ), 403 );
        }

        $client = LSW_Sync_Client::get_instance();
        $result = $client->sync_catalog();

        LSW_Migrator::get_instance()->add_log( "Запуск полной синхронизации через API: " . ( $result['message'] ?? '' ) );

        if ( $result['success'] ) {
            wp_send_json_success( $result );
        } else {
            wp_send_json_error( $result );
        }
    }

    /**
     * AJAX: проверить статус фоновой синхронизации
     */
    public function ajax_sync_status(): void {
        check_ajax_referer( 'lsw_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( __( 'Немає прав', 'limansoft-sync' ), 403 );
        }

        $client = LSW_Sync_Client::get_instance();
        $result = $client->get_sync_status();

        if ( $result['success'] ) {
            wp_send_json_success( $result['data'] ?? [] );
        } else {
            wp_send_json_error( $result );
        }
    }

    /**
     * AJAX: прямой импорт каталога из базы данных (с вариациями и Polylang)
     */
    public function ajax_run_tobacco_migration(): void {
        check_ajax_referer( 'lsw_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( __( 'Немає прав', 'limansoft-sync' ), 403 );
        }

        $limit = isset( $_POST['limit'] ) ? absint( $_POST['limit'] ) : 0;
        $migrator = LSW_Migrator::get_instance();
        $success = $migrator->run_tobacco_migration( $limit );

        wp_send_json_success( [
            'success' => $success,
            'message' => __( 'Імпорт товарів з БД Limansoft завершено!', 'limansoft-sync' ),
            'logs'    => $migrator->get_logs(),
        ] );
    }

    /**
     * AJAX: быстрый синк цен и остатков
     */
    public function ajax_run_stock_sync(): void {
        check_ajax_referer( 'lsw_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( __( 'Немає прав', 'limansoft-sync' ), 403 );
        }

        $migrator = LSW_Migrator::get_instance();
        $updated = $migrator->sync_stock_and_prices();

        wp_send_json_success( [
            'updated' => $updated,
            'message' => sprintf( __( 'Синхронізовано залишки та ціни для %d товарів!', 'limansoft-sync' ), $updated ),
            'logs'    => $migrator->get_logs(),
        ] );
    }

    /**
     * AJAX: запуск веб-паука
     */
    public function ajax_run_web_spider(): void {
        check_ajax_referer( 'lsw_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( __( 'Немає прав', 'limansoft-sync' ), 403 );
        }

        $limit = isset( $_POST['limit'] ) ? absint( $_POST['limit'] ) : 15;
        $migrator = LSW_Migrator::get_instance();
        $enriched = $migrator->run_web_spider( $limit );

        wp_send_json_success( [
            'enriched' => $enriched,
            'message'  => sprintf( __( 'Веб-Паук завершив роботу. Обогащено %d товарів!', 'limansoft-sync' ), $enriched ),
            'logs'     => $migrator->get_logs(),
        ] );
    }

    /**
     * AJAX: удаление дубликатов
     */
    public function ajax_run_cleanup_duplicates(): void {
        check_ajax_referer( 'lsw_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( __( 'Немає прав', 'limansoft-sync' ), 403 );
        }

        $migrator = LSW_Migrator::get_instance();
        $deleted = $migrator->cleanup_duplicates();

        wp_send_json_success( [
            'deleted' => $deleted,
            'message' => sprintf( __( 'Видалено %d дублікатів товарів.', 'limansoft-sync' ), $deleted ),
            'logs'    => $migrator->get_logs(),
        ] );
    }

    /**
     * AJAX: очистка логов
     */
    public function ajax_clear_logs(): void {
        check_ajax_referer( 'lsw_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( __( 'Немає прав', 'limansoft-sync' ), 403 );
        }

        LSW_Migrator::get_instance()->clear_logs();
        wp_send_json_success( [ 'message' => __( 'Логи очищено', 'limansoft-sync' ) ] );
    }

    /**
     * AJAX: получить свежие логи
     */
    public function ajax_get_logs(): void {
        check_ajax_referer( 'lsw_nonce', 'nonce' );

        $logs = LSW_Migrator::get_instance()->get_logs();
        wp_send_json_success( [ 'logs' => $logs ] );
    }

    /**
     * Отрендерить страницу
     */
    public function render_page(): void {
        require_once LSW_PLUGIN_DIR . 'admin/views/settings-page.php';
    }
}
