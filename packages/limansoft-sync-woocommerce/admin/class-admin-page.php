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
        add_action( 'wp_ajax_lsw_sync_status', [ $this, 'ajax_sync_status' ] );
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
                'testing'        => __( 'Перевіряємо підключення...', 'limansoft-sync' ),
                'syncing'        => __( 'Синхронізуємо товари...', 'limansoft-sync' ),
                'saving'         => __( 'Зберігаємо...', 'limansoft-sync' ),
                'saved'          => __( '✅ Налаштування збережено!', 'limansoft-sync' ),
                'error'          => __( '❌ Помилка', 'limansoft-sync' ),
                'confirm_sync'   => __( 'Запустити повну синхронізацію каталогу? Це може зайняти кілька хвилин.', 'limansoft-sync' ),
                'sync_now'       => __( '🚀 Синхронізувати зараз', 'limansoft-sync' ),
                'test_conn'      => __( '🔍 Перевірити підключення', 'limansoft-sync' ),
                'conn_failed'    => __( '❌ Не вдалося зв\'язатися з сервером', 'limansoft-sync' ),
                'init_sync'      => __( 'Ініціалізація синхронізації...', 'limansoft-sync' ),
                'sync_bg_track'  => __( 'Синхронізацію запущено у фоні. Відстеження прогресу...', 'limansoft-sync' ),
                'network_err'    => __( 'Помилка з\'єднання', 'limansoft-sync' ),
                'done'           => __( 'Готово!', 'limansoft-sync' ),
                'sync_completed' => __( 'Синхронізацію успішно завершено!', 'limansoft-sync' ),
                'sync_failed'    => __( 'Помилка синхронізації', 'limansoft-sync' ),
                'unknown_error'     => __( 'Невідома помилка', 'limansoft-sync' ),
                'next_run_in'       => __( 'Наступний запуск: через %s', 'limansoft-sync' ),
                'schedule_off'      => __( 'Розклад вимкнено', 'limansoft-sync' ),
                'checking_existing' => __( 'Перевірка існуючих товарів у WooCommerce...', 'limansoft-sync' ),
                'sync_progress'     => __( 'Синхронізовано %1$d з %2$d товарів (%3$d%%)...', 'limansoft-sync' ),
                'sync_done_detail'  => __( 'Синхронізацію успішно завершено! Оновлено: %1$d, помилок: %2$d за %3$d сек.', 'limansoft-sync' ),
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
        ];

        $this->settings->save( $data );

        // Перепланировать cron при смене настроек расписания
        LSW_Cron::get_instance()->reschedule();

        $cron_status = LSW_Cron::get_instance()->get_status();

        wp_send_json_success( [
            'message'    => __( 'Налаштування збережено', 'limansoft-sync' ),
            'cron_status' => $cron_status,
        ] );
    }

    /**
     * AJAX: проверить подключение к API
     */
    public function ajax_test_connection(): void {
        check_ajax_referer( 'lsw_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( __( 'Немає прав', 'limansoft-sync' ), 403 );
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
            wp_send_json_error( __( 'Немає прав', 'limansoft-sync' ), 403 );
        }

        $result = LSW_Sync_Client::get_instance()->sync_catalog();

        if ( $result['success'] ) {
            wp_send_json_success( $result );
        } else {
            wp_send_json_error( $result );
        }
    }

    /**
     * AJAX: проверить статус текущей фоновой синхронизации
     */
    public function ajax_sync_status(): void {
        check_ajax_referer( 'lsw_nonce', 'nonce' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( __( 'Немає прав', 'limansoft-sync' ), 403 );
        }

        $result = LSW_Sync_Client::get_instance()->get_sync_status();

        if ( ! empty( $result['success'] ) && ! empty( $result['data'] ) ) {
            $data = $result['data'];
            // Если завершилось успешно — сохраняем дату последней синхронизации в опциях
            if ( isset( $data['status'] ) && 'completed' === $data['status'] ) {
                $sec = isset( $data['durationMs'] ) ? round( $data['durationMs'] / 1000 ) : 0;
                $data['localized_message'] = sprintf(
                    /* translators: 1: synced count, 2: errors count, 3: duration sec */
                    __( 'Синхронізацію успішно завершено! Оновлено: %1$d, помилок: %2$d за %3$d сек.', 'limansoft-sync' ),
                    $data['synced'] ?? 0,
                    $data['errors'] ?? 0,
                    $sec
                );
                $last_sync = [
                    'time'    => current_time( 'mysql' ),
                    'success' => true,
                    'message' => sprintf(
                        __( 'Оновлено %1$d товарів (помилок: %2$d)', 'limansoft-sync' ),
                        $data['synced'] ?? 0,
                        $data['errors'] ?? 0
                    ),
                ];
                update_option( 'limansoft_last_sync', $last_sync );
            } elseif ( isset( $data['status'] ) && 'running' === $data['status'] ) {
                if ( ( $data['phase'] ?? '' ) === 'checking_existing' || false !== strpos( $data['message'] ?? '', 'Перевірка існуючих' ) ) {
                    $data['localized_message'] = __( 'Перевірка існуючих товарів у WooCommerce...', 'limansoft-sync' );
                } elseif ( ( $data['phase'] ?? '' ) === 'init' || false !== strpos( $data['message'] ?? '', 'Ініціалізація' ) ) {
                    $data['localized_message'] = __( 'Ініціалізація синхронізації...', 'limansoft-sync' );
                } elseif ( ( $data['phase'] ?? '' ) === 'syncing' || false !== strpos( $data['message'] ?? '', 'Синхронізовано' ) ) {
                    $data['localized_message'] = sprintf(
                        __( 'Синхронізовано %1$d з %2$d товарів (%3$d%%)...', 'limansoft-sync' ),
                        $data['synced'] ?? 0,
                        $data['total'] ?? 0,
                        $data['percent'] ?? 0
                    );
                }
            }

            wp_send_json_success( $data );
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
