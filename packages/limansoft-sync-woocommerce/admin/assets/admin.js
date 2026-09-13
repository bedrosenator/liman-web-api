/* global jQuery, lsw_ajax */
(function ($) {
    'use strict';

    // ====================================================================
    // Утиліти
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

    // ====================================================================
    // Показати/сховати пароль
    // ====================================================================
    $(document).on('click', '.lsw-toggle-password', function () {
        const target = $(this).data('target');
        const $input = $('#' + target);
        $input.attr('type', $input.attr('type') === 'password' ? 'text' : 'password');
    });

    // ====================================================================
    // Toggle авто-синхронізації → вмикає/вимикає select інтервалу
    // ====================================================================
    $('#lsw-auto-sync').on('change', function () {
        const $row = $('#lsw-interval-row');
        const enabled = $(this).is(':checked');
        $row.toggleClass('lsw-disabled', !enabled);
        $('#lsw-sync-interval').prop('disabled', !enabled);
    });

    // ====================================================================
    // Зберегти налаштування (AJAX)
    // ====================================================================
    $('#lsw-settings-form').on('submit', function (e) {
        e.preventDefault();

        const $btn = $(this).find('.lsw-btn-save');
        const originalText = $btn.html();
        $btn.html('⏳ ' + lsw_ajax.strings.saving).prop('disabled', true);

        const data = {
            action: 'lsw_save_settings',
            nonce:  lsw_ajax.nonce,
            api_url:          $('#lsw-api-url').val().trim(),
            api_key:          $('#lsw-api-key').val().trim(),
            tenant_id:        $('#lsw-tenant-id').val().trim(),
            price_column:     $('#lsw-price-column').val(),
            stock_column:     $('#lsw-stock-column').val(),
            sync_interval:    $('#lsw-sync-interval').val(),
        };

        if ($('#lsw-auto-sync').is(':checked')) {
            data.auto_sync_enabled = '1';
        }

        if ($('#lsw-auto-update-product').is(':checked')) {
            data.auto_update_product = '1';
        }

        $.post(lsw_ajax.ajax_url, data)
            .done(function (res) {
                if (res.success) {
                    $btn.html('✅ ' + lsw_ajax.strings.saved).prop('disabled', false);
                    setTimeout(function () {
                        $btn.html(originalText);
                    }, 2500);

                    // Оновити cron-статус
                    if (res.data && res.data.cron_status) {
                        updateCronStatus(res.data.cron_status);
                    }

                    // Активувати кнопку синхронізації
                    $('#lsw-sync-now').prop('disabled', false).removeAttr('title');
                } else {
                    $btn.html(lsw_ajax.strings.error + ': ' + (res.data || '?')).prop('disabled', false);
                    setTimeout(function () {
                        $btn.html(originalText);
                    }, 3000);
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
            $row
                .removeClass('lsw-off')
                .addClass('lsw-ok')
                .html('✅ Наступний запуск: через ' + status.next_run);
        } else {
            $row
                .removeClass('lsw-ok')
                .addClass('lsw-off')
                .html('🛑 Розклад вимкнено');
        }
    }

    // ====================================================================
    // Перевірити підключення до API
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
                    setConnectionStatus('success', '✅ ' + res.message);
                } else {
                    setConnectionStatus('error', '❌ ' + res.message);
                }
            })
            .fail(function () {
                setConnectionStatus('error', '❌ Не вдалося зв\'язатися з сервером');
            })
            .always(function () {
                $btn.prop('disabled', false).html('🔍 Перевірити підключення');
            });
    });

    // ====================================================================
    // Синхронізувати зараз
    // ====================================================================
    // Синхронізувати зараз & Live Polling
    // ====================================================================
    let pollTimer = null;

    function startStatusPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
        }

        const $btn = $('#lsw-sync-now');
        const $wrap = $('#lsw-progress-wrap');
        const $result = $('#lsw-sync-result');

        $btn.prop('disabled', true).html('⏳ ' + lsw_ajax.strings.syncing);
        $wrap.show();

        pollTimer = setInterval(function () {
            $.post(lsw_ajax.ajax_url, {
                action: 'lsw_sync_status',
                nonce:  lsw_ajax.nonce,
            })
                .done(function (res) {
                    if (!res.success || !res.data) {
                        return;
                    }

                    const info = res.data;
                    const pct = Math.min(100, Math.max(0, info.percent || 0));

                    if (info.status === 'running') {
                        setProgress(pct, info.message || ('Синхронізація товарів: ' + pct + '%'));
                    } else if (info.status === 'completed') {
                        clearInterval(pollTimer);
                        pollTimer = null;
                        setProgress(100, 'Готово!');

                        setTimeout(function () {
                            $wrap.hide();
                            showResult($result, true, '🎉 ' + (info.message || 'Синхронізацію успішно завершено!'));
                            $btn.prop('disabled', false).html('🚀 Синхронізувати зараз');

                            // Оновити блок останньої синхронізації
                            const $lastSync = $('.lsw-last-sync span');
                            if ($lastSync.length) {
                                $lastSync
                                    .removeClass('lsw-error')
                                    .addClass('lsw-ok')
                                    .text(new Date().toLocaleTimeString() + ' — ' + (info.message || 'Оновлено'));
                            }
                        }, 600);
                    } else if (info.status === 'error') {
                        clearInterval(pollTimer);
                        pollTimer = null;
                        $wrap.hide();
                        showResult($result, false, '❌ ' + (info.message || 'Помилка синхронізації'));
                        $btn.prop('disabled', false).html('🚀 Синхронізувати зараз');
                    }
                })
                .fail(function () {
                    // Мережевий збій при опитуванні — пробуємо далі
                });
        }, 2000);
    }

    // Перевіряємо при завантаженні сторінки, чи не триває синхронізація прямо зараз
    if ($('#lsw-sync-now').length) {
        $.post(lsw_ajax.ajax_url, {
            action: 'lsw_sync_status',
            nonce:  lsw_ajax.nonce,
        }).done(function (res) {
            if (res.success && res.data && res.data.status === 'running') {
                startStatusPolling();
            }
        });
    }

    $('#lsw-sync-now').on('click', function () {
        if (!confirm(lsw_ajax.strings.confirm_sync)) {
            return;
        }

        const $btn = $(this);
        const $wrap = $('#lsw-progress-wrap');
        const $result = $('#lsw-sync-result');

        $btn.prop('disabled', true).html('⏳ ' + lsw_ajax.strings.syncing);
        $result.hide();
        $wrap.show();
        setProgress(5, 'Ініціалізація синхронізації...');

        $.post(lsw_ajax.ajax_url, {
            action: 'lsw_sync_now',
            nonce:  lsw_ajax.nonce,
        })
            .done(function (res) {
                if (!res.success) {
                    $wrap.hide();
                    showResult($result, false, '❌ ' + (res.data ? res.data.message : 'Невідома помилка'));
                    $btn.prop('disabled', false).html('🚀 Синхронізувати зараз');
                    return;
                }

                // Перевіряємо, чи запущено асинхронно
                const data = res.data && res.data.data ? res.data.data : {};
                if (data.async) {
                    setProgress(10, 'Синхронізацію запущено у фоні. Відстеження прогресу...');
                    startStatusPolling();
                } else {
                    setProgress(100, 'Готово!');
                    setTimeout(function () {
                        $wrap.hide();
                        showResult($result, true, '🎉 ' + (res.data ? res.data.message : 'Успішно!'));
                        $btn.prop('disabled', false).html('🚀 Синхронізувати зараз');
                    }, 500);
                }
            })
            .fail(function (xhr) {
                $wrap.hide();
                const errMsg = xhr.responseJSON && xhr.responseJSON.message ? xhr.responseJSON.message : 'Помилка з\'єднання';
                showResult($result, false, '❌ ' + errMsg);
                $btn.prop('disabled', false).html('🚀 Синхронізувати зараз');
            });
    });

})(jQuery);
