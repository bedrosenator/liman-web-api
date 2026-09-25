import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PromExportModal } from '@/components/portal/PromExportModal';
import { LanguageProvider } from '@/context/LanguageContext';
import { promApi, syncApi } from '@/api/client';

vi.mock('@/api/client', () => ({
  promApi: {
    exportCatalog: vi.fn(),
    getExportCategories: vi.fn().mockResolvedValue({
      data: {
        success: true,
        categories: [
          { id: 101, name: 'Електроніка', parentId: null },
          { id: 102, name: 'Смартфони', parentId: 101 },
        ],
      },
    }),
  },
  syncApi: {
    getJobStatus: vi.fn(),
  },
}));

function renderModal(props: {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onExportFinished?: () => void;
}) {
  return render(
    <LanguageProvider>
      <PromExportModal {...props} />
    </LanguageProvider>,
  );
}

describe('PromExportModal (TASK-35)', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    tenantId: 'columb',
    onExportFinished: vi.fn(),
  };

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('liman_lang', 'ru');
    vi.clearAllMocks();
  });

  it('не рендерится, если isOpen = false', () => {
    const { container } = renderModal({ ...defaultProps, isOpen: false });
    expect(container.firstChild).toBeNull();
  });

  it('рендерит режимы выгрузки, поля и категории Prom.ua', async () => {
    renderModal(defaultProps);

    expect(
      screen.getByText('Прямой экспорт каталога в Prom.ua'),
    ).toBeInTheDocument();
    expect(screen.getByText('Все товары')).toBeInTheDocument();
    expect(screen.getByText('Только новинки')).toBeInTheDocument();
    expect(screen.getByText('Актуальные цены')).toBeInTheDocument();
    expect(screen.getByText('Остатки склада')).toBeInTheDocument();

    await waitFor(() => {
      expect(promApi.getExportCategories).toHaveBeenCalledWith('columb');
      expect(screen.getByText(/Електроніка/i)).toBeInTheDocument();
    });

    const startBtn = screen.getByRole('button', {
      name: /Начать экспорт/i,
    });
    expect(startBtn).toBeInTheDocument();
  });

  it('запускает экспорт каталога через BullMQ и отображает результат', async () => {
    vi.mocked(promApi.exportCatalog).mockResolvedValue({
      data: { success: true, jobId: 'job-prom-exp-123' },
    } as any);

    vi.mocked(syncApi.getJobStatus)
      .mockResolvedValueOnce({
        data: { state: 'active', progress: 50 },
      } as any)
      .mockResolvedValueOnce({
        data: {
          state: 'completed',
          progress: 100,
          result: {
            totalFetched: 50,
            totalExported: 50,
            created: 20,
            updated: 30,
            skipped: 0,
            errors: 0,
            durationMs: 800,
          },
        },
      } as any);

    renderModal(defaultProps);

    const startBtn = screen.getByRole('button', {
      name: /Начать экспорт/i,
    });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(promApi.exportCatalog).toHaveBeenCalledWith(
        'columb',
        expect.objectContaining({
          mode: 'full_overwrite',
          exportPrices: true,
          exportStock: true,
        }),
      );
    });

    await waitFor(
      () => {
        expect(syncApi.getJobStatus).toHaveBeenCalledWith(
          'export-prom-catalog',
          'job-prom-exp-123',
        );
        expect(
          screen.getByText('Каталог успешно экспортирован!'),
        ).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
  });

  it('отображает частичный экспорт и баннер с YML-фидом при наличии pendingFeedCount', async () => {
    vi.mocked(syncApi.getJobStatus).mockReset();
    vi.mocked(promApi.exportCatalog).mockResolvedValue({
      data: { success: true, jobId: 'job-prom-pending-123' },
    } as any);

    vi.mocked(syncApi.getJobStatus).mockResolvedValue({
      data: {
        state: 'completed',
        progress: 100,
        result: {
          totalFetched: 3268,
          totalExported: 54,
          created: 0,
          updated: 54,
          skipped: 0,
          errors: 0,
          pendingFeedCount: 3214,
          durationMs: 73900,
          message: 'Обновлено: 54. Ожидают импорта через YML-фид: 3214.',
        },
      },
    } as any);

    renderModal({
      ...defaultProps,
      feedUrl: 'https://liman.terrace.pp.ua/api/v1/prom/columb/feed.xml',
    } as any);

    const startBtn = screen.getByRole('button', {
      name: /Начать экспорт/i,
    });
    fireEvent.click(startBtn);

    await waitFor(
      () => {
        expect(screen.getByText('Каталог частично экспортирован')).toBeInTheDocument();
        expect(screen.getByText('Ожидают фид')).toBeInTheDocument();
        expect(screen.getByText('3214')).toBeInTheDocument();
        expect(screen.getByText('Новые товары создаются через импорт YML-фида')).toBeInTheDocument();
        expect(screen.getByText(/feed\.xml/)).toBeInTheDocument();
      },
      { timeout: 4000 },
    );
  });
});
