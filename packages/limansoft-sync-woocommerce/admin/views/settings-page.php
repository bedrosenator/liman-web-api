<?php
/**
 * HTML-шаблон единой панели управления синхронизацией Limansoft Sync for WooCommerce
 *
 * @var LSW_Settings $settings
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

$settings    = LSW_Settings::get_instance();
$cron_status = LSW_Cron::get_instance()->get_status();
$last_sync   = $cron_status['last_sync'];
$logs        = LSW_Migrator::get_instance()->get_logs();

$price_columns = array_merge(
    [ 'cena2' => sprintf( 'cena2 (%s)', __( 'Роздріб', 'limansoft-sync' ) ) ],
    array_combine(
        array_map( fn($i) => "cena{$i}", range(3, 10) ),
        array_map( fn($i) => "cena{$i}", range(3, 10) )
    )
);
$stock_columns = [
    'skl_k'  => sprintf( 'skl_k (%s)', __( 'Основний склад', 'limansoft-sync' ) ),
    'skl_kt' => sprintf( 'skl_kt (%s)', __( 'Транзит', 'limansoft-sync' ) ),
    'skl_r'  => sprintf( 'skl_r (%s)', __( 'Роздрібний склад', 'limansoft-sync' ) ),
];
?>
<div class="wrap lsw-wrap">
    <h1>
        <span class="lsw-logo">⚡</span>
        <?php esc_html_e( 'Limansoft Sync for WooCommerce', 'limansoft-sync' ); ?>
        <span class="lsw-version">v<?php echo esc_html( LSW_VERSION ); ?></span>
    </h1>

    <div class="lsw-grid">
        <!-- ============================================================ -->
        <!-- Левая колонка: форма настроек API и БД                       -->
        <!-- ============================================================ -->
        <div class="lsw-card lsw-settings-card">
            <h2><?php esc_html_e( '🔌 Підключення до Limansoft (API та База Даних)', 'limansoft-sync' ); ?></h2>

            <div id="lsw-connection-status" class="lsw-status-bar lsw-status-idle">
                <?php esc_html_e( 'Статус підключення невідомий', 'limansoft-sync' ); ?>
            </div>

            <form id="lsw-settings-form" novalidate>
                <input type="hidden" name="nonce" value="<?php echo esc_attr( wp_create_nonce( 'lsw_nonce' ) ); ?>">

                <!-- 1. Настройки REST API -->
                <div class="lsw-field-group">
                    <h3><?php esc_html_e( '🌐 Налаштування API (liman-web-api)', 'limansoft-sync' ); ?></h3>

                    <div class="lsw-field">
                        <label for="lsw-api-url"><?php esc_html_e( 'API URL', 'limansoft-sync' ); ?> <span class="lsw-required">*</span></label>
                        <input type="url" id="lsw-api-url" name="api_url"
                               value="<?php echo esc_attr( $settings->get_api_url() ); ?>"
                               placeholder="http://host.docker.internal:3000" required>
                        <p class="lsw-help"><?php esc_html_e( 'URL вашого сервісу liman-web-api (без / на кінці)', 'limansoft-sync' ); ?></p>
                    </div>

                    <div class="lsw-field lsw-field--row">
                        <div class="lsw-field">
                            <label for="lsw-tenant-id"><?php esc_html_e( 'Tenant ID', 'limansoft-sync' ); ?> <span class="lsw-required">*</span></label>
                            <input type="text" id="lsw-tenant-id" name="tenant_id"
                                   value="<?php echo esc_attr( $settings->get_tenant_id() ); ?>"
                                   placeholder="tenant-id" required>
                        </div>
                        <div class="lsw-field">
                            <label for="lsw-api-key"><?php esc_html_e( 'API Key', 'limansoft-sync' ); ?> <span class="lsw-required">*</span></label>
                            <div class="lsw-password-wrap">
                                <input type="password" id="lsw-api-key" name="api_key"
                                       value="<?php echo esc_attr( $settings->get_api_key() ); ?>"
                                       placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required autocomplete="new-password">
                                <button type="button" class="lsw-toggle-password" data-target="lsw-api-key" title="Показати/сховати">👁</button>
                            </div>
                        </div>
                    </div>

                    <button type="button" id="lsw-test-connection" class="button lsw-btn-secondary">
                        🔍 <?php esc_html_e( 'Перевірити підключення до API', 'limansoft-sync' ); ?>
                    </button>
                </div>

                <!-- 2. Прямое подключение к базе данных Limansoft (Direct DB) -->
                <div class="lsw-field-group">
                    <h3><?php esc_html_e( '🗄 Пряме підключення до облікової БД Limansoft (Direct DB)', 'limansoft-sync' ); ?></h3>

                    <div class="lsw-toggle-row">
                        <label class="lsw-toggle-switch">
                            <input type="checkbox" id="lsw-direct-db" name="direct_db_enabled" value="1"
                                   <?php checked( '1', $settings->get( 'direct_db_enabled', '1' ) ); ?>>
                            <span class="lsw-toggle-slider"></span>
                        </label>
                        <span class="lsw-toggle-label">
                            <?php esc_html_e( 'Використовувати пряме підключення до бази даних Limansoft', 'limansoft-sync' ); ?>
                        </span>
                    </div>
                    <p class="lsw-help"><?php esc_html_e( 'Підключення безпосередньо до сервера бази даних програми Limansoft (таблиці name2, name, strihcod) для швидкого оновлення цін та залишків.', 'limansoft-sync' ); ?></p>

                    <div id="lsw-db-fields" class="<?php echo ! $settings->is_direct_db_enabled() ? 'lsw-disabled' : ''; ?>">
                        <div class="lsw-field lsw-field--row">
                            <div class="lsw-field">
                                <label for="lsw-db-host"><?php esc_html_e( 'Хост БД (з портом)', 'limansoft-sync' ); ?></label>
                                <input type="text" id="lsw-db-host" name="db_host"
                                       value="<?php echo esc_attr( $settings->get_db_host() ); ?>"
                                       placeholder="db:3306">
                            </div>
                            <div class="lsw-field">
                                <label for="lsw-db-name"><?php esc_html_e( 'Ім\'я бази даних', 'limansoft-sync' ); ?></label>
                                <input type="text" id="lsw-db-name" name="db_name"
                                       value="<?php echo esc_attr( $settings->get_db_name() ); ?>"
                                       placeholder="limanDB">
                            </div>
                        </div>

                        <div class="lsw-field lsw-field--row">
                            <div class="lsw-field">
                                <label for="lsw-db-user"><?php esc_html_e( 'Користувач БД', 'limansoft-sync' ); ?></label>
                                <input type="text" id="lsw-db-user" name="db_user"
                                       value="<?php echo esc_attr( $settings->get_db_user() ); ?>"
                                       placeholder="root">
                            </div>
                            <div class="lsw-field">
                                <label for="lsw-db-pass"><?php esc_html_e( 'Пароль БД', 'limansoft-sync' ); ?></label>
                                <div class="lsw-password-wrap">
                                    <input type="password" id="lsw-db-pass" name="db_pass"
                                           value="<?php echo esc_attr( $settings->get_db_pass() ); ?>"
                                           placeholder="••••••••" autocomplete="new-password">
                                    <button type="button" class="lsw-toggle-password" data-target="lsw-db-pass" title="Показати/сховати">👁</button>
                                </div>
                            </div>
                        </div>

                        <button type="button" id="lsw-test-db-connection" class="button lsw-btn-secondary">
                            🔍 <?php esc_html_e( 'Перевірити зв\'язок з БД Limansoft', 'limansoft-sync' ); ?>
                        </button>
                    </div>
                </div>

                <!-- 3. Настройки колонок та оновлення залишків -->
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

                    <!-- Радіокнопки керування оновленням залишків -->
                    <div class="lsw-field" style="margin-top: 15px;">
                        <label style="font-weight: 600; margin-bottom: 8px; display: block;">
                            <?php esc_html_e( 'Оновлення залишків при синхронізації:', 'limansoft-sync' ); ?>
                        </label>
                        <div class="lsw-radio-group" style="display: flex; flex-direction: column; gap: 8px;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: normal;">
                                <input type="radio" name="update_stock_enabled" value="1" <?php checked( $settings->is_update_stock_enabled(), true ); ?>>
                                <span><?php esc_html_e( 'Оновлювати залишки товарів (за замовчуванням)', 'limansoft-sync' ); ?></span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: normal;">
                                <input type="radio" name="update_stock_enabled" value="0" <?php checked( $settings->is_update_stock_enabled(), false ); ?>>
                                <span style="color: #666;"><?php esc_html_e( 'Не оновлювати залишки (оновлювати тільки ціни)', 'limansoft-sync' ); ?></span>
                            </label>
                        </div>
                        <p class="description" style="margin-top: 5px;">
                            <?php esc_html_e( 'Дозволяє вимкнути перезапис залишків у WooCommerce при синхронізації з обліковою базою.', 'limansoft-sync' ); ?>
                        </p>
                    </div>

                    <!-- Вибір мови каталогу товарів -->
                    <div class="lsw-field" style="margin-top: 18px;">
                        <label style="font-weight: 600; margin-bottom: 8px; display: block;">
                            <?php esc_html_e( 'Мова каталогу товарів у WooCommerce:', 'limansoft-sync' ); ?>
                        </label>
                        <div class="lsw-radio-group" style="display: flex; flex-direction: column; gap: 8px;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: normal;">
                                <input type="radio" name="import_language" value="uk" <?php checked( 'uk', $settings->get_import_language() ); ?>>
                                <span>🇺🇦 <?php esc_html_e( 'Тільки українська (основна мова, за замовчуванням)', 'limansoft-sync' ); ?></span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: normal;">
                                <input type="radio" name="import_language" value="ru" <?php checked( 'ru', $settings->get_import_language() ); ?>>
                                <span>🇷🇺 <?php esc_html_e( 'Тільки російська', 'limansoft-sync' ); ?></span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: normal;">
                                <input type="radio" name="import_language" value="both" <?php checked( 'both', $settings->get_import_language() ); ?>>
                                <span>🌐 <?php esc_html_e( 'Двомовний каталог (Polylang: UK + RU)', 'limansoft-sync' ); ?></span>
                            </label>
                        </div>
                        <p class="description" style="margin-top: 5px;">
                            <?php esc_html_e( 'Визначає мову створюваних товарів. Опція Polylang створює дві пов\'язані картки товару, якщо в системі активовано плагін Polylang.', 'limansoft-sync' ); ?>
                        </p>
                    </div>
                </div>

                <!-- 4. Автоматическая синхронизация и Two-Way Sync -->
                <div class="lsw-field-group">
                    <h3><?php esc_html_e( '⏰ Автоматична синхронізація та Two-Way Sync', 'limansoft-sync' ); ?></h3>

                    <div class="lsw-toggle-row">
                        <label class="lsw-toggle-switch">
                            <input type="checkbox" id="lsw-auto-sync" name="auto_sync_enabled" value="1"
                                   <?php checked( '1', $settings->get( 'auto_sync_enabled', '0' ) ); ?>>
                            <span class="lsw-toggle-slider"></span>
                        </label>
                        <span class="lsw-toggle-label">
                            <?php esc_html_e( 'Увімкнути автоматичну синхронізацію по розкладу (WP-Cron)', 'limansoft-sync' ); ?>
                        </span>
                    </div>

                    <div id="lsw-interval-row" class="lsw-field <?php echo '1' !== $settings->get( 'auto_sync_enabled', '0' ) ? 'lsw-disabled' : ''; ?>" style="margin-top: 10px;">
                        <label for="lsw-sync-interval"><?php esc_html_e( 'Інтервал оновлення', 'limansoft-sync' ); ?></label>
                        <select id="lsw-sync-interval" name="sync_interval" <?php echo '1' !== $settings->get( 'auto_sync_enabled', '0' ) ? 'disabled' : ''; ?>>
                            <?php foreach ( LSW_Cron::get_intervals() as $minutes => $label ) : ?>
                                <option value="<?php echo esc_attr( $minutes ); ?>"<?php selected( (int) $settings->get( 'sync_interval', 15 ), $minutes ); ?>>
                                    <?php echo esc_html( $label ); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>

                        <?php if ( $cron_status['is_scheduled'] ) : ?>
                            <p class="lsw-help lsw-cron-status lsw-ok">
                                ✅ <?php printf( esc_html__( 'Наступний запуск: через %s', 'limansoft-sync' ), esc_html( $cron_status['next_run'] ) ); ?>
                            </p>
                        <?php else : ?>
                            <p class="lsw-help lsw-cron-status lsw-off">
                                🛑 <?php esc_html_e( 'Розклад вимкнено', 'limansoft-sync' ); ?>
                            </p>
                        <?php endif; ?>
                    </div>

                    <div class="lsw-toggle-row" style="margin-top: 18px;">
                        <label class="lsw-toggle-switch">
                            <input type="checkbox" id="lsw-auto-update-product" name="auto_update_product" value="1"
                                   <?php checked( '1', $settings->get( 'auto_update_product', '1' ) ); ?>>
                            <span class="lsw-toggle-slider"></span>
                        </label>
                        <span class="lsw-toggle-label">
                            <?php esc_html_e( 'Автоматично передавати створені/змінені товари до Limansoft (Two-Way Sync)', 'limansoft-sync' ); ?>
                        </span>
                    </div>
                    <p class="lsw-help">
                        <?php esc_html_e( 'При створенні або редагуванні товару в WooCommerce плагін миттєво відправляє вебхук до Liman Web API для оновлення облікової бази даних.', 'limansoft-sync' ); ?>
                    </p>
                </div>

                <div class="lsw-actions">
                    <button type="submit" class="button button-primary lsw-btn-save">
                        💾 <?php esc_html_e( 'Зберегти налаштування', 'limansoft-sync' ); ?>
                    </button>
                </div>
            </form>
        </div>

        <!-- ============================================================ -->
        <!-- Правая колонка: Пульт управления синхронизацией              -->
        <!-- ============================================================ -->
        <div class="lsw-sidebar">

            <!-- Центр управления операциями -->
            <div class="lsw-card lsw-sync-card">
                <h2><?php esc_html_e( '🚀 Пульт керування синхронізацією', 'limansoft-sync' ); ?></h2>

                <div class="lsw-progress-wrap" id="lsw-progress-wrap" style="display:none">
                    <div class="lsw-progress-bar">
                        <div class="lsw-progress-fill" id="lsw-progress-fill"></div>
                    </div>
                    <p id="lsw-progress-text"></p>
                </div>

                <div id="lsw-sync-result" class="lsw-result-box" style="display:none"></div>

                <div class="lsw-action-buttons">
                    <!-- Кнопка 1: Полный синк через API -->
                    <button type="button" id="lsw-sync-now" class="button lsw-btn-sync lsw-btn-full"
                            <?php echo ! $settings->is_configured() ? 'disabled title="Спочатку збережіть налаштування API"' : ''; ?>>
                        <span class="lsw-btn-icon">🚀</span>
                        <span class="lsw-btn-text"><?php esc_html_e( 'Повна синхронізація через Liman API', 'limansoft-sync' ); ?></span>
                    </button>

                    <!-- Кнопка 2: Полный импорт из БД Limansoft -->
                    <button type="button" id="lsw-import-tobacco" class="button button-primary lsw-btn-primary lsw-btn-full">
                        <span class="lsw-btn-icon">📦</span>
                        <span class="lsw-btn-text"><?php esc_html_e( 'Повний імпорт товарів з БД Limansoft', 'limansoft-sync' ); ?></span>
                    </button>

                    <!-- Кнопка 3: Быстрый синк цен и остатков -->
                    <button type="button" id="lsw-fast-stock-sync" class="button button-secondary lsw-btn-secondary-action lsw-btn-full">
                        <span class="lsw-btn-icon">⚡</span>
                        <span class="lsw-btn-text"><?php esc_html_e( 'Швидке оновлення цін і залишків (Direct DB)', 'limansoft-sync' ); ?></span>
                    </button>

                    <!-- Кнопка 4: Запуск Веб-Паука (Тимчасово приховано: експериментальна функція TASK-25) -->
                    <?php /*
                    <button type="button" id="lsw-web-spider" class="button button-secondary lsw-btn-full" style="color:#008a20; border-color:#008a20;">
                        <span class="lsw-btn-icon">🕷️</span>
                        <span class="lsw-btn-text"><?php esc_html_e( 'Запустити Веб-Паук (Фото та описи)', 'limansoft-sync' ); ?></span>
                    </button>
                    */ ?>

                    <!-- Кнопка 5: Очистка дубликатов -->
                    <button type="button" id="lsw-cleanup-dups" class="button lsw-btn-danger lsw-btn-full">
                        <span class="lsw-btn-icon">🧹</span>
                        <span class="lsw-btn-text"><?php esc_html_e( 'Видалити дублікати в каталозі WooCommerce', 'limansoft-sync' ); ?></span>
                    </button>
                </div>

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

            <!-- Информационный блок -->
            <div class="lsw-card lsw-info-card">
                <h2><?php esc_html_e( 'ℹ Інформація про інтеграцію', 'limansoft-sync' ); ?></h2>
                <ul class="lsw-info-list">
                    <li><strong><?php esc_html_e( 'SKU', 'limansoft-sync' ); ?></strong> = <?php esc_html_e( 'tcod з Limansoft', 'limansoft-sync' ); ?></li>
                    <li><strong><?php esc_html_e( 'Ціна', 'limansoft-sync' ); ?></strong> = <?php echo esc_html( $settings->get( 'price_column', 'cena2' ) ); ?></li>
                    <li><strong><?php esc_html_e( 'Залишок', 'limansoft-sync' ); ?></strong> = <?php echo $settings->is_update_stock_enabled() ? esc_html( $settings->get( 'stock_column', 'skl_k' ) ) : esc_html__( 'Вимкнено (тільки ціни)', 'limansoft-sync' ); ?></li>
                    <?php
                    $lang_labels = [
                        'uk'   => __( 'Тільки українська', 'limansoft-sync' ),
                        'ru'   => __( 'Тільки російська', 'limansoft-sync' ),
                        'both' => __( 'Двомовний (Polylang UK+RU)', 'limansoft-sync' ),
                    ];
                    $current_lang_label = $lang_labels[ $settings->get_import_language() ] ?? __( 'Тільки українська', 'limansoft-sync' );
                    ?>
                    <li><strong><?php esc_html_e( 'Мова каталогу', 'limansoft-sync' ); ?></strong> = <?php echo esc_html( $current_lang_label ); ?></li>
                    <li><strong><?php esc_html_e( 'Зображення', 'limansoft-sync' ); ?></strong> — <?php esc_html_e( 'media API (Liman Web API)', 'limansoft-sync' ); ?></li>
                    <li><strong><?php esc_html_e( 'Вебхук товарів', 'limansoft-sync' ); ?></strong> — <?php esc_html_e( 'двосторонній імпорт у БД Limansoft', 'limansoft-sync' ); ?></li>
                    <li><strong><?php esc_html_e( 'Вебхук замовлень', 'limansoft-sync' ); ?></strong> — <?php esc_html_e( 'автоматичне списання залишків', 'limansoft-sync' ); ?></li>
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

    <!-- ============================================================ -->
    <!-- Нижний блок: Консоль выполнения логов                        -->
    <!-- ============================================================ -->
    <div class="lsw-card lsw-console-card">
        <div class="lsw-console-header">
            <h3><?php esc_html_e( '📋 Консоль та журнал виконання операцій', 'limansoft-sync' ); ?></h3>
            <button type="button" id="lsw-clear-logs" class="button button-small">
                <?php esc_html_e( 'Очистити лог', 'limansoft-sync' ); ?>
            </button>
        </div>

        <pre id="lsw-console" class="lsw-console-body"><?php
        if ( ! empty( $logs ) ) {
            foreach ( $logs as $line ) {
                echo esc_html( $line ) . "\n";
            }
        } else {
            echo esc_html__( 'Лог порожній. Запустіть операцію синхронізації або імпорту.', 'limansoft-sync' ) . "\n";
        }
        ?></pre>
    </div>
</div><!-- .lsw-wrap -->
