<?php
/**
 * Пряме підключення до бази даних (БД / Limansoft)
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class LSW_Direct_DB {

    /** @var LSW_Direct_DB|null */
    private static $instance = null;

    /** @var mysqli|null */
    private $mysqli = null;

    /** @var LSW_Settings */
    private $settings;

    public static function get_instance(): self {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        $this->settings = LSW_Settings::get_instance();
        $this->connect();
    }

    /**
     * Ініціалізувати підключення до бази даних (БД)
     */
    public function connect(): bool {
        if ( ! $this->settings->is_direct_db_enabled() ) {
            return false;
        }

        $host_raw = $this->settings->get_db_host();
        $host_parts = explode( ':', $host_raw );
        $db_host = ! empty( $host_parts[0] ) ? $host_parts[0] : 'db';
        $db_port = isset( $host_parts[1] ) ? (int) $host_parts[1] : 3306;

        $db_name = $this->settings->get_db_name();
        $db_user = $this->settings->get_db_user();
        $db_pass = $this->settings->get_db_pass();

        try {
            mysqli_report( MYSQLI_REPORT_OFF );
            $this->mysqli = @new mysqli( $db_host, $db_user, $db_pass, $db_name, $db_port );
            if ( $this->mysqli->connect_error ) {
                error_log( "[Limansoft Sync] Direct DB Connection Error: " . $this->mysqli->connect_error );
                $this->mysqli = null;
                return false;
            }
            $this->mysqli->set_charset( 'utf8mb4' );
            return true;
        } catch ( Throwable $e ) {
            error_log( "[Limansoft Sync] Direct DB Exception: " . $e->getMessage() );
            $this->mysqli = null;
            return false;
        }
    }

    /**
     * Проверить активность соединения
     */
    public function is_connected(): bool {
        if ( null === $this->mysqli ) {
            return false;
        }
        return @$this->mysqli->ping();
    }

    /**
     * Получить подробный статус подключения
     *
     * @return array{connected: bool, message: string, host: string, database: string}
     */
    public function get_connection_status(): array {
        if ( ! $this->settings->is_direct_db_enabled() ) {
            return [
                'connected' => false,
                'message'   => __( 'Пряме підключення до БД Limansoft вимкнено в налаштуваннях', 'limansoft-sync' ),
                'host'      => $this->settings->get_db_host(),
                'database'  => $this->settings->get_db_name(),
            ];
        }

        if ( ! $this->is_connected() && ! $this->connect() ) {
            return [
                'connected' => false,
                'message'   => sprintf(
                    __( 'Помилка підключення до БД Limansoft (%s / %s)', 'limansoft-sync' ),
                    $this->settings->get_db_host(),
                    $this->settings->get_db_name()
                ),
                'host'      => $this->settings->get_db_host(),
                'database'  => $this->settings->get_db_name(),
            ];
        }

        return [
            'connected' => true,
            'message'   => sprintf(
                __( 'Успішно підключено до БД Limansoft (%s / %s)', 'limansoft-sync' ),
                $this->settings->get_db_host(),
                $this->settings->get_db_name()
            ),
            'host'      => $this->settings->get_db_host(),
            'database'  => $this->settings->get_db_name(),
        ];
    }

    /**
     * Выбрать табачные изделия из базы с фильтрацией групп
     *
     * @return array<int, array<string, mixed>>
     */
    /**
     * Получить безопасные названия колонок цены и остатка с автоопределением
     *
     * @return array{price: string, stock: string}
     */
    private function get_safe_columns(): array {
        $price_col = $this->settings->get( 'price_column', '' );
        $stock_col = $this->settings->get( 'stock_column', '' );

        $columns = [];
        $res = $this->mysqli ? $this->mysqli->query( "SHOW COLUMNS FROM name2" ) : null;
        if ( $res ) {
            while ( $col = $res->fetch_assoc() ) {
                $columns[ strtolower( $col['Field'] ) ] = true;
            }
        }

        if ( empty( $price_col ) || ! isset( $columns[ strtolower( (string) $price_col ) ] ) ) {
            if ( isset( $columns['cena1'] ) ) {
                $price_col = 'cena1';
            } elseif ( isset( $columns['cena2'] ) ) {
                $price_col = 'cena2';
            } else {
                $price_col = 'cena1';
            }
        }

        if ( empty( $stock_col ) || ! isset( $columns[ strtolower( (string) $stock_col ) ] ) ) {
            if ( isset( $columns['sklad'] ) ) {
                $stock_col = 'sklad';
            } elseif ( isset( $columns['skl_k'] ) ) {
                $stock_col = 'skl_k';
            } else {
                $stock_col = 'sklad';
            }
        }

        return [
            'price' => preg_replace( '/[^a-zA-Z0-9_]/', '', (string) $price_col ),
            'stock' => preg_replace( '/[^a-zA-Z0-9_]/', '', (string) $stock_col ),
        ];
    }

    /**
     * Выбрать табачные изделия из базы с фильтрацией групп
     *
     * @param int $limit Ограничение выборки (0 - все)
     * @return array<int, array<string, mixed>>
     */
    public function get_tobacco_products( int $limit = 0 ): array {
        if ( ! $this->is_connected() && ! $this->connect() ) {
            return [];
        }

        $db_name = $this->settings->get_db_name();
        $cols = $this->get_safe_columns();
        $safe_price_col = $cols['price'];
        $safe_stock_col = $cols['stock'];

        $limit_clause = $limit > 0 ? "LIMIT " . (int) $limit : "";

        $sql = "
            SELECT 
                n2.`index` AS db_id,
                n2.tcod,
                n2.nnom,
                n2.name AS product_name,
                n2.`group` AS category_code,
                n.name_g AS category_name,
                n2.`{$safe_price_col}` AS price,
                n2.`{$safe_stock_col}` AS stock,
                s.codtov AS barcode
            FROM `{$db_name}`.name2 n2
            LEFT JOIN `{$db_name}`.name n ON n2.`group` = n.`group`
            LEFT JOIN `{$db_name}`.strihcod s ON n2.tcod = s.tcod
            WHERE 
                (
                    n.`group` LIKE '02%' 
                    OR n.`group` LIKE '03%' 
                    OR n.`group` = '12' 
                    OR n.parent IN ('02', '03', '12')
                )
                AND n.`group` NOT IN ('0222', '02223', '02224', '02225', '02226', '02227', '02228', '0228')
                AND n2.name IS NOT NULL 
                AND n2.name != ''
            GROUP BY n2.tcod
            ORDER BY n.name_g, n2.name
            {$limit_clause};
        ";

        $result = $this->mysqli->query( $sql );
        if ( ! $result ) {
            error_log( "[Limansoft Sync] Tobacco Query Error: " . $this->mysqli->error );
            return [];
        }

        $items = [];
        while ( $row = $result->fetch_assoc() ) {
            $items[] = $row;
        }
        return $items;
    }

    /**
     * Выбрать все товары каталога напрямую из базы
     *
     * @param int $limit
     * @return array<int, array<string, mixed>>
     */
    public function get_all_products( int $limit = 0 ): array {
        if ( ! $this->is_connected() && ! $this->connect() ) {
            return [];
        }

        $db_name = $this->settings->get_db_name();
        $cols = $this->get_safe_columns();
        $safe_price_col = $cols['price'];
        $safe_stock_col = $cols['stock'];

        $limit_clause = $limit > 0 ? "LIMIT " . (int) $limit : "";

        $sql = "
            SELECT 
                n2.`index` AS db_id,
                n2.tcod,
                n2.nnom,
                n2.name AS product_name,
                n2.`group` AS category_code,
                n.name_g AS category_name,
                n2.`{$safe_price_col}` AS price,
                n2.`{$safe_stock_col}` AS stock,
                s.codtov AS barcode
            FROM `{$db_name}`.name2 n2
            LEFT JOIN `{$db_name}`.name n ON n2.`group` = n.`group`
            LEFT JOIN `{$db_name}`.strihcod s ON n2.tcod = s.tcod
            WHERE n2.name IS NOT NULL AND n2.name != ''
            GROUP BY n2.tcod
            ORDER BY n2.tcod
            {$limit_clause};
        ";

        $result = $this->mysqli->query( $sql );
        if ( ! $result ) {
            error_log( "[Limansoft Sync] All Products Query Error: " . $this->mysqli->error );
            return [];
        }

        $items = [];
        while ( $row = $result->fetch_assoc() ) {
            $items[] = $row;
        }
        return $items;
    }

    /**
     * Пряме списання залишку / оновлення ціни в базі даних (зворотна синхронізація)
     *
     * @param string $tcod
     * @param float|null $price
     * @param int|null $stock
     * @return bool
     */
    public function update_stock_and_price( string $tcod, ?float $price = null, ?int $stock = null ): bool {
        if ( ! $this->is_connected() && ! $this->connect() ) {
            return false;
        }

        $db_name = $this->settings->get_db_name();
        $cols = $this->get_safe_columns();
        $price_col = $cols['price'];
        $stock_col = $cols['stock'];

        $updates = [];
        if ( null !== $price ) {
            $updates[] = "`{$price_col}` = " . (float) $price;
        }
        if ( null !== $stock ) {
            $updates[] = "`{$stock_col}` = " . (int) $stock;
        }

        if ( empty( $updates ) ) {
            return false;
        }

        $safe_tcod = $this->mysqli->real_escape_string( $tcod );
        $sql = "UPDATE `{$db_name}`.name2 SET " . implode( ', ', $updates ) . " WHERE tcod = '{$safe_tcod}' LIMIT 1;";

        return (bool) $this->mysqli->query( $sql );
    }
}
