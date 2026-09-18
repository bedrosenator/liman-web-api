import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { HoroshopExportModal } from '@/components/portal/HoroshopExportModal';
import { LanguageProvider } from '@/context/LanguageContext';
import { horoshopApi, syncApi } from '@/api/client';

vi.mock('@/api/client', () => ({
  horoshopApi: {
    exportCatalog: vi.fn(),
    getExportCategories: vi.fn().mockResolvedValue({
      data: { success: true, categories: [] },
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
      <HoroshopExportModal {...props} />
    </LanguageProvider>,
  );
}

describe('HoroshopExportModal (TASK-26)', () => {
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

  it('рендерит режимы выгрузки и чекбоксы полей', () => {
    renderModal(defaultProps);

    expect(screen.getByText('Прямой экспорт каталога в Хорошоп')).toBeInTheDocument();
    expect(screen.getByText('Все товары')).toBeInTheDocument();
    expect(screen.getByText('Только новинки')).toBeInTheDocument();
    expect(screen.getByText('Обновить сущ.')).toBeInTheDocument();
    expect(screen.getByText('Актуальные цены')).toBeInTheDocument();
    expect(screen.getByText('Остатки склада')).toBeInTheDocument();

    const startBtn = screen.getByRole('button', { name: /Начать экспорт/i });
    expect(startBtn).toBeInTheDocument();
  });

  it('запускает экспорт каталога через BullMQ и отображает статистику по завершению', async () => {
    vi.mocked(horoshopApi.exportCatalog).mockResolvedValue({
      data: { success: true, jobId: 'job-export-123' },
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
            totalFetched: 120,
            totalExported: 120,
            created: 40,
            updated: 80,
            skipped: 0,
            errors: 0,
            durationMs: 1500,
          },
        },
      } as any);

    renderModal(defaultProps);

    const startBtn = screen.getByRole('button', { name: /Начать экспорт/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(horoshopApi.exportCatalog).toHaveBeenCalledWith(
        'columb',
        expect.objectContaining({
          mode: 'full_overwrite',
          exportPrices: true,
          exportStock: true,
          exportDescriptions: true,
          exportImages: true,
          exportCategories: true,
        }),
      );
    });

    await waitFor(
      () => {
        expect(screen.getByText('Каталог успешно экспортирован!')).toBeInTheDocument();
      },
      { timeout: 3500 },
    );

    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(defaultProps.onExportFinished).toHaveBeenCalled();
  });
});
