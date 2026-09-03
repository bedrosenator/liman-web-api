<?php
/**
 * Управление WP-Cron расписанием для периодической синхронизации
 */
class LSW_Cron {

    /** @var LSW_Cron|null */
    private static $instance = null;

    /** @var LSW_Settings */
    private $settings;

    /**
     * Допустимые интервалы (минуты → label)
     *
     * @var array<int, string>
     */
    const INTERVALS = [
        15  => '15 минут',
        30  => '30 минут',
        60  => '1 час',
    ];

    private function __construct() {
        $this->settings = LSW_Settings::get_instance();

        // Регистрируем пользовательские интервалы в WP-Cron
        add_filter( 'cron_schedules', [ $this, 'add_schedules' ] );

        // Обработчик события cron
        add_action( LSW_CRON_HOOK, [ $this, 'run_sync' ] );
    }

    public static function get_instance(): self {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Добавить пользовательские интервалы в WP-Cron
     *
     * @param array $schedules
     * @return array
     */
    public function add_schedules( array $schedules ): array {
        $schedules['limansoft_15min'] = [
            'interval' => 15 * MINUTE_IN_SECONDS,
            'display'  => __( 'Каждые 15 минут (Limansoft)', 'limansoft-sync' ),
        ];
        $schedules['limansoft_30min'] = [
            'interval' => 30 * MINUTE_IN_SECONDS,
            'display'  => __( 'Каждые 30 минут (Limansoft)', 'limansoft-sync' ),
        ];
        $schedules['limansoft_60min'] = [
            'interval' => HOUR_IN_SECONDS,
            'display'  => __( 'Каждый час (Limansoft)', 'limansoft-sync' ),
        ];
        return $schedules;
    }

    /**
     * Конвертация минут в slug расписания WP-Cron
     *
     * @param int $minutes
     * @return string
     */
    public function get_schedule_slug( int $minutes ): string {
        switch ( $minutes ) {
            case 15:
                return 'limansoft_15min';
            case 30:
                return 'limansoft_30min';
            case 60:
            default:
                return 'limansoft_60min';
        }
    }

    /**
     * Зарегистрировать задачу в WP-Cron
     */
    public function schedule(): void {
        if ( wp_next_scheduled( LSW_CRON_HOOK ) ) {
            return; // Уже запланировано
        }

        $interval_minutes = (int) $this->settings->get( 'sync_interval', 15 );
        $schedule_slug    = $this->get_schedule_slug( $interval_minutes );

        wp_schedule_event( time(), $schedule_slug, LSW_CRON_HOOK );

        error_log( "[Limansoft Sync] ✅ WP-Cron задача создана, интервал: {$interval_minutes} мин." );
    }

    /**
     * Отменить задачу WP-Cron
     */
    public function unschedule(): void {
        $timestamp = wp_next_scheduled( LSW_CRON_HOOK );
        if ( $timestamp ) {
            wp_unschedule_event( $timestamp, LSW_CRON_HOOK );
            error_log( '[Limansoft Sync] 🛑 WP-Cron задача отменена.' );
        }
    }

    /**
     * Перепланировать задачу (при смене интервала)
     */
    public function reschedule(): void {
        $this->unschedule();

        if ( '1' === $this->settings->get( 'auto_sync_enabled', '0' ) ) {
            $this->schedule();
        }
    }

    /**
     * Выполнить синхронизацию (вызывается WP-Cron)
     */
    public function run_sync(): void {
        error_log( '[Limansoft Sync] ⏰ WP-Cron: запуск синхронизации...' );

        $client = LSW_Sync_Client::get_instance();
        $result = $client->sync_catalog();

        if ( $result['success'] ) {
            error_log( '[Limansoft Sync] ✅ WP-Cron синхронизация завершена: ' . $result['message'] );
        } else {
            error_log( '[Limansoft Sync] ❌ WP-Cron синхронизация ошибка: ' . $result['message'] );
        }

        // Сохранить время последней синхронизации
        update_option( 'limansoft_last_sync', [
            'time'    => current_time( 'mysql' ),
            'success' => $result['success'],
            'message' => $result['message'],
        ] );
    }

    /**
     * Получить информацию о следующем запуске
     *
     * @return array{next_run: string|null, interval: string}
     */
    public function get_status(): array {
        $next = wp_next_scheduled( LSW_CRON_HOOK );
        $last = get_option( 'limansoft_last_sync', null );
        $interval_min = (int) $this->settings->get( 'sync_interval', 15 );

        return [
            'next_run'     => $next ? human_time_diff( $next ) : null,
            'next_run_raw' => $next ?: null,
            'last_sync'    => $last,
            'interval'     => self::INTERVALS[ $interval_min ] ?? "{$interval_min} мин.",
            'is_scheduled' => (bool) $next,
        ];
    }
}
