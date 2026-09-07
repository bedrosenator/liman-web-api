import { Test, TestingModule } from '@nestjs/testing';
import { RozetkaFeedService } from './rozetka-feed.service';
import { LimanService } from '../liman/liman.service';
import { Tenant } from '../tenant/tenant.entity';
import type { Response } from 'express';

describe('RozetkaFeedService', () => {
  let service: RozetkaFeedService;
  let limanService: jest.Mocked<Partial<LimanService>>;

  const mockTenant: Tenant = {
    id: 'columb',
    name: 'Columb Shop',
    dbHost: '127.0.0.1',
    dbPort: 3306,
    dbName: 'columbDB',
    dbUser: 'root',
    dbPassword: 'password',
    apiKey: 'test-key',
    promApiKey: null,
    promExportEnabled: false,
    woocommerceUrl: null,
    woocommerceConsumerKey: null,
    woocommerceConsumerSecret: null,
    woocommerceSyncEnabled: false,
    woocommerceSyncIntervalMinutes: 30,
    rozetkaClientId: null,
    rozetkaClientSecret: null,
    rozetkaExportEnabled: true,
    horoshopDomain: null,
    horoshopLogin: null,
    horoshopPassword: null,
    horoshopExportEnabled: false,
    horoshopSyncIntervalMinutes: 15,
    priceColumn: 'cena2',
    stockColumn: 'skl_k',
    syncIntervalMinutes: 15,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    limanService = {
      getCategories: jest.fn().mockResolvedValue([
        { group: '10', name: 'Electronics', parent: null },
        { group: '101', name: 'Smartphones', parent: '10' },
      ]),
      getProducts: jest.fn().mockResolvedValue({
        items: [
          {
            tcod: 1001,
            name: 'Smartphone Pro & Max',
            price: 999.99,
            stock: 15,
            isAvailable: true,
            categoryGroup: '101',
            barcode: '482000000001',
            imageUrls: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
            description: '<p>Special description</p>',
          },
        ],
        total: 1,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RozetkaFeedService,
        { provide: LimanService, useValue: limanService },
      ],
    }).compile();

    service = module.get<RozetkaFeedService>(RozetkaFeedService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should stream valid Rozetka XML feed with header, categories and offers', async () => {
    const chunks: string[] = [];
    const mockRes = {
      setHeader: jest.fn(),
      write: jest.fn((chunk: string) => {
        chunks.push(chunk);
        return true;
      }),
      end: jest.fn(),
    } as unknown as Response;

    await service.streamFeed(mockTenant, 'http://localhost:3000', mockRes);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/xml; charset=utf-8');
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline; filename="rozetka_feed_columb.xml"',
    );

    const fullXml = chunks.join('');

    // XML declaration and YML catalog
    expect(fullXml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(fullXml).toContain('<!DOCTYPE yml_catalog SYSTEM "shops.dtd">');
    expect(fullXml).toContain('<yml_catalog date=');
    expect(fullXml).toContain('<name>Columb Shop</name>');
    expect(fullXml).toContain('<currency id="UAH" rate="1"/>');

    // Categories
    expect(fullXml).toContain('<category id="10">Electronics</category>');
    expect(fullXml).toContain('<category id="101" parentId="10">Smartphones</category>');

    // Offer
    expect(fullXml).toContain('<offer id="1001" available="true">');
    expect(fullXml).toContain('<name>Smartphone Pro &amp; Max</name>');
    expect(fullXml).toContain('<price>999.99</price>');
    expect(fullXml).toContain('<currencyId>UAH</currencyId>');
    expect(fullXml).toContain('<categoryId>101</categoryId>');
    expect(fullXml).toContain('<vendor>Columb Shop</vendor>');
    expect(fullXml).toContain('<stock_quantity>15</stock_quantity>');
    expect(fullXml).toContain('<vendorCode>482000000001</vendorCode>');
    expect(fullXml).toContain('<picture>https://example.com/img1.jpg</picture>');
    expect(fullXml).toContain('<picture>https://example.com/img2.jpg</picture>');
    expect(fullXml).toContain('<![CDATA[<p>Special description</p>]]>');
    expect(fullXml).toContain('<param name="Наявність">В наявності</param>');
    expect(fullXml).toContain('<param name="Кількість">15</param>');
    expect(fullXml).toContain('<param name="Штрихкод">482000000001</param>');

    expect(mockRes.end).toHaveBeenCalled();
  });
});
