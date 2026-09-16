/* global jQuery, lsw_ajax */
(function ($) {
    'use strict';

    // ====================================================================
    // Утилиты
    // ====================================================================

    function setConnectionStatus(type, message) {
        const $bar = $('#lsw-connection-status');
        $bar
            .removeClass('lsw-status-idle lsw-status-success lsw-status-error lsw-status-loading')
            .addClass('lsw-status-' + type)
            .text(message);
    }

    function showResult($el, success, message) {
        $el
            .removeClass('lsw-result-success lsw-result-error')
            .addClass(success ? 'lsw-result-success' : 'lsw-result-error')
            .html(message)
            .show();
    }

    function setProgress(percent, text) {
        $('#lsw-progress-fill').css('width', percent + '%');
        $('#lsw-progress-text').text(text);
    }

    function appendToConsole(text) {
        const $console = $('#lsw-console');
        $console.append(text + "\n");
        $console.scrollTop($console[0].scrollHeight);
    }

    function refreshConsoleLogs(callback) {
        $.post(lsw_ajax.ajax_url, {
            action: 'lsw_get_logs',
            nonce:  lsw_ajax.nonce
        }).done(function (res) {
            if (res.success && Array.isArray(res.data.logs)) {
                const $console = $('#lsw-console');
                $console.text(res.data.logs.join("\n"));
                $console.scrollTop($console[0].scrollHeight);
            }
            if (callback) callback();
        });
    }

    // ====================================================================
    // Показать/скрыть пароль
    // ====================================================================
    $(document).on('click', '.lsw-toggle-password', function () {
        const target = $(this).data('target');
        const $input = $('#' + target);
        $input.attr('type', $input.attr('type') === 'password' ? 'text' : 'password');
    });

    // ====================================================================
    // Toggle авто-синхронизации и прямого подключения к БД
    // ====================================================================
    $('#lsw-auto-sync').on('change', function () {
        const $row = $('#lsw-interval-row');
        const enabled = $(this).is(':checked');
        $row.toggleClass('lsw-disabled', !enabled);
        $('#lsw-sync-interval').prop('disabled', !enabled);
    });

    $('#lsw-direct-db').on('change', function () {
        const enabled = $(this).is(':checked');
        $('#lsw-db-fields').toggleClass('lsw-disabled', !enabled);
    });

    // ====================================================================
    // Сохранить настройки (AJAX)
    // ====================================================================
    $('#lsw-settings-form').on('submit', function (e) {
        e.preventDefault();

        const $btn = $(this).find('.lsw-btn-save');
        const originalText = $btn.html();
        $btn.html('⏳ ' + lsw_ajax.strings.saving).prop('disabled', true);

        const data = {
            action:              'lsw_save_settings',
            nonce:               lsw_ajax.nonce,
            api_url:             $('#lsw-api-url').val().trim(),
            api_key:             $('#lsw-api-key').val().trim(),
            tenant_id:           $('#lsw-tenant-id').val().trim(),
            price_column:        $('#lsw-price-column').val(),
            stock_column:        $('#lsw-stock-column').val(),
            sync_interval:       $('#lsw-sync-interval').val(),
            db_host:             $('#lsw-db-host').val().trim(),
            db_name:             $('#lsw-db-name').val().trim(),
            db_user:             $('#lsw-db-user').val().trim(),
            db_pass:             $('#lsw-db-pass').val(),
        };

        if ($('#lsw-auto-sync').is(':checked')) {
            data.auto_sync_enabled = '1';
        }
        if ($('#lsw-auto-update-product').is(':checked')) {
            data.auto_update_product = '1';
        }
        if ($('#lsw-direct-db').is(':checked')) {
            data.direct_db_enabled = '1';
        }
        data.update_stock_enabled = $('input[name="update_stock_enabled"]:checked').val() || '1';

        $.post(lsw_ajax.ajax_url, data)
            .done(function (res) {
                if (res.success) {
                    $btn.html('✅ ' + lsw_ajax.strings.saved).prop('disabled', false);
                    setTimeout(function () {
                        $btn.html(originalText);
                    }, 2500);

                    if (res.data && res.data.cron_status) {
                        updateCronStatus(res.data.cron_status);
                    }

                    $('#lsw-sync-now').prop('disabled', false).removeAttr('title');
                } else {
                    $btn.html(lsw_ajax.strings.error + ': ' + (res.data || '?')).prop('disabled', false);
                    setTimeout(function () { $btn.html(originalText); }, 3000);
                }
            })
            .fail(function () {
                $btn.html(lsw_ajax.strings.error).prop('disabled', false);
                setTimeout(function () { $btn.html(originalText); }, 3000);
            });
    });

    function updateCronStatus(status) {
        const $row = $('#lsw-interval-row .lsw-cron-status');
        if (status.is_scheduled && status.next_run) {
            const nextText = lsw_ajax.strings.next_run_in ? lsw_ajax.strings.next_run_in.replace('%s', status.next_run) : ('Наступний запуск: через ' + status.next_run);
            $row
                .removeClass('lsw-off')
                .addClass('lsw-ok')
                .html('✅ ' + nextText);
        } else {
            $row
                .removeClass('lsw-ok')
                .addClass('lsw-off')
                .html('🛑 ' + (lsw_ajax.strings.schedule_off || 'Розклад вимкнено'));
        }
    }

    // ====================================================================
    // Проверить подключение к API
    // ====================================================================
    $('#lsw-test-connection').on('click', function () {
        const $btn = $(this);
        $btn.prop('disabled', true).html('⏳ ' + lsw_ajax.strings.testing);
        setConnectionStatus('loading', lsw_ajax.strings.testing);

        $.post(lsw_ajax.ajax_url, {
            action: 'lsw_test_connection',
            nonce:  lsw_ajax.nonce,
        })
            .done(function (res) {
                if (res.success) {
                    setConnectionStatus('success', '✅ ' + res.data.message);
                } else {
                    setConnectionStatus('error', '❌ ' + (res.data && res.data.message ? res.data.message : lsw_ajax.strings.error));
                }
            })
            .fail(function () {
                setConnectionStatus('error', '❌ ' + (lsw_ajax.strings.conn_failed || 'Помилка підключення'));
            })
            .always(function () {
                $btn.prop('disabled', false).html('🔍 ' + (lsw_ajax.strings.test_conn || 'Перевірити підключення'));
            });
    });

    // ====================================================================
    // Проверить подключение к базе данных Limansoft (Direct DB)
    // ====================================================================
    $('#lsw-test-db-connection').on('click', function () {
        const $btn = $(this);
        const originalText = $btn.html();
        $btn.prop('disabled', true).html('⏳ ' + (lsw_ajax.strings.testing_db || 'Перевірка зв\'язку з БД Limansoft...'));

        $.post(lsw_ajax.ajax_url, {
            action: 'lsw_test_db_connection',
            nonce:  lsw_ajax.nonce,
        })
            .done(function (res) {
                if (res.success) {
                    alert('✅ ' + res.data.message);
                    appendToConsole('✅ БД Limansoft: ' + res.data.message);
                } else {
                    alert('❌ ' + (res.data && res.data.message ? res.data.message : (lsw_ajax.strings.error || 'Помилка')));
                    appendToConsole('❌ БД Limansoft: ' + (res.data && res.data.message ? res.data.message : (lsw_ajax.strings.error || 'Помилка')));
                }
            })
            .fail(function () {
                alert(lsw_ajax.strings.network_error || '❌ Помилка надсилання запиту');
            })
            .always(function () {
                $btn.prop('disabled', false).html(originalText);
            });
    });

    // ====================================================================
    // Синхронизация каталога через API
    // ====================================================================
    $('#lsw-sync-now').on('click', function () {
        if (!confirm(lsw_ajax.strings.confirm_sync)) {
            return;
        }

        const $btn = $(this);
        const originalText = $btn.html();
        $btn.prop('disabled', true).html('⏳ ' + lsw_ajax.strings.syncing);

        $.post(lsw_ajax.ajax_url, {
            action: 'lsw_run_api_sync',
            nonce:  lsw_ajax.nonce,
        })
            .done(function (res) {
                if (res.success) {
                    alert('✅ ' + res.data.message);
                } else {
                    alert('❌ ' + (res.data ? res.data.message : (lsw_ajax.strings.error || 'Помилка')));
                }
                refreshConsoleLogs();
            })
            .fail(function () {
                alert(lsw_ajax.strings.network_error || '❌ Помилка мережі при синхронізації');
            })
            .always(function () {
                $btn.prop('disabled', false).html(originalText);
            });
    });

    // ====================================================================
    // Полный импорт товаров из БД Limansoft (с вариациями)
    // ====================================================================
    $('#lsw-import-tobacco').on('click', function () {
        if (!confirm(lsw_ajax.strings.confirm_tobacco)) {
            return;
        }

        const $btn = $(this);
        const originalText = $btn.html();
        $btn.prop('disabled', true).html('⏳ ' + (lsw_ajax.strings.importing || 'Виконується імпорт товарів з БД Limansoft...'));

        $.post(lsw_ajax.ajax_url, {
            action: 'lsw_run_tobacco_migration',
            nonce:  lsw_ajax.nonce,
        })
            .done(function (res) {
                if (res.success) {
                    alert('✅ ' + res.data.message);
                } else {
                    alert('❌ ' + (res.data ? res.data.message : (lsw_ajax.strings.error || 'Помилка')));
                }
                refreshConsoleLogs();
            })
            .fail(function () {
                alert(lsw_ajax.strings.network_error || '❌ Помилка мережі при імпорті');
            })
            .always(function () {
                $btn.prop('disabled', false).html(originalText);
            });
    });

    // ====================================================================
    // Быстрый синк цен и остатков
    // ====================================================================
    $('#lsw-fast-stock-sync').on('click', function () {
        const $btn = $(this);
        const originalText = $btn.html();
        $btn.prop('disabled', true).html('⏳ ' + (lsw_ajax.strings.updating_prices || 'Оновлення цін та залишків...'));

        $.post(lsw_ajax.ajax_url, {
            action: 'lsw_run_stock_sync',
            nonce:  lsw_ajax.nonce,
        })
            .done(function (res) {
                if (res.success) {
                    alert('✅ ' + res.data.message);
                } else {
                    alert('❌ ' + (res.data ? res.data.message : (lsw_ajax.strings.error || 'Помилка')));
                }
                refreshConsoleLogs();
            })
            .fail(function () {
                alert(lsw_ajax.strings.network_error || '❌ Помилка мережі при синхронізації');
            })
            .always(function () {
                $btn.prop('disabled', false).html(originalText);
            });
    });

    // ====================================================================
    // Запуск Веб-Паука (обогащение описаний и фото)
    // ====================================================================
    $('#lsw-web-spider').on('click', function () {
        if (!confirm(lsw_ajax.strings.confirm_spider)) {
            return;
        }

        const $btn = $(this);
        const originalText = $btn.html();
        $btn.prop('disabled', true).html('⏳ Веб-Паук...');

        $.post(lsw_ajax.ajax_url, {
            action: 'lsw_run_web_spider',
            nonce:  lsw_ajax.nonce,
        })
            .done(function (res) {
                if (res.success) {
                    alert('✅ ' + res.data.message);
                } else {
                    alert('❌ ' + (res.data ? res.data.message : (lsw_ajax.strings.error || 'Помилка')));
                }
                refreshConsoleLogs();
            })
            .fail(function () {
                alert(lsw_ajax.strings.network_error || '❌ Помилка мережі при запуску Веб-Паука');
            })
            .always(function () {
                $btn.prop('disabled', false).html(originalText);
            });
    });

    // ====================================================================
    // Удаление дубликатов
    // ====================================================================
    $('#lsw-cleanup-dups').on('click', function () {
        if (!confirm(lsw_ajax.strings.confirm_cleanup)) {
            return;
        }

        const $btn = $(this);
        const originalText = $btn.html();
        $btn.prop('disabled', true).html('⏳ ' + (lsw_ajax.strings.cleaning_dups || 'Очищення дублікатів...'));

        $.post(lsw_ajax.ajax_url, {
            action: 'lsw_run_cleanup_duplicates',
            nonce:  lsw_ajax.nonce,
        })
            .done(function (res) {
                if (res.success) {
                    alert('✅ ' + res.data.message);
                } else {
                    alert('❌ ' + (res.data ? res.data.message : (lsw_ajax.strings.error || 'Помилка')));
                }
                refreshConsoleLogs();
            })
            .fail(function () {
                alert(lsw_ajax.strings.network_error || '❌ Помилка мережі при очищенні дублікатів');
            })
            .always(function () {
                $btn.prop('disabled', false).html(originalText);
            });
    });

    // ====================================================================
    // Очистка логов консоли
    // ====================================================================
    $('#lsw-clear-logs').on('click', function () {
        $.post(lsw_ajax.ajax_url, {
            action: 'lsw_clear_logs',
            nonce:  lsw_ajax.nonce,
        }).done(function () {
            $('#lsw-console').text(lsw_ajax.strings.log_cleared || 'Лог очищено.');
        });
    });

})(jQuery);
