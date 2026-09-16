import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { HoroshopImportModal } from '@/components/portal/HoroshopImportModal';
import { LanguageProvider } from '@/context/LanguageContext';
import { horoshopApi, syncApi } from '@/api/client';

vi.mock('@/api/client', () => ({
  horoshopApi: {
    importCatalog: vi.fn(),
  },
  syncApi: {
    getJobStatus: vi.fn(),
  },
}));

function renderModal(props: {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onImportFinished?: () => void;
}) {
  return render(
    <LanguageProvider>
      <HoroshopImportModal {...props} />
    </LanguageProvider>,
  );
}

describe('HoroshopImportModal (TASK-22)', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    tenantId: 'columb',
    onImportFinished: vi.fn(),
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

  it('рендерит режимы импорта и по умолчанию активен «Только новинки»', () => {
    renderModal(defaultProps);

    expect(screen.getByText('Импорт товаров из Хорошоп в Limansoft')).toBeInTheDocument();
    expect(screen.getByText('Только новые товары')).toBeInTheDocument();
    expect(screen.getByText('Полное обновление (Перезапись)')).toBeInTheDocument();

    const startBtn = screen.getByRole('button', { name: /Начать импорт каталога/i });
    expect(startBtn).not.toBeDisabled();
  });

  it('блокирует запуск при выборе режима «Полная перезапись» до установки чекбокса согласия с рисками', async () => {
    renderModal(defaultProps);

    const overwriteOption = screen.getByText('Полное обновление (Перезапись)');
    fireEvent.click(overwriteOption);

    const startBtn = screen.getByRole('button', { name: /Начать импорт каталога/i });
    expect(startBtn).toBeDisabled();

    // Отмечаем чекбокс подтверждения рисков
    const riskCheckbox = screen.getByLabelText(/Я осознаю риск замены цен и остатков в учетной базе/i);
    fireEvent.click(riskCheckbox);

    expect(startBtn).not.toBeDisabled();
  });

  it('запускает импорт через BullMQ и отслеживает прогресс до завершения', async () => {
    vi.mocked(horoshopApi.importCatalog).mockResolvedValue({
      data: { success: true, jobId: 'job-import-123' },
    } as any);

    vi.mocked(syncApi.getJobStatus)
      .mockResolvedValueOnce({
        data: { state: 'active', progress: 45 },
      } as any)
      .mockResolvedValueOnce({
        data: {
          state: 'completed',
          progress: 100,
          result: {
            totalFetched: 150,
            created: 25,
            updated: 0,
            skipped: 125,
            errors: 0,
            backupId: 'backup-columb-test',
          },
        },
      } as any);

    renderModal(defaultProps);

    const startBtn = screen.getByRole('button', { name: /Начать импорт каталога/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(horoshopApi.importCatalog).toHaveBeenCalledWith('columb', {
        mode: 'only_new',
        updatePrices: true,
        updateStock: true,
        updateImages: true,
        createBackup: true,
      });
    });

    // Ожидаем завершения задачи и отображения отчета со статистикой
    await waitFor(
      () => {
        expect(screen.getByText('Импорт каталога успешно завершен!')).toBeInTheDocument();
        expect(screen.getByText('25')).toBeInTheDocument(); // created
      },
      { timeout: 4000 },
    );

    expect(defaultProps.onImportFinished).toHaveBeenCalled();
  });
});
