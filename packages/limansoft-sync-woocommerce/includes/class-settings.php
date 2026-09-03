<?php
/**
 * Класс управления настройками плагина (WordPress Options API)
 */
class LSW_Settings {

    /** @var LSW_Settings|null */
    private static $instance = null;

    /** @var array<string, mixed> */
    private $options = [];

    private function __construct() {
        $this->options = (array) get_option( LSW_OPTION_KEY, [] );
    }

    public static function get_instance(): self {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Получить значение настройки
     *
     * @param string $key     Ключ настройки
     * @param mixed  $default Значение по умолчанию
     * @return mixed
     */
    public function get( string $key, $default = null ) {
        return $this->options[ $key ] ?? $default;
    }

    /**
     * Сохранить все настройки
     *
     * @param array<string, mixed> $data
     */
    public function save( array $data ): void {
        $allowed_keys = [
            'api_url',
            'api_key',
            'tenant_id',
            'price_column',
            'stock_column',
            'auto_sync_enabled',
            'sync_interval',
        ];

        $sanitized = [];
        foreach ( $allowed_keys as $key ) {
            if ( isset( $data[ $key ] ) ) {
                $sanitized[ $key ] = sanitize_text_field( $data[ $key ] );
            }
        }

        // Булевые поля
        $sanitized['auto_sync_enabled'] = isset( $data['auto_sync_enabled'] ) ? '1' : '0';

        $this->options = array_merge( $this->options, $sanitized );
        update_option( LSW_OPTION_KEY, $this->options );
    }

    /**
     * Получить API URL без слеша на конце
     */
    public function get_api_url(): string {
        return rtrim( (string) $this->get( 'api_url', '' ), '/' );
    }

    /**
     * Получить Tenant ID
     */
    public function get_tenant_id(): string {
        return (string) $this->get( 'tenant_id', '' );
    }

    /**
     * Получить API Key
     */
    public function get_api_key(): string {
        return (string) $this->get( 'api_key', '' );
    }

    /**
     * Проверить, что настройки полностью заполнены
     */
    public function is_configured(): bool {
        return ! empty( $this->get_api_url() )
            && ! empty( $this->get_tenant_id() )
            && ! empty( $this->get_api_key() );
    }
}
