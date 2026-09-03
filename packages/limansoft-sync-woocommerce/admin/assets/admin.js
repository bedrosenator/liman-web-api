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
        setProgress(15, 'Підключення до Limansoft API...');

        // Анімація прогресу (симуляція — реальний прогрес повернеться у відповіді)
        let progress = 15;
        const tick = setInterval(function () {
            if (progress < 85) {
                progress += Math.random() * 8;
                setProgress(Math.min(progress, 85), 'Синхронізуємо товари...');
            }
        }, 800);

        $.post(lsw_ajax.ajax_url, {
            action: 'lsw_sync_now',
            nonce:  lsw_ajax.nonce,
        })
            .done(function (res) {
                clearInterval(tick);
                setProgress(100, 'Готово!');

                setTimeout(function () {
                    $wrap.hide();
                    if (res.success) {
                        showResult($result, true, '🎉 ' + res.data.message);
                    } else {
                        showResult($result, false, '❌ ' + (res.data ? res.data.message : 'Невідома помилка'));
                    }
                    $btn.prop('disabled', false).html('🚀 Синхронізувати зараз');
                }, 500);
            })
            .fail(function (xhr) {
                clearInterval(tick);
                $wrap.hide();
                const errMsg = xhr.responseJSON && xhr.responseJSON.message ? xhr.responseJSON.message : 'Помилка з\'єднання';
                showResult($result, false, '❌ ' + errMsg);
                $btn.prop('disabled', false).html('🚀 Синхронізувати зараз');
            });
    });

})(jQuery);
