import type { Dialog, Page } from '@playwright/test';

export type BeforeUnloadEvidenceSummary = {
  beforeUnloadDialogCount: number;
  otherDialogCount: number;
  automatedDisposition: 'accept' | 'dismiss';
};

export class BeforeUnloadEvidence {
  private beforeUnloadDialogCount = 0;
  private otherDialogCount = 0;

  private readonly onDialog = async (dialog: Dialog): Promise<void> => {
    if (dialog.type() === 'beforeunload') {
      this.beforeUnloadDialogCount += 1;
    } else {
      this.otherDialogCount += 1;
    }

    if (this.disposition === 'accept') {
      await dialog.accept();
    } else {
      await dialog.dismiss();
    }
  };

  constructor(
    private readonly page: Page,
    private readonly disposition: 'accept' | 'dismiss' = 'accept',
  ) {}

  observe(): void {
    this.page.on('dialog', this.onDialog);
  }

  summary(): BeforeUnloadEvidenceSummary {
    return {
      beforeUnloadDialogCount: this.beforeUnloadDialogCount,
      otherDialogCount: this.otherDialogCount,
      automatedDisposition: this.disposition,
    };
  }

  stop(): BeforeUnloadEvidenceSummary {
    this.page.off('dialog', this.onDialog);
    return this.summary();
  }
}
