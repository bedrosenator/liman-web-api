<?php
/**
 * Группировщик и парсер товарных позиций / каталога
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class LSW_Product_Grouper {

    private static $known_brands = [
        'ElfBar', 'Elf Liq', 'Elf', 'Vaporesso', 'Cuba', 'Lucky', 'Chaser', 
        'Marlboro', 'Parliament', 'HEETS', 'NEO', 'VELO', 'Swipe', 'Cocoloco',
        'Bond', 'L&M', 'Winston', 'Rothmans', 'Kent', 'Sobranie', 'Philip Morris',
        'Aroma King', 'Zeus', 'Rabbit', 'Baron', 'IN Bottle', 'Voopoo', 'Smok',
        'Lost Mary', 'Al Fakher', 'Serbetli', 'Fumari', 'Musthave', 'Darkside'
    ];

    /**
     * Group raw items from database into structured Variable or Simple product arrays.
     *
     * @param array $raw_items
     * @return array
     */
    public function group_items( array $raw_items ): array {
        $groups = [];

        foreach ( $raw_items as $item ) {
            $parsed = $this->parse_item( $item );
            $group_key = $parsed['base_key'];

            if ( ! isset( $groups[ $group_key ] ) ) {
                $groups[ $group_key ] = [
                    'base_name'     => $parsed['base_name'],
                    'category_name' => $item['category_name'] ?? '',
                    'category_code' => $item['category_code'] ?? '',
                    'brand'         => $parsed['brand'],
                    'volume'        => $parsed['volume'],
                    'strength'      => $parsed['strength'],
                    'puffs'         => $parsed['puffs'],
                    'items'         => []
                ];
            }

            $groups[ $group_key ]['items'][] = array_merge( $item, [
                'attributes' => $parsed['attributes']
            ] );
        }

        // Determine if each group should be Variable or Simple
        $result = [];
        foreach ( $groups as $key => $group ) {
            $count = count( $group['items'] );
            $group['is_variable'] = ( $count > 1 );
            $result[ $key ] = $group;
        }

        return $result;
    }

    /**
     * Parse single item name into brand, base_name, volume, strength, color, flavor.
     *
     * @param array $item
     * @return array
     */
    public function parse_item( array $item ): array {
        $name = trim( (string) ( $item['product_name'] ?? '' ) );

        // Extract Brand
        $brand = '';
        foreach ( self::$known_brands as $b ) {
            if ( preg_match( '/\b' . preg_quote( $b, '/' ) . '\b/ui', $name ) ) {
                $brand = $b;
                break;
            }
        }

        // Extract Volume (e.g., 30ml, 15ml, 250g)
        $volume = '';
        if ( preg_match( '/(\d+\s*(?:мл|ml|г|g))\b/ui', $name, $matches ) ) {
            $volume = trim( $matches[1] );
        }

        // Extract Strength (e.g., 50mg, 43мг, 20мг)
        $strength = '';
        if ( preg_match( '/(\d+\s*(?:мг|mg))\b/ui', $name, $matches ) ) {
            $strength = trim( $matches[1] );
        }

        // Extract Puffs (e.g., 23000, 30000)
        $puffs = '';
        if ( preg_match( '/(\d{4,5})\b/u', $name, $matches ) ) {
            $puffs = trim( $matches[1] );
        }

        // Extract Flavor / Variation Name
        $clean_name = $name;
        // Remove prefix noise like (105001), Жидкость, Электронки, etc.
        $clean_name = preg_replace( '/^\(\d+\)\s*/', '', $clean_name );
        $clean_name = preg_replace( '/^(?:Жидкость|Электронки|Электронка|Вейп устройство|Никотиновая подушка|Табак)\s+/ui', '', $clean_name );

        $flavor_variation = $clean_name;
        if ( $volume ) {
            $flavor_variation = str_ireplace( $volume, '', $flavor_variation );
        }
        if ( $strength ) {
            $flavor_variation = str_ireplace( $strength, '', $flavor_variation );
        }
        if ( $puffs ) {
            $flavor_variation = str_ireplace( $puffs, '', $flavor_variation );
        }
        $flavor_variation = trim( (string) preg_replace( '/\s+/', ' ', $flavor_variation ) );

        // Determine Base Product Name for Grouping
        $base_parts = [];
        if ( $brand ) {
            $base_parts[] = $brand;
        } else {
            // First 2 words if no brand found
            $words = explode( ' ', $clean_name );
            $base_parts[] = implode( ' ', array_slice( $words, 0, 2 ) );
        }

        if ( $volume ) {
            $base_parts[] = $volume;
        }
        if ( $strength ) {
            $base_parts[] = $strength;
        }
        if ( $puffs ) {
            $base_parts[] = $puffs;
        }

        $base_name = implode( ' ', $base_parts );
        if ( empty( $base_name ) ) {
            $base_name = $clean_name;
        }

        $base_key = sanitize_title( $base_name );

        return [
            'base_key'   => $base_key,
            'base_name'  => $base_name,
            'brand'      => $brand,
            'volume'     => $volume,
            'strength'   => $strength,
            'puffs'      => $puffs,
            'attributes' => [
                'flavor'   => $flavor_variation,
                'volume'   => $volume,
                'strength' => $strength,
                'brand'    => $brand,
                'puffs'    => $puffs,
            ]
        ];
    }
}
