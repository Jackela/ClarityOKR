import { ErrorHandler, Injectable } from '@angular/core';

interface ErrorReport {
  message: string;
  stack?: string;
  timestamp: string;
  url?: string;
}

/**
 * Global error handler for Angular application
 *
 * Captures unhandled exceptions and provides:
 * 1. Console logging with stack traces
 * 2. Error reporting to main process via IPC
 * 3. User-friendly error display integration
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: Error): void {
    const report: ErrorReport = {
      message: error.message || 'Unknown error',
      stack: error.stack,
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    };

    // Log error to console
    console.error('Global error caught:', error);
    console.error('Error report:', report);

    // Send error to main process if available
    this.reportToMainProcess(report);

    // Show user-friendly error notification
    this.showErrorNotification(report.message);
  }

  private reportToMainProcess(report: ErrorReport): void {
    try {
      const bridge = (
        window as { clarifyOkr?: { send?: (channel: string, payload: unknown) => void } }
      ).clarifyOkr;
      if (bridge?.send) {
        bridge.send('clarityokr:error:report', report);
      }
    } catch (e) {
      // Silently fail if IPC is not available
      console.warn('Failed to send error report to main process:', e);
    }
  }

  private showErrorNotification(message: string): void {
    // Check if a notification container already exists
    let container = document.getElementById('global-error-container');

    if (!container) {
      // Create notification container
      container = document.createElement('div');
      container.id = 'global-error-container';
      container.style.cssText = `
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 9999;
        max-width: 400px;
      `;
      document.body.appendChild(container);
    }

    // Create error notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
      background: #dc3545;
      color: white;
      padding: 12px 16px;
      margin-bottom: 8px;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = `发生错误: ${message}`;

    // Add animation styles if not already present
    if (!document.getElementById('global-error-styles')) {
      const style = document.createElement('style');
      style.id = 'global-error-styles';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    container.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      notification.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  }
}
