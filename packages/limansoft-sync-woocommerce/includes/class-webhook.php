<?php
/**
 * Вебхук: списание остатков в Limansoft при оформлении заказа в WooCommerce
 */
class LSW_Webhook {

    /** @var LSW_Webhook|null */
    private static $instance = null;

    /** @var LSW_Settings */
    private $settings;

    private function __construct() {
        $this->settings = LSW_Settings::get_instance();

        // Хук срабатывает при завершении оплаты
        add_action( 'woocommerce_payment_complete', [ $this, 'handle_order' ], 10, 1 );

        // Также отслеживаем смену статуса на processing/completed
        add_action( 'woocommerce_order_status_changed', [ $this, 'handle_status_change' ], 10, 3 );
    }

    public static function get_instance(): self {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Обработка завершённой оплаты (прямое событие)
     *
     * @param int $order_id
     */
    public function handle_order( int $order_id ): void {
        $this->notify_limansoft( $order_id );
    }

    /**
     * Обработка смены статуса заказа
     *
     * @param int    $order_id
     * @param string $from_status
     * @param string $to_status
     */
    public function handle_status_change( int $order_id, string $from_status, string $to_status ): void {
        // Уведомляем Limansoft только при переходе в "processing" или "completed"
        $notify_statuses = [ 'processing', 'completed' ];

        if ( in_array( $to_status, $notify_statuses, true ) && ! in_array( $from_status, $notify_statuses, true ) ) {
            // Защита от двойного вызова (если payment_complete уже отработал)
            $notified = get_post_meta( $order_id, '_limansoft_notified', true );
            if ( ! $notified ) {
                $this->notify_limansoft( $order_id );
            }
        }
    }

    /**
     * Отправить данные заказа в liman-web-api
     *
     * @param int $order_id
     */
    private function notify_limansoft( int $order_id ): void {
        if ( ! $this->settings->is_configured() ) {
            return;
        }

        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            error_log( "[Limansoft Sync] ⚠️ Заказ #{$order_id} не найден." );
            return;
        }

        $line_items = [];
        foreach ( $order->get_items() as $item_id => $item ) {
            /** @var WC_Order_Item_Product $item */
            $product = $item->get_product();
            $sku     = $product ? $product->get_sku() : '';

            // SKU в WooCommerce = tcod в Limansoft
            if ( ! empty( $sku ) ) {
                $line_items[] = [
                    'sku'        => $sku,
                    'product_id' => $item->get_product_id(),
                    'name'       => $item->get_name(),
                    'quantity'   => $item->get_quantity(),
                    'price'      => (string) $item->get_total(),
                ];
            }
        }

        if ( empty( $line_items ) ) {
            error_log( "[Limansoft Sync] ⚠️ Заказ #{$order_id}: нет позиций с SKU." );
            return;
        }

        $client  = LSW_Sync_Client::get_instance();
        $success = $client->notify_order( $order_id, $line_items );

        if ( $success ) {
            // Отметить заказ как обработанный
            update_post_meta( $order_id, '_limansoft_notified', '1' );
            update_post_meta( $order_id, '_limansoft_notified_at', current_time( 'mysql' ) );

            // Добавить заметку в заказ WooCommerce
            $order->add_order_note(
                sprintf(
                    __( 'Limansoft: остатки успешно списаны (%d позиций)', 'limansoft-sync' ),
                    count( $line_items )
                )
            );

            error_log( "[Limansoft Sync] ✅ Заказ #{$order_id}: остатки списаны в Limansoft." );
        } else {
            $order->add_order_note(
                __( 'Limansoft: ❌ Ошибка при списании остатков. Проверьте логи.', 'limansoft-sync' )
            );
            error_log( "[Limansoft Sync] ❌ Заказ #{$order_id}: ошибка уведомления Limansoft." );
        }
    }
}
