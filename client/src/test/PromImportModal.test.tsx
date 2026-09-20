import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PromImportModal } from '@/components/portal/PromImportModal';
import { LanguageProvider } from '@/context/LanguageContext';
import { promApi, syncApi } from '@/api/client';

vi.mock('@/api/client', () => ({
  promApi: {
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
      <PromImportModal {...props} />
    </LanguageProvider>,
  );
}

describe('PromImportModal (TASK-35)', () => {
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

  it('рендерит режимы импорта и блокирует кнопку перезаписи без согласия', () => {
    renderModal(defaultProps);

    expect(
      screen.getByText('Обратный импорт товаров из Prom.ua в Limansoft'),
    ).toBeInTheDocument();
    expect(screen.getByText('Только новые товары')).toBeInTheDocument();
    expect(
      screen.getByText('Полное обновление (Перезапись)'),
    ).toBeInTheDocument();

    const overwriteOption = screen.getByText('Полное обновление (Перезапись)');
    fireEvent.click(overwriteOption);

    const startBtn = screen.getByRole('button', {
      name: /Запустить импорт из Prom/i,
    });
    expect(startBtn).toBeDisabled();

    const riskCheckbox = screen.getByLabelText(
      /Я осознаю риск замены цен и остатков в учетной базе/i,
    );
    fireEvent.click(riskCheckbox);

    expect(startBtn).not.toBeDisabled();
  });

  it('запускает импорт через BullMQ и отображает результат', async () => {
    vi.mocked(promApi.importCatalog).mockResolvedValue({
      data: { success: true, jobId: 'job-prom-imp-456' },
    } as any);

    vi.mocked(syncApi.getJobStatus)
      .mockResolvedValueOnce({
        data: { state: 'active', progress: 40 },
      } as any)
      .mockResolvedValueOnce({
        data: {
          state: 'completed',
          progress: 100,
          result: {
            totalFetched: 30,
            created: 30,
            updated: 0,
            skipped: 0,
            errors: 0,
          },
        },
      } as any);

    renderModal(defaultProps);

    const startBtn = screen.getByRole('button', {
      name: /Запустить импорт из Prom/i,
    });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(promApi.importCatalog).toHaveBeenCalledWith(
        'columb',
        expect.objectContaining({
          mode: 'only_new',
          updatePrices: true,
          updateStock: true,
          updateImages: true,
          createBackup: true,
        }),
      );
    });

    await waitFor(
      () => {
        expect(syncApi.getJobStatus).toHaveBeenCalledWith(
          'import-prom-catalog',
          'job-prom-imp-456',
        );
        expect(
          screen.getByText('Импорт каталога успешно завершен!'),
        ).toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    expect(defaultProps.onImportFinished).toHaveBeenCalled();
  });
});
