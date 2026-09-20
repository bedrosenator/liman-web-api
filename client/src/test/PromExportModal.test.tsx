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
      screen.getByText('Прямой экспорт товаров из Limansoft в Prom.ua'),
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
      name: /Запустить экспорт в Prom/i,
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
      name: /Запустить экспорт в Prom/i,
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
      },
      { timeout: 4000 },
    );
  });
});
