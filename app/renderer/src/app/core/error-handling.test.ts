import { Component, NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ClarityOkrError, ErrorCodes } from '@clarityokr/contracts';
import { ErrorBoundaryService } from './error-boundary.service';
import { ErrorBoundaryComponent } from './error-boundary.component';
import { GlobalErrorHandler } from './error-handler';
import { Logger } from './services/logger.service';

@Component({
  standalone: true,
  imports: [ErrorBoundaryComponent],
  template: ` <app-error-boundary [fallbackTemplate]="fallback"
      ><span>Product content</span></app-error-boundary
    >
    <ng-template #fallback let-error let-recover="recover">
      <p>{{ error.message }}</p>
      <button (click)="recover()">Recover custom template</button>
    </ng-template>`,
})
class HostComponent {}

describe('Actual renderer error routing and fallback interactions', () => {
  let service: ErrorBoundaryService;
  let logger: Logger;
  let send: jest.Mock;
  beforeEach(() => {
    jest.useFakeTimers();
    logger = new Logger();
    service = new ErrorBoundaryService(logger, new NgZone({ enableLongStackTrace: false }));
    send = jest.fn();
    Object.defineProperty(window, 'clarifyOkr', { configurable: true, value: { send } });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    document.getElementById('global-error-container')?.remove();
    document.getElementById('global-error-styles')?.remove();
    Reflect.deleteProperty(window, 'clarifyOkr');
  });

  it('returns successful guarded values and suppresses duplicate reports by operation', async () => {
    const scoped = service.forComponent('Draft');
    expect(await scoped.guard(async () => 5, 'request')).toBe(5);
    expect(scoped.guardSync(() => 6, 'parse')).toBe(6);
    const error = new ClarityOkrError('offline', { code: ErrorCodes.LLM_ERROR });
    expect(
      await scoped.guard(async () => {
        throw error;
      }, 'request'),
    ).toBeUndefined();
    await scoped.handle(error, 'request');
    expect(send).toHaveBeenCalledTimes(1);
    await scoped.handle(error, 'other operation', { session: 'synthetic' });
    expect(send).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(5000);
    await scoped.handle(error, 'request');
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenLastCalledWith(
      'clarityokr:error:report',
      expect.objectContaining({
        error,
        context: { component: 'Draft', operation: 'request', metadata: undefined },
      }),
    );
  });

  it('contains unavailable or failing IPC while normalizing native and critical errors', async () => {
    send.mockImplementation(() => {
      throw new Error('bridge disconnected');
    });
    expect(
      service.guardSync(
        () => {
          throw new TypeError('bad JSON');
        },
        { operation: 'parse' },
      ),
    ).toBeUndefined();
    await Promise.resolve();
    const normalized = await service.handleError('plain', { operation: 'plain' });
    expect(normalized.message).toBe('plain');
    Reflect.deleteProperty(window, 'clarifyOkr');
    const critical = new ClarityOkrError('disk', { code: ErrorCodes.DATABASE_ERROR });
    expect(await service.handleError(critical, { operation: 'write' })).toBe(critical);
  });

  it('renders a fallback and clears its error when a custom-template retry is clicked', async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: ErrorBoundaryService, useValue: service }],
    }).compileComponents();
    const host = TestBed.createComponent(HostComponent);
    host.detectChanges();
    const boundary = host.debugElement.children.find(
      (element) => element.componentInstance instanceof ErrorBoundaryComponent,
    )?.componentInstance as ErrorBoundaryComponent;
    expect(host.nativeElement.textContent).toContain('Product content');
    boundary.handleError(new Error('Synthetic failure'));
    host.detectChanges();
    expect(host.nativeElement.textContent).toContain('Synthetic failure');
    host.nativeElement.querySelector('button').click();
    host.detectChanges();
    expect(boundary.hasError).toBe(false);
    expect(host.nativeElement.textContent).toContain('Product content');
    boundary.handleError(new ClarityOkrError('Known'));
    boundary.recover();
    boundary.handleError('Plain');
    boundary.recover();
    expect(boundary.error).toBeNull();
  });

  it('shows plain-text global errors without duplicate containers and removes notifications', () => {
    const handler = new GlobalErrorHandler();
    handler.handleError(new Error('<script>synthetic</script>'));
    handler.handleError(new Error('second'));
    const container = document.getElementById('global-error-container');
    expect(container?.children).toHaveLength(2);
    expect(container?.querySelector('script')).toBeNull();
    expect(send).toHaveBeenCalledTimes(2);
    send.mockImplementation(() => {
      throw new Error('disconnected');
    });
    handler.handleError(new Error('third'));
    Reflect.deleteProperty(window, 'clarifyOkr');
    handler.handleError(new Error(''));
    expect(container?.textContent).toContain('Unknown error');
    jest.advanceTimersByTime(5300);
    expect(container?.children).toHaveLength(0);
  });
});
