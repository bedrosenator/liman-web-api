<?php
/**
 * Класс управления настройками плагина (WordPress Options API)
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

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
            'auto_update_product',
            'sync_interval',
            // Direct DB settings
            'direct_db_enabled',
            'db_host',
            'db_name',
            'db_user',
            'db_pass',
            'spider_auto_enrich',
            'update_stock_enabled',
            'import_language',
        ];

        $sanitized = [];
        foreach ( $allowed_keys as $key ) {
            if ( isset( $data[ $key ] ) ) {
                $sanitized[ $key ] = sanitize_text_field( $data[ $key ] );
            }
        }

        // Булевые поля
        $sanitized['auto_sync_enabled']    = isset( $data['auto_sync_enabled'] ) && '1' === (string) $data['auto_sync_enabled'] ? '1' : '0';
        $sanitized['auto_update_product']  = isset( $data['auto_update_product'] ) && '1' === (string) $data['auto_update_product'] ? '1' : '0';
        $sanitized['direct_db_enabled']    = isset( $data['direct_db_enabled'] ) && '1' === (string) $data['direct_db_enabled'] ? '1' : '0';
        $sanitized['spider_auto_enrich']   = isset( $data['spider_auto_enrich'] ) && '1' === (string) $data['spider_auto_enrich'] ? '1' : '0';
        $sanitized['update_stock_enabled'] = isset( $data['update_stock_enabled'] ) && '0' === (string) $data['update_stock_enabled'] ? '0' : '1';

        $this->options = array_merge( $this->options, $sanitized );
        update_option( LSW_OPTION_KEY, $this->options );
    }

    /**
     * Получить язык импорта товаров ('uk', 'ru', 'both')
     */
    public function get_import_language(): string {
        $lang = (string) $this->get( 'import_language', 'uk' );
        return in_array( $lang, [ 'uk', 'ru', 'both' ], true ) ? $lang : 'uk';
    }

    /**
     * Включено ли обновление остатков при синхронизации (по умолчанию включено)
     */
    public function is_update_stock_enabled(): bool {
        return '0' !== (string) $this->get( 'update_stock_enabled', '1' );
    }

    /**
     * Включена ли автоматическая отправка товаров в Limansoft (Two-Way Sync)
     */
    public function is_auto_update_product_enabled(): bool {
        return '1' === (string) $this->get( 'auto_update_product', '1' );
    }

    /**
     * Включено ли прямое подключение к базе данных (БД)
     */
    public function is_direct_db_enabled(): bool {
        return '1' === (string) $this->get( 'direct_db_enabled', '1' );
    }

    /**
     * Получить хост базы данных (БД)
     */
    public function get_db_host(): string {
        $host = (string) $this->get( 'db_host', '' );
        if ( ! empty( $host ) ) {
            return $host;
        }
        return defined( 'DB_HOST' ) ? DB_HOST : 'db:3306';
    }

    /**
     * Получить имя базы данных (БД)
     */
    public function get_db_name(): string {
        return (string) $this->get( 'db_name', 'limanDB' );
    }

    /**
     * Получить пользователя базы данных (БД)
     */
    public function get_db_user(): string {
        return (string) $this->get( 'db_user', 'root' );
    }

    /**
     * Получить пароль базы данных (БД)
     */
    public function get_db_pass(): string {
        return (string) $this->get( 'db_pass', 'rootpassword' );
    }

    /**
     * Получить API URL без слеша на конце
     */
    public function get_api_url(): string {
        return rtrim( (string) $this->get( 'api_url', 'http://host.docker.internal:3000' ), '/' );
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
     * Проверить, что настройки API полностью заполнены
     */
    public function is_configured(): bool {
        return ! empty( $this->get_api_url() )
            && ! empty( $this->get_tenant_id() )
            && ! empty( $this->get_api_key() );
    }
}
