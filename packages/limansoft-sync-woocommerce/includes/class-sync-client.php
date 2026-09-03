<?php
/**
 * HTTP-клиент для взаимодействия с liman-web-api
 */
class LSW_Sync_Client {

    /** @var LSW_Sync_Client|null */
    private static $instance = null;

    /** @var LSW_Settings */
    private $settings;

    private function __construct() {
        $this->settings = LSW_Settings::get_instance();
    }

    public static function get_instance(): self {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Базовые заголовки для всех запросов к API
     *
     * @return array<string, string>
     */
    private function get_headers(): array {
        return [
            'Content-Type' => 'application/json',
            'x-api-key'    => $this->settings->get_api_key(),
        ];
    }

    /**
     * Проверить подключение к liman-web-api (/health)
     *
     * @return array{success: bool, status?: string, version?: string, message: string}
     */
    public function test_connection(): array {
        $url = $this->settings->get_api_url() . '/api/v1/health';

        $response = wp_remote_get( $url, [
            'timeout' => 10,
            'headers' => [ 'x-api-key' => $this->settings->get_api_key() ],
        ] );

        if ( is_wp_error( $response ) ) {
            return [
                'success' => false,
                'message' => $response->get_error_message(),
            ];
        }

        $code = wp_remote_retrieve_response_code( $response );
        $body = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( 200 === $code ) {
            return [
                'success' => true,
                'version' => $body['version'] ?? '—',
                'status'  => $body['status'] ?? 'ok',
                'message' => sprintf(
                    /* translators: 1: service version */
                    __( 'Подключено к Limansoft API v%s', 'limansoft-sync' ),
                    $body['version'] ?? '?'
                ),
            ];
        }

        return [
            'success' => false,
            'message' => sprintf(
                /* translators: 1: HTTP status code */
                __( 'Ошибка подключения (HTTP %d)', 'limansoft-sync' ),
                $code
            ),
        ];
    }

    /**
     * Запустить полную синхронизацию каталога
     *
     * @return array{success: bool, message: string, data?: array<string, mixed>}
     */
    public function sync_catalog(): array {
        if ( ! $this->settings->is_configured() ) {
            return [
                'success' => false,
                'message' => __( 'Плагин не настроен. Заполните API URL, API Key и Tenant ID.', 'limansoft-sync' ),
            ];
        }

        $tenant_id = $this->settings->get_tenant_id();
        $url       = $this->settings->get_api_url() . "/api/v1/woocommerce/{$tenant_id}/sync";

        $response = wp_remote_post( $url, [
            'timeout' => 120,
            'headers' => $this->get_headers(),
            'body'    => '{}',
        ] );

        if ( is_wp_error( $response ) ) {
            return [
                'success' => false,
                'message' => $response->get_error_message(),
            ];
        }

        $code = wp_remote_retrieve_response_code( $response );
        $body = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( in_array( $code, [ 200, 202 ], true ) && ! empty( $body['success'] ) ) {
            return [
                'success' => true,
                'message' => sprintf(
                    /* translators: 1: synced count, 2: errors count, 3: duration ms */
                    __( 'Синхронизировано %d товаров (ошибок: %d) за %d мс', 'limansoft-sync' ),
                    $body['synced'] ?? 0,
                    $body['errors'] ?? 0,
                    $body['durationMs'] ?? 0
                ),
                'data' => $body,
            ];
        }

        return [
            'success' => false,
            'message' => sprintf(
                /* translators: 1: HTTP code, 2: error message */
                __( 'Ошибка синхронизации (HTTP %1$d): %2$s', 'limansoft-sync' ),
                $code,
                $body['message'] ?? wp_remote_retrieve_body( $response )
            ),
        ];
    }

    /**
     * Отправить данные заказа в Limansoft (списание остатка)
     *
     * @param int   $order_id  ID заказа WooCommerce
     * @param array $line_items Позиции заказа
     * @return bool
     */
    public function notify_order( int $order_id, array $line_items ): bool {
        if ( ! $this->settings->is_configured() ) {
            return false;
        }

        $tenant_id = $this->settings->get_tenant_id();
        $url       = $this->settings->get_api_url() . "/api/v1/woocommerce/{$tenant_id}/webhook/order";

        $response = wp_remote_post( $url, [
            'timeout' => 15,
            'headers' => $this->get_headers(),
            'body'    => wp_json_encode( [
                'order_id'   => $order_id,
                'source'     => 'woocommerce',
                'line_items' => $line_items,
            ] ),
        ] );

        return ! is_wp_error( $response ) && 200 === wp_remote_retrieve_response_code( $response );
    }
}
