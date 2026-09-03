<?php
/**
 * HTML-шаблон страницы настроек плагина Limansoft Sync
 *
 * @var LSW_Settings $settings
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

$settings    = LSW_Settings::get_instance();
$cron_status = LSW_Cron::get_instance()->get_status();
$last_sync   = $cron_status['last_sync'];

$price_columns = array_merge( ['cena2' => 'cena2 (Розниця)'], array_combine(
    array_map( fn($i) => "cena{$i}", range(3, 10) ),
    array_map( fn($i) => "cena{$i}", range(3, 10) )
) );
$stock_columns = ['skl_k' => 'skl_k (Основний склад)', 'skl_kt' => 'skl_kt (Транзит)', 'skl_r' => 'skl_r (Роздрібний склад)'];
?>
<div class="wrap lsw-wrap">
    <h1>
        <span class="lsw-logo">⚙</span>
        <?php esc_html_e( 'Limansoft Sync for WooCommerce', 'limansoft-sync' ); ?>
        <span class="lsw-version">v<?php echo esc_html( LSW_VERSION ); ?></span>
    </h1>

    <div class="lsw-grid">
        <!-- ============================================================ -->
        <!-- Левая колонка: форма настроек                                -->
        <!-- ============================================================ -->
        <div class="lsw-card lsw-settings-card">
            <h2><?php esc_html_e( '🔌 Підключення до Limansoft API', 'limansoft-sync' ); ?></h2>

            <div id="lsw-connection-status" class="lsw-status-bar lsw-status-idle">
                <?php esc_html_e( 'Статус підключення невідомий', 'limansoft-sync' ); ?>
            </div>

            <form id="lsw-settings-form" novalidate>
                <input type="hidden" name="nonce" value="<?php echo esc_attr( wp_create_nonce( 'lsw_nonce' ) ); ?>">

                <div class="lsw-field-group">
                    <h3><?php esc_html_e( '🌐 API Налаштування', 'limansoft-sync' ); ?></h3>

                    <div class="lsw-field">
                        <label for="lsw-api-url"><?php esc_html_e( 'API URL', 'limansoft-sync' ); ?> <span class="lsw-required">*</span></label>
                        <input type="url" id="lsw-api-url" name="api_url"
                               value="<?php echo esc_attr( $settings->get( 'api_url', '' ) ); ?>"
                               placeholder="https://api.limansoft.com" required>
                        <p class="lsw-help"><?php esc_html_e( 'URL вашого liman-web-api сервісу (без / на кінці)', 'limansoft-sync' ); ?></p>
                    </div>

                    <div class="lsw-field lsw-field--row">
                        <div class="lsw-field">
                            <label for="lsw-tenant-id"><?php esc_html_e( 'Tenant ID', 'limansoft-sync' ); ?> <span class="lsw-required">*</span></label>
                            <input type="text" id="lsw-tenant-id" name="tenant_id"
                                   value="<?php echo esc_attr( $settings->get( 'tenant_id', '' ) ); ?>"
                                   placeholder="columb" required>
                        </div>
                        <div class="lsw-field">
                            <label for="lsw-api-key"><?php esc_html_e( 'API Key', 'limansoft-sync' ); ?> <span class="lsw-required">*</span></label>
                            <input type="password" id="lsw-api-key" name="api_key"
                                   value="<?php echo esc_attr( $settings->get( 'api_key', '' ) ); ?>"
                                   placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required autocomplete="new-password">
                            <button type="button" class="lsw-toggle-password" data-target="lsw-api-key" title="Показати/сховати">👁</button>
                        </div>
                    </div>

                    <button type="button" id="lsw-test-connection" class="button lsw-btn-secondary">
                        🔍 <?php esc_html_e( 'Перевірити підключення', 'limansoft-sync' ); ?>
                    </button>
                </div>

                <div class="lsw-field-group">
                    <h3><?php esc_html_e( '📦 Дані товарів', 'limansoft-sync' ); ?></h3>

                    <div class="lsw-field lsw-field--row">
                        <div class="lsw-field">
                            <label for="lsw-price-column"><?php esc_html_e( 'Прайс-колонка', 'limansoft-sync' ); ?></label>
                            <select id="lsw-price-column" name="price_column">
                                <?php foreach ( $price_columns as $val => $label ) : ?>
                                    <option value="<?php echo esc_attr( $val ); ?>"<?php selected( $settings->get( 'price_column', 'cena2' ), $val ); ?>>
                                        <?php echo esc_html( $label ); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>

                        <div class="lsw-field">
                            <label for="lsw-stock-column"><?php esc_html_e( 'Склад', 'limansoft-sync' ); ?></label>
                            <select id="lsw-stock-column" name="stock_column">
                                <?php foreach ( $stock_columns as $val => $label ) : ?>
                                    <option value="<?php echo esc_attr( $val ); ?>"<?php selected( $settings->get( 'stock_column', 'skl_k' ), $val ); ?>>
                                        <?php echo esc_html( $label ); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="lsw-field-group">
                    <h3><?php esc_html_e( '⏰ Автоматична синхронізація', 'limansoft-sync' ); ?></h3>

                    <div class="lsw-toggle-row">
                        <label class="lsw-toggle-switch">
                            <input type="checkbox" id="lsw-auto-sync" name="auto_sync_enabled" value="1"
                                   <?php checked( '1', $settings->get( 'auto_sync_enabled', '0' ) ); ?>>
                            <span class="lsw-toggle-slider"></span>
                        </label>
                        <span class="lsw-toggle-label">
                            <?php esc_html_e( 'Увімкнути автоматичну синхронізацію по розкладу', 'limansoft-sync' ); ?>
                        </span>
                    </div>
                    <p class="lsw-help">
                        <?php esc_html_e( 'При вимкненні — WP-Cron задача скасовується. Ручна синхронізація та вебхуки продовжують працювати.', 'limansoft-sync' ); ?>
                    </p>

                    <div id="lsw-interval-row" class="lsw-field <?php echo '1' !== $settings->get( 'auto_sync_enabled', '0' ) ? 'lsw-disabled' : ''; ?>">
                        <label for="lsw-sync-interval"><?php esc_html_e( 'Інтервал оновлення', 'limansoft-sync' ); ?></label>
                        <select id="lsw-sync-interval" name="sync_interval" <?php echo '1' !== $settings->get( 'auto_sync_enabled', '0' ) ? 'disabled' : ''; ?>>
                            <?php foreach ( LSW_Cron::INTERVALS as $minutes => $label ) : ?>
                                <option value="<?php echo esc_attr( $minutes ); ?>"<?php selected( (int) $settings->get( 'sync_interval', 15 ), $minutes ); ?>>
                                    <?php echo esc_html( $label ); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>

                        <?php if ( $cron_status['is_scheduled'] ) : ?>
                            <p class="lsw-help lsw-cron-status lsw-ok">
                                ✅ <?php printf(
                                    /* translators: 1: human-readable time */
                                    esc_html__( 'Наступний запуск: через %s', 'limansoft-sync' ),
                                    esc_html( $cron_status['next_run'] )
                                ); ?>
                            </p>
                        <?php else : ?>
                            <p class="lsw-help lsw-cron-status lsw-off">
                                🛑 <?php esc_html_e( 'Розклад вимкнено', 'limansoft-sync' ); ?>
                            </p>
                        <?php endif; ?>
                    </div>
                </div>

                <div class="lsw-actions">
                    <button type="submit" class="button button-primary lsw-btn-save">
                        💾 <?php esc_html_e( 'Зберегти налаштування', 'limansoft-sync' ); ?>
                    </button>
                </div>
            </form>
        </div>

        <!-- ============================================================ -->
        <!-- Права колонка: синхронізація та статус                       -->
        <!-- ============================================================ -->
        <div class="lsw-sidebar">

            <div class="lsw-card lsw-sync-card">
                <h2><?php esc_html_e( '🔄 Синхронізація', 'limansoft-sync' ); ?></h2>

                <p><?php esc_html_e( 'Завантажити весь каталог товарів з Limansoft до WooCommerce прямо зараз.', 'limansoft-sync' ); ?></p>

                <div class="lsw-progress-wrap" id="lsw-progress-wrap" style="display:none">
                    <div class="lsw-progress-bar">
                        <div class="lsw-progress-fill" id="lsw-progress-fill"></div>
                    </div>
                    <p id="lsw-progress-text"></p>
                </div>

                <div id="lsw-sync-result" class="lsw-result-box" style="display:none"></div>

                <button type="button" id="lsw-sync-now" class="button lsw-btn-sync"
                        <?php echo ! $settings->is_configured() ? 'disabled title="Спочатку збережіть налаштування"' : ''; ?>>
                    🚀 <?php esc_html_e( 'Синхронізувати зараз', 'limansoft-sync' ); ?>
                </button>

                <?php if ( $last_sync ) : ?>
                    <div class="lsw-last-sync">
                        <strong><?php esc_html_e( 'Остання синхронізація:', 'limansoft-sync' ); ?></strong><br>
                        <span class="<?php echo $last_sync['success'] ? 'lsw-ok' : 'lsw-error'; ?>">
                            <?php echo esc_html( $last_sync['time'] ); ?> —
                            <?php echo esc_html( $last_sync['message'] ); ?>
                        </span>
                    </div>
                <?php endif; ?>
            </div>

            <div class="lsw-card lsw-info-card">
                <h2><?php esc_html_e( 'ℹ Інформація', 'limansoft-sync' ); ?></h2>
                <ul class="lsw-info-list">
                    <li><strong>SKU</strong> = tcod з Limansoft</li>
                    <li><strong>Ціна</strong> = <?php echo esc_html( $settings->get( 'price_column', 'cena2' ) ); ?></li>
                    <li><strong>Залишок</strong> = <?php echo esc_html( $settings->get( 'stock_column', 'skl_k' ) ); ?></li>
                    <li><strong>Зображення</strong> — стримінг через media API</li>
                    <li><strong>Вебхук замовлень</strong> — автоматичне списання залишків</li>
                </ul>

                <hr>
                <p class="lsw-help">
                    <?php printf(
                        /* translators: 1: docs URL */
                        esc_html__( 'Документація: %s', 'limansoft-sync' ),
                        '<a href="https://github.com/your-org/liman-web-api/wiki" target="_blank">liman-web-api Wiki</a>'
                    ); ?>
                </p>
            </div>
        </div>
    </div><!-- .lsw-grid -->
</div><!-- .lsw-wrap -->
