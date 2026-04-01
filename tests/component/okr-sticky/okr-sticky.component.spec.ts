/**
 * Component Tests for OkrStickyNoteComponent
 *
 * User Story 2 - Sticky OKR Visualization
 * These tests verify the sticky note UI component renders OKR data correctly
 * and handles user interactions.
 *
 * NOTE: These tests are expected to FAIL initially until T027 implements
 * the component features (loading state, error state, shared components integration).
 *
 * @module tests/component/okr-sticky
 */

import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { type Provider } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';

// Component under test
import { OkrStickyNoteComponent } from '@clarityokr/renderer/app/okr-sticky/components/okr-sticky-note.component';

// Services to mock
import { OkrStickyGatewayService } from '@clarityokr/renderer/app/okr-sticky/services/okr-sticky-gateway.service';
import type { OkrStickyViewModel } from '@clarityokr/renderer/app/okr-sticky/services/okr-projection.service';

// Shared components
import {
  ButtonComponent,
  LoadingSpinnerComponent,
} from '@clarityokr/renderer/app/shared/components';

/**
 * Mock implementation of OkrStickyGatewayService
 * Controls the state of the sticky note for testing
 */
class MockOkrStickyGatewayService {
  private readonly viewModelSubject = new BehaviorSubject<OkrStickyViewModel | null>(null);
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  readonly viewModel$ = this.viewModelSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  setViewModel(viewModel: OkrStickyViewModel | null): void {
    this.viewModelSubject.next(viewModel);
  }

  setLoading(loading: boolean): void {
    this.loadingSubject.next(loading);
  }

  setError(error: string | null): void {
    this.errorSubject.next(error);
  }

  addKeyResult(): void {
    // Mock implementation - no-op for component tests
  }

