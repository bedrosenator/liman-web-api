import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BackupsTab } from '@/components/portal/BackupsTab';
import { LanguageProvider } from '@/context/LanguageContext';
import { backupApi } from '@/api/client';

vi.mock('@/api/client', () => ({
  backupApi: {
    list: vi.fn(),
    create: vi.fn(),
    restore: vi.fn(),
    download: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockBackups = [
  {
    filename: 'columb_2026-09-18_fast.sql.gz',
    filepath: '/backups/columb_2026-09-18_fast.sql.gz',
    sizeBytes: 1048576, // 1 MB
    createdAt: '2026-09-18T10:00:00.000Z',
    mode: 'fast' as const,
    tables: ['tovar', 'ost'],
    sha256: 'abc123sha256',
  },
  {
    filename: 'columb_2026-09-18_full.sql.gz',
    filepath: '/backups/columb_2026-09-18_full.sql.gz',
    sizeBytes: 5242880, // 5 MB
    createdAt: '2026-09-18T09:00:00.000Z',
    mode: 'full' as const,
    tables: ['tovar', 'ost', 'users', 'logs'],
    sha256: 'def456sha256',
  },
];

function renderBackupsTab() {
  return render(
    <LanguageProvider>
      <BackupsTab tenantId="columb" />
    </LanguageProvider>,
  );
}

describe('BackupsTab component', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('liman_lang', 'ru');
    vi.clearAllMocks();
    vi.mocked(backupApi.list).mockResolvedValue({
      data: { backups: mockBackups },
    } as any);
  });

  it('рендерит заголовок, кнопки действий и список бэкапов', async () => {
    renderBackupsTab();

    expect(screen.getByText('Резервные копии MariaDB')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('columb_2026-09-18_fast.sql.gz')).toBeInTheDocument();
      expect(screen.getByText('columb_2026-09-18_full.sql.gz')).toBeInTheDocument();
    });

    expect(screen.getByText('1 MB')).toBeInTheDocument();
    expect(screen.getByText('5 MB')).toBeInTheDocument();
    expect(screen.getAllByText(/Быстрый \(без фото\)/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Полный \(с фотографиями\)/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('OK').length).toBe(2);
  });

  it('создает быстрый бэкап при клике на соответствующую кнопку', async () => {
    vi.mocked(backupApi.create).mockResolvedValue({
      data: { filename: 'columb_new_fast.sql.gz' },
    } as any);

    renderBackupsTab();

    const fastBtn = screen.getByRole('button', { name: /Быстрый/i });
    fireEvent.click(fastBtn);

    await waitFor(() => {
      expect(backupApi.create).toHaveBeenCalledWith('columb', 'fast');
      expect(screen.getByText(/Резервная копия успешно создана/i)).toBeInTheDocument();
    });
  });

  it('открывает модалку подтверждения отката и выполняет восстановление', async () => {
    vi.mocked(backupApi.restore).mockResolvedValue({
      data: { success: true },
    } as any);

    renderBackupsTab();

    await waitFor(() => {
      expect(screen.getByText('columb_2026-09-18_fast.sql.gz')).toBeInTheDocument();
    });

    const restoreButtons = screen.getAllByTitle('Восстановить (Откат)');
    fireEvent.click(restoreButtons[0]);

    await waitFor(() => {
      expect(document.getElementById('restore-confirm-modal')).toBeInTheDocument();
      expect(screen.getByText('Подтверждение отката БД')).toBeInTheDocument();
    });

    const confirmBtn = document.getElementById('btn-confirm-restore-backup')!;
    expect(confirmBtn).toBeInTheDocument();
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(backupApi.restore).toHaveBeenCalledWith('columb', 'columb_2026-09-18_fast.sql.gz');
      expect(screen.getByText(/База данных успешно восстановлена/i)).toBeInTheDocument();
    });
  });

  it('открывает модалку удаления и вызывает backupApi.delete', async () => {
    vi.mocked(backupApi.delete).mockResolvedValue({
      data: { success: true },
    } as any);

    renderBackupsTab();

    await waitFor(() => {
      expect(screen.getByText('columb_2026-09-18_fast.sql.gz')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByTitle('Удалить');
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(document.getElementById('delete-confirm-modal')).toBeInTheDocument();
      expect(screen.getByText('Удалить архив?')).toBeInTheDocument();
    });

    const confirmDeleteBtn = document.getElementById('btn-confirm-delete-backup')!;
    expect(confirmDeleteBtn).toBeInTheDocument();
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(backupApi.delete).toHaveBeenCalledWith('columb', 'columb_2026-09-18_fast.sql.gz');
    });
  });
});