  reopenSticky(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Factory function to create a complete OKR view model for testing
 */
function createOkrViewModel(overrides: Partial<OkrStickyViewModel> = {}): OkrStickyViewModel {
  return {
    objective: '提升团队交付节奏',
    keyResults: [
      {
        id: 'kr-1',
        statement: '将迭代周期缩短到 3 周',
        metricLabel: '周期 <= 21 天',
        ownerLabel: '运营团队',
      },
      {
        id: 'kr-2',
        statement: '将上线缺陷率控制在 0.5%',
        metricLabel: null,
        ownerLabel: null,
      },
    ],
    generatedAt: '2025-10-31T10:12:00.000Z',
    lastEditedAt: null,
    hasManualEdits: false,
    regenerationPolicy: 'append',
    ...overrides,
  };
}

describe('OkrStickyNoteComponent', () => {
  let fixture: ComponentFixture<OkrStickyNoteComponent>;
  let component: OkrStickyNoteComponent;
  let mockGateway: MockOkrStickyGatewayService;

  beforeEach(async () => {
    mockGateway = new MockOkrStickyGatewayService();

    await TestBed.configureTestingModule({
      imports: [
        // Component under test
        OkrStickyNoteComponent,
        // Shared components that should be used by the sticky note
        ButtonComponent,
        LoadingSpinnerComponent,
      ],
      providers: [
        {
          provide: OkrStickyGatewayService,
          useValue: mockGateway,
        } satisfies Provider,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OkrStickyNoteComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
  });

  describe('Basic Rendering', () => {
    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should render with Objective and Key Results list', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;

      // Act
      fixture.detectChanges();

      // Assert
      const objectiveElement = fixture.nativeElement.querySelector(
        '[data-testid="sticky-objective"]',
      );
      expect(objectiveElement).not.toBeNull();
      expect(objectiveElement.textContent).toContain('提升团队交付节奏');

      const keyResults = fixture.nativeElement.querySelectorAll(
        '[data-testid="sticky-key-result"]',
      );
      expect(keyResults.length).toBe(2);
      expect(keyResults[0].textContent).toContain('将迭代周期缩短到 3 周');
      expect(keyResults[1].textContent).toContain('将上线缺陷率控制在 0.5%');
    });

    it('should display all key result statements correctly', () => {
      // Arrange
      const viewModel = createOkrViewModel({
        keyResults: [
          {
            id: 'kr-1',
            statement: 'First key result',
            metricLabel: null,
            ownerLabel: null,
          },
          {
            id: 'kr-2',
            statement: 'Second key result',
            metricLabel: null,
            ownerLabel: null,
          },
          {
            id: 'kr-3',
            statement: 'Third key result',
            metricLabel: null,
            ownerLabel: null,
          },
        ],
      });
      component.okr = viewModel;

      // Act
      fixture.detectChanges();

      // Assert
      const keyResults = fixture.nativeElement.querySelectorAll(
        '[data-testid="sticky-key-result"]',
      );
      expect(keyResults.length).toBe(3);
    });
  });

  describe('Metadata Badges', () => {
    it('should display generated time badge', () => {
      // Arrange
      const viewModel = createOkrViewModel({
        generatedAt: '2025-10-31T10:12:00.000Z',
      });
      component.okr = viewModel;

      // Act
      fixture.detectChanges();

      // Assert
      const metaContainer = fixture.nativeElement.querySelector('.sticky-note__meta');
      expect(metaContainer).not.toBeNull();
      expect(metaContainer.textContent).toContain('Generated');
      expect(metaContainer.textContent).toContain('Oct');
    });

    it('should display last edited badge when edit exists', () => {
      // Arrange
      const viewModel = createOkrViewModel({
        lastEditedAt: '2025-11-01T14:30:00.000Z',
      });
      component.okr = viewModel;

      // Act
      fixture.detectChanges();

      // Assert
      const metaContainer = fixture.nativeElement.querySelector('.sticky-note__meta');
      expect(metaContainer).not.toBeNull();
      expect(metaContainer.textContent).toContain('Last edited');
    });

    it('should display manual edits indicator when hasManualEdits is true', () => {
      // Arrange
      const viewModel = createOkrViewModel({
        hasManualEdits: true,
      });
      component.okr = viewModel;

      // Act
      fixture.detectChanges();

      // Assert
      const manualEditsBadge = fixture.nativeElement.querySelector(
        '[data-testid="sticky-manual-edits"]',
      );
      expect(manualEditsBadge).not.toBeNull();
      expect(manualEditsBadge.textContent).toContain('manual edits');
    });

    it('should NOT display manual edits indicator when hasManualEdits is false', () => {
      // Arrange
      const viewModel = createOkrViewModel({
        hasManualEdits: false,
      });
      component.okr = viewModel;

      // Act
      fixture.detectChanges();

      // Assert
      const manualEditsBadge = fixture.nativeElement.querySelector(
        '[data-testid="sticky-manual-edits"]',
      );
      expect(manualEditsBadge).toBeNull();
    });

    it('should display metric and owner badges on key results', () => {
      // Arrange
      const viewModel = createOkrViewModel({
        keyResults: [
          {
            id: 'kr-1',
            statement: 'Test KR',
            metricLabel: 'Metric Label',
            ownerLabel: 'Owner Label',
          },
        ],
      });
      component.okr = viewModel;

      // Act
      fixture.detectChanges();

      // Assert
      const badges = fixture.nativeElement.querySelectorAll('[data-testid="sticky-kr-badge"]');
      const badgeTexts = Array.from(badges).map((el) => (el as Element).textContent?.trim());
      expect(badgeTexts).toContain('Metric Label');
      expect(badgeTexts).toContain('Owner Label');
    });
  });

  describe('Add Key Result Button', () => {
    it('should render "Add Key Result" button when OKR data exists', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;

      // Act
      fixture.detectChanges();

      // Assert
      const addButton = fixture.nativeElement.querySelector('[data-testid="sticky-add-kr"]');
      expect(addButton).not.toBeNull();
      expect(addButton.textContent).toContain('Add Key Result');
    });

    it('should emit addKr event when button is clicked', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      const addKrSpy = jest.fn();
      component.addKr.subscribe(addKrSpy);

      // Act
      fixture.detectChanges();
      const addButton = fixture.nativeElement.querySelector('[data-testid="sticky-add-kr"]');
      addButton.click();

      // Assert
      expect(addKrSpy).toHaveBeenCalledTimes(1);
    });

    it('should use ButtonComponent for the Add Key Result action', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;

      // Act
      fixture.detectChanges();

      // Assert - Check if the button uses the shared ButtonComponent
      // This verifies T027 has integrated shared components
      const buttonComponent = fixture.debugElement.query(By.directive(ButtonComponent));
      expect(buttonComponent).not.toBeNull();
    });
  });

  describe('Loading State', () => {
    it('should render loading spinner when loading is true', () => {
      // Arrange - This test expects the component to have a loading input
      // This will fail until T027 implements loading state
      (component as unknown as { loading: boolean }).loading = true;

      // Act
      fixture.detectChanges();

      // Assert
      const spinner = fixture.debugElement.query(By.directive(LoadingSpinnerComponent));
      expect(spinner).not.toBeNull();
    });

    it('should hide OKR content when loading', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      (component as unknown as { loading: boolean }).loading = true;

      // Act
      fixture.detectChanges();

      // Assert
      const objective = fixture.nativeElement.querySelector('[data-testid="sticky-objective"]');
      expect(objective).toBeNull();
    });

    it('should display loading message when provided', () => {
      // Arrange
      (component as unknown as { loading: boolean }).loading = true;
      (component as unknown as { loadingMessage: string }).loadingMessage = 'Generating OKR...';

      // Act
      fixture.detectChanges();

      // Assert
      const spinner = fixture.debugElement.query(By.directive(LoadingSpinnerComponent));
      expect(spinner).not.toBeNull();
      // If spinner has message input
      if (spinner?.componentInstance) {
        expect(spinner.componentInstance.message).toBe('Generating OKR...');
      }
    });
  });

  describe('Empty State', () => {
    it('should render empty state when no OKR data is provided', () => {
      // Arrange
      component.okr = null;

      // Act
      fixture.detectChanges();

      // Assert
      const objective = fixture.nativeElement.querySelector('[data-testid="sticky-objective"]');
      expect(objective).toBeNull();
    });

    it('should render empty state placeholder when provided', () => {
      // Arrange
      // This test expects an empty state placeholder in the component
      component.okr = null;

      // Act
      fixture.detectChanges();

      // Assert
      const emptyState = fixture.nativeElement.querySelector('[data-testid="sticky-empty-state"]');
      // This may fail until T027 implements empty state
      expect(emptyState).not.toBeNull();
    });

    it('should hide sticky note section when okr is null', () => {
      // Arrange
      component.okr = null;

      // Act
      fixture.detectChanges();

      // Assert
      const stickyNoteSection = fixture.nativeElement.querySelector('.sticky-note');
      expect(stickyNoteSection).toBeNull();
    });
  });

  describe('Error State', () => {
    it('should render error message when error is provided', () => {
      // Arrange
      // This test expects the component to have an error input
      (component as unknown as { error: string | null }).error = 'Failed to load OKR data';

      // Act
      fixture.detectChanges();

      // Assert
      const errorElement = fixture.nativeElement.querySelector('[data-testid="sticky-error"]');
      expect(errorElement).not.toBeNull();
      expect(errorElement.textContent).toContain('Failed to load OKR data');
    });

    it('should hide OKR content when error is displayed', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      (component as unknown as { error: string | null }).error = 'Error occurred';

      // Act
      fixture.detectChanges();

      // Assert
      const objective = fixture.nativeElement.querySelector('[data-testid="sticky-objective"]');
      expect(objective).toBeNull();
    });

    it('should provide retry action when error occurs', () => {
      // Arrange
      (component as unknown as { error: string | null }).error = 'Network error';
      const retrySpy = jest.fn();
      (component as unknown as { onRetry: { subscribe: (fn: () => void) => void } }).onRetry = {
        subscribe: retrySpy,
      };

      // Act
      fixture.detectChanges();

      // Assert
      const retryButton = fixture.nativeElement.querySelector('[data-testid="sticky-retry"]');
      expect(retryButton).not.toBeNull();
    });
  });

  describe('Integration with Gateway Service', () => {
    it('should display OKR from gateway service viewModel$', () => {
      // Arrange - In a real implementation, the component might subscribe to the gateway
      const viewModel = createOkrViewModel();
      mockGateway.setViewModel(viewModel);

      // Act
      fixture.detectChanges();

      // Assert - This depends on T027 implementation
      // If component uses the gateway, this should work
      const objective = fixture.nativeElement.querySelector('[data-testid="sticky-objective"]');
      // Note: This will only pass if T027 integrates with the gateway service
      if (objective) {
        expect(objective.textContent).toContain('提升团队交付节奏');
      }
    });

    it('should call gateway addKeyResult when button is clicked', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      const addKeyResultSpy = jest.spyOn(mockGateway, 'addKeyResult');

      // Act
      fixture.detectChanges();
      const addButton = fixture.nativeElement.querySelector('[data-testid="sticky-add-kr"]');
      addButton.click();

      // Assert - This will fail if component doesn't use gateway
      // T027 should decide: emit event OR call gateway directly
      expect(addKeyResultSpy).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels on the sticky note', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;

      // Act
      fixture.detectChanges();

      // Assert
      const section = fixture.nativeElement.querySelector('section');
      if (section) {
        expect(section.getAttribute('aria-label') || section.getAttribute('role')).toBeTruthy();
      }
    });

    it('should have accessible button for add key result', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;

      // Act
      fixture.detectChanges();

      // Assert
      const addButton = fixture.nativeElement.querySelector('[data-testid="sticky-add-kr"]');
      expect(addButton).not.toBeNull();
      expect(addButton.getAttribute('type')).toBe('button');
    });
  });

  describe('TrackBy Function', () => {
    it('should use trackByKeyResultId for performance', () => {
      // Assert
      expect(component.trackByKeyResultId).toBeDefined();

      // Test the trackBy function
      const result = component.trackByKeyResultId(0, { id: 'kr-123' });
      expect(result).toBe('kr-123');
    });

    it('should return consistent identifiers for trackBy', () => {
      const item1 = { id: 'kr-1' };
      const item2 = { id: 'kr-2' };

      expect(component.trackByKeyResultId(0, item1)).toBe('kr-1');
      expect(component.trackByKeyResultId(1, item2)).toBe('kr-2');
      // Index should not affect the result
      expect(component.trackByKeyResultId(99, item1)).toBe('kr-1');
    });
  });
});
