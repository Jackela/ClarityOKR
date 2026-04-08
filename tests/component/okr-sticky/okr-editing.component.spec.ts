/**
 * Component Tests for OkrStickyNoteComponent - Edit Mode Functionality
 *
 * User Story 3 - Editable OKR Control
 * These tests verify the sticky note component's edit functionality.
 *
 * NOTE: These tests are expected to FAIL initially until T039 implements
 * the edit mode features.
 *
 * @module tests/component/okr-sticky
 */

import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { type Provider, signal, computed } from '@angular/core';

// Component under test
import { OkrStickyNoteComponent } from '@clarityokr/renderer/app/okr-sticky/components/okr-sticky-note.component';

// Services to mock
import {
  OkrStickyService,
  type OkrStickyViewModel,
} from '@clarityokr/renderer/app/okr-sticky/services/okr-sticky.service';

// Shared components
import { ButtonComponent, InputComponent } from '@clarityokr/renderer/app/shared/components';

// ============================================================================
// Mock EditModeStore
// ============================================================================

interface EditFormData {
  objective: string;
  keyResults: Array<{
    id: string;
    statement: string;
    metricLabel: string | null;
    ownerLabel: string | null;
  }>;
}

interface ValidationErrors {
  objective?: string;
  keyResults?: Array<{ statement?: string }>;
}

/**
 * Mock implementation of EditModeStore
 * Controls edit mode state for testing
 */
class MockEditModeStore {
  private readonly isEditingSignal = signal<boolean>(false);
  private readonly formDataSignal = signal<EditFormData | null>(null);
  private readonly originalDataSignal = signal<EditFormData | null>(null);
  private readonly errorsSignal = signal<ValidationErrors>({});

  readonly isEditing = computed(() => this.isEditingSignal());
  readonly formData = computed(() => this.formDataSignal());
  readonly hasChanges = computed(() => {
    const current = this.formDataSignal();
    const original = this.originalDataSignal();
    return JSON.stringify(current) !== JSON.stringify(original);
  });
  readonly isValid = computed(() => {
    const errors = this.errorsSignal();
    return !errors.objective && (!errors.keyResults || errors.keyResults.length === 0);
  });
  readonly errors = computed(() => this.errorsSignal());

  enterEditMode(data: EditFormData): void {
    this.formDataSignal.set({ ...data });
    this.originalDataSignal.set({ ...data });
    this.isEditingSignal.set(true);
    this.errorsSignal.set({});
  }

  exitEditMode(): void {
    this.isEditingSignal.set(false);
    this.formDataSignal.set(null);
    this.originalDataSignal.set(null);
    this.errorsSignal.set({});
  }

  updateObjective(value: string): void {
    const current = this.formDataSignal();
    if (current) {
      this.formDataSignal.set({ ...current, objective: value });
    }
  }

  updateKeyResult(index: number, statement: string): void {
    const current = this.formDataSignal();
    if (current && current.keyResults[index]) {
      const newKeyResults = [...current.keyResults];
      newKeyResults[index] = { ...newKeyResults[index], statement };
      this.formDataSignal.set({ ...current, keyResults: newKeyResults });
    }
  }

  setValidationErrors(errors: ValidationErrors): void {
    this.errorsSignal.set(errors);
  }

  save(): EditFormData | null {
    if (this.isValid()) {
      const data = this.formDataSignal();
      this.exitEditMode();
      return data;
    }
    return null;
  }

  cancel(): void {
    this.exitEditMode();
  }
}

// ============================================================================
// Mock Gateway Service
// ============================================================================

/**
 * Mock Sticky Service
 * Replaces MockOkrStickyGatewayService to match OkrStickyService API
 */
class MockOkrStickyService {
  private readonly _viewModel = signal<OkrStickyViewModel | null>(null);
  readonly viewModel = this._viewModel.asReadonly();
  readonly hasStickyNote = computed(() => this._viewModel() !== null);
  readonly currentViewModel = computed(() => this._viewModel());

  updateViewModel(viewModel: OkrStickyViewModel | null): void {
    this._viewModel.set(viewModel);
  }

  updateOkr(_data: EditFormData): Promise<void> {
    return Promise.resolve();
  }
}

// ============================================================================
// Test Helpers
// ============================================================================

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

function createEditFormData(viewModel: OkrStickyViewModel): EditFormData {
  return {
    objective: viewModel.objective,
    keyResults: viewModel.keyResults.map((kr) => ({
      id: kr.id,
      statement: kr.statement,
      metricLabel: kr.metricLabel,
      ownerLabel: kr.ownerLabel,
    })),
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('OkrStickyNoteComponent - Edit Mode', () => {
  let fixture: ComponentFixture<OkrStickyNoteComponent>;
  let component: OkrStickyNoteComponent;
  let mockEditStore: MockEditModeStore;
  let mockStickyService: MockOkrStickyService;

  beforeEach(async () => {
    mockEditStore = new MockEditModeStore();
    mockStickyService = new MockOkrStickyService();

    await TestBed.configureTestingModule({
      imports: [OkrStickyNoteComponent, ButtonComponent, InputComponent],
      providers: [
        {
          provide: 'EditModeStore',
          useValue: mockEditStore,
        } satisfies Provider,
        {
          provide: OkrStickyService,
          useValue: mockStickyService,
        } satisfies Provider,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OkrStickyNoteComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
  });

  // ==========================================================================
  // Edit Button Visibility
  // ==========================================================================

  describe('Edit Button Visibility', () => {
    it('should show edit button in view mode', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.exitEditMode();

      // Act
      fixture.detectChanges();

      // Assert
      const editButton = fixture.nativeElement.querySelector('[data-testid="edit-button"]');
      expect(editButton).not.toBeNull();
    });

    it('should hide edit button in edit mode', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));

      // Act
      fixture.detectChanges();

      // Assert
      const editButton = fixture.nativeElement.querySelector('[data-testid="edit-button"]');
      expect(editButton).toBeNull();
    });
  });

  // ==========================================================================
  // Enter Edit Mode
  // ==========================================================================

  describe('Enter Edit Mode', () => {
    it('should enter edit mode when edit button is clicked', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      fixture.detectChanges();

      const editButton = fixture.nativeElement.querySelector('[data-testid="edit-button"]');
      expect(editButton).not.toBeNull();

      // Act
      editButton.click();
      fixture.detectChanges();

      // Assert
      expect(mockEditStore.isEditing()).toBe(true);
    });

    it('should show input fields when entering edit mode', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));

      // Act
      fixture.detectChanges();

      // Assert
      const objectiveInput = fixture.nativeElement.querySelector('[data-testid="objective-input"]');
      expect(objectiveInput).not.toBeNull();

      const krInputs = fixture.nativeElement.querySelectorAll('[data-testid^="kr-input-"]');
      expect(krInputs.length).toBe(viewModel.keyResults.length);
    });

    it('should populate input fields with current OKR data when entering edit mode', () => {
      // Arrange
      const viewModel = createOkrViewModel({
        objective: 'Test Objective',
        keyResults: [{ id: 'kr-1', statement: 'First KR', metricLabel: null, ownerLabel: null }],
      });
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));

      // Act
      fixture.detectChanges();

      // Assert
      const objectiveInput = fixture.nativeElement.querySelector('[data-testid="objective-input"]');
      expect(objectiveInput.value || objectiveInput.textContent).toContain('Test Objective');

      const krInput = fixture.nativeElement.querySelector('[data-testid="kr-input-0"]');
      expect(krInput.value || krInput.textContent).toContain('First KR');
    });
  });

  // ==========================================================================
  // Save Functionality
  // ==========================================================================

  describe('Save Functionality', () => {
    it('should show save button in edit mode', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));

      // Act
      fixture.detectChanges();

      // Assert
      const saveButton = fixture.nativeElement.querySelector('[data-testid="save-button"]');
      expect(saveButton).not.toBeNull();
    });

    it('should save changes when save button is clicked', async () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      mockEditStore.updateObjective('Updated Objective');
      fixture.detectChanges();

      const updateSpy = jest.spyOn(mockStickyService, 'updateOkr');
      const saveButton = fixture.nativeElement.querySelector('[data-testid="save-button"]');

      // Act
      saveButton.click();
      await fixture.whenStable();
      fixture.detectChanges();

      // Assert
      expect(updateSpy).toHaveBeenCalled();
      expect(mockEditStore.isEditing()).toBe(false);
    });

    it('should exit edit mode after successful save', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      mockEditStore.updateObjective('Updated Objective');
      fixture.detectChanges();

      const saveButton = fixture.nativeElement.querySelector('[data-testid="save-button"]');

      // Act
      saveButton.click();
      fixture.detectChanges();

      // Assert
      expect(mockEditStore.isEditing()).toBe(false);
      const objectiveInput = fixture.nativeElement.querySelector('[data-testid="objective-input"]');
      expect(objectiveInput).toBeNull();
    });

    it('should show updated objective in view mode after save', async () => {
      // Arrange
      const viewModel = createOkrViewModel({ objective: 'Original Objective' });
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      mockEditStore.updateObjective('Updated Objective');
      fixture.detectChanges();

      const saveButton = fixture.nativeElement.querySelector('[data-testid="save-button"]');

      // Act
      saveButton.click();
      await fixture.whenStable();
      fixture.detectChanges();

      // Assert - back in view mode with updated data
      const objectiveElement = fixture.nativeElement.querySelector(
        '[data-testid="sticky-objective"]',
      );
      expect(objectiveElement).not.toBeNull();
      expect(objectiveElement.textContent).toContain('Updated Objective');
    });
  });

  // ==========================================================================
  // Cancel Functionality
  // ==========================================================================

  describe('Cancel Functionality', () => {
    it('should show cancel button in edit mode', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));

      // Act
      fixture.detectChanges();

      // Assert
      const cancelButton = fixture.nativeElement.querySelector('[data-testid="cancel-button"]');
      expect(cancelButton).not.toBeNull();
    });

    it('should discard changes when cancel button is clicked', () => {
      // Arrange
      const viewModel = createOkrViewModel({ objective: 'Original Objective' });
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      mockEditStore.updateObjective('Modified But Cancelled');
      fixture.detectChanges();

      const cancelButton = fixture.nativeElement.querySelector('[data-testid="cancel-button"]');

      // Act
      cancelButton.click();
      fixture.detectChanges();

      // Assert
      expect(mockEditStore.isEditing()).toBe(false);

      // Original data should remain unchanged
      const objectiveElement = fixture.nativeElement.querySelector(
        '[data-testid="sticky-objective"]',
      );
      expect(objectiveElement.textContent).toContain('Original Objective');
    });

    it('should exit edit mode when cancel is clicked', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      fixture.detectChanges();

      const cancelButton = fixture.nativeElement.querySelector('[data-testid="cancel-button"]');

      // Act
      cancelButton.click();
      fixture.detectChanges();

      // Assert
      expect(mockEditStore.isEditing()).toBe(false);

      // Input fields should be hidden
      const objectiveInput = fixture.nativeElement.querySelector('[data-testid="objective-input"]');
      expect(objectiveInput).toBeNull();
    });
  });

  // ==========================================================================
  // Character Counter
  // ==========================================================================

  describe('Character Counter', () => {
    it('should display character counter for objective input', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));

      // Act
      fixture.detectChanges();

      // Assert
      const charCounter = fixture.nativeElement.querySelector(
        '[data-testid="objective-char-counter"]',
      );
      expect(charCounter).not.toBeNull();
    });

    it('should show remaining characters correctly', () => {
      // Arrange
      const viewModel = createOkrViewModel({ objective: 'Test' });
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));

      // Act
      fixture.detectChanges();

      // Assert
      const charCounter = fixture.nativeElement.querySelector(
        '[data-testid="objective-char-counter"]',
      );
      const text = charCounter.textContent || '';
      // Assuming max length is 200, "Test" has 4 characters
      expect(text).toMatch(/196|200/);
    });

    it('should show character counter for each key result input', () => {
      // Arrange
      const viewModel = createOkrViewModel({
        keyResults: [
          { id: 'kr-1', statement: 'First', metricLabel: null, ownerLabel: null },
          { id: 'kr-2', statement: 'Second', metricLabel: null, ownerLabel: null },
        ],
      });
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));

      // Act
      fixture.detectChanges();

      // Assert
      const krCharCounters = fixture.nativeElement.querySelectorAll(
        '[data-testid^="kr-char-counter-"]',
      );
      expect(krCharCounters.length).toBe(2);
    });
  });

  // ==========================================================================
  // Validation Error Messages
  // ==========================================================================

  describe('Validation Error Messages', () => {
    it('should display error message when objective is empty', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      mockEditStore.setValidationErrors({ objective: 'Objective is required' });

      // Act
      fixture.detectChanges();

      // Assert
      const errorMessage = fixture.nativeElement.querySelector('[data-testid="objective-error"]');
      expect(errorMessage).not.toBeNull();
      expect(errorMessage.textContent).toContain('required');
    });

    it('should display error message when objective exceeds max length', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      mockEditStore.setValidationErrors({
        objective: 'Objective must be less than 200 characters',
      });

      // Act
      fixture.detectChanges();

      // Assert
      const errorMessage = fixture.nativeElement.querySelector('[data-testid="objective-error"]');
      expect(errorMessage).not.toBeNull();
      expect(errorMessage.textContent).toContain('200');
    });

    it('should display error message for invalid key result', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      mockEditStore.setValidationErrors({
        keyResults: [{ statement: 'Key result is required' }],
      });

      // Act
      fixture.detectChanges();

      // Assert
      const krError = fixture.nativeElement.querySelector('[data-testid="kr-error-0"]');
      expect(krError).not.toBeNull();
      expect(krError.textContent).toContain('required');
    });

    it('should hide error messages when input becomes valid', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      mockEditStore.setValidationErrors({ objective: 'Objective is required' });
      fixture.detectChanges();

      // Verify error is shown
      let errorMessage = fixture.nativeElement.querySelector('[data-testid="objective-error"]');
      expect(errorMessage).not.toBeNull();

      // Act - clear errors
      mockEditStore.setValidationErrors({});
      fixture.detectChanges();

      // Assert
      errorMessage = fixture.nativeElement.querySelector('[data-testid="objective-error"]');
      expect(errorMessage).toBeNull();
    });
  });

  // ==========================================================================
  // Save Button State - Disabled Conditions
  // ==========================================================================

  describe('Save Button State', () => {
    it('should disable save button when there are no changes', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      // No changes made

      // Act
      fixture.detectChanges();

      // Assert
      const saveButton = fixture.nativeElement.querySelector('[data-testid="save-button"]');
      expect(saveButton).not.toBeNull();
      expect(saveButton.disabled).toBe(true);
    });

    it('should enable save button when changes are made', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      mockEditStore.updateObjective('Changed Objective');

      // Act
      fixture.detectChanges();

      // Assert
      const saveButton = fixture.nativeElement.querySelector('[data-testid="save-button"]');
      expect(saveButton.disabled).toBe(false);
    });

    it('should disable save button when form is invalid', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      mockEditStore.updateObjective('');
      mockEditStore.setValidationErrors({ objective: 'Objective is required' });

      // Act
      fixture.detectChanges();

      // Assert
      const saveButton = fixture.nativeElement.querySelector('[data-testid="save-button"]');
      expect(saveButton.disabled).toBe(true);
    });

    it('should disable save button when key result is invalid', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      mockEditStore.updateKeyResult(0, '');
      mockEditStore.setValidationErrors({
        keyResults: [{ statement: 'Key result is required' }],
      });

      // Act
      fixture.detectChanges();

      // Assert
      const saveButton = fixture.nativeElement.querySelector('[data-testid="save-button"]');
      expect(saveButton.disabled).toBe(true);
    });

    it('should enable save button when form is valid and has changes', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      mockEditStore.updateObjective('Valid Updated Objective');
      // No validation errors

      // Act
      fixture.detectChanges();

      // Assert
      const saveButton = fixture.nativeElement.querySelector('[data-testid="save-button"]');
      expect(saveButton.disabled).toBe(false);
    });
  });

  // ==========================================================================
  // Data TestId Attributes
  // ==========================================================================

  describe('Data TestId Attributes', () => {
    it('should have data-testid="edit-button" on edit button', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      fixture.detectChanges();

      // Assert
      const editButton = fixture.nativeElement.querySelector('[data-testid="edit-button"]');
      expect(editButton).not.toBeNull();
    });

    it('should have data-testid="save-button" on save button in edit mode', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      mockEditStore.updateObjective('Changed');
      fixture.detectChanges();

      // Assert
      const saveButton = fixture.nativeElement.querySelector('[data-testid="save-button"]');
      expect(saveButton).not.toBeNull();
    });

    it('should have data-testid="cancel-button" on cancel button in edit mode', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      fixture.detectChanges();

      // Assert
      const cancelButton = fixture.nativeElement.querySelector('[data-testid="cancel-button"]');
      expect(cancelButton).not.toBeNull();
    });

    it('should have data-testid="objective-input" on objective input field', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      fixture.detectChanges();

      // Assert
      const objectiveInput = fixture.nativeElement.querySelector('[data-testid="objective-input"]');
      expect(objectiveInput).not.toBeNull();
    });

    it('should have data-testid="kr-input-{index}" on each key result input field', () => {
      // Arrange
      const viewModel = createOkrViewModel({
        keyResults: [
          { id: 'kr-1', statement: 'First', metricLabel: null, ownerLabel: null },
          { id: 'kr-2', statement: 'Second', metricLabel: null, ownerLabel: null },
          { id: 'kr-3', statement: 'Third', metricLabel: null, ownerLabel: null },
        ],
      });
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      fixture.detectChanges();

      // Assert
      const krInput0 = fixture.nativeElement.querySelector('[data-testid="kr-input-0"]');
      const krInput1 = fixture.nativeElement.querySelector('[data-testid="kr-input-1"]');
      const krInput2 = fixture.nativeElement.querySelector('[data-testid="kr-input-2"]');

      expect(krInput0).not.toBeNull();
      expect(krInput1).not.toBeNull();
      expect(krInput2).not.toBeNull();
    });
  });

  // ==========================================================================
  // Edit Mode UI State
  // ==========================================================================

  describe('Edit Mode UI State', () => {
    it('should hide view mode content when in edit mode', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));

      // Act
      fixture.detectChanges();

      // Assert - Add Key Result button should be hidden in edit mode
      const addKrButton = fixture.nativeElement.querySelector('[data-testid="sticky-add-kr"]');
      expect(addKrButton).toBeNull();
    });

    it('should show edit form container when in edit mode', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));

      // Act
      fixture.detectChanges();

      // Assert
      const editForm = fixture.nativeElement.querySelector('[data-testid="edit-form"]');
      expect(editForm).not.toBeNull();
    });

    it('should have proper labels for input fields in edit mode', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));

      // Act
      fixture.detectChanges();

      // Assert
      const objectiveLabel = fixture.nativeElement.querySelector('[data-testid="objective-label"]');
      expect(objectiveLabel).not.toBeNull();
      expect(objectiveLabel.textContent).toContain('Objective');
    });
  });

  // ==========================================================================
  // Keyboard Interactions
  // ==========================================================================

  describe('Keyboard Interactions', () => {
    it('should save on Ctrl+Enter in edit mode', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      mockEditStore.updateObjective('Updated with keyboard');
      fixture.detectChanges();

      const saveSpy = jest.spyOn(mockEditStore, 'save');
      const input = fixture.nativeElement.querySelector('[data-testid="objective-input"]');

      // Act
      const event = new KeyboardEvent('keydown', { ctrlKey: true, key: 'Enter' });
      input.dispatchEvent(event);
      fixture.detectChanges();

      // Assert
      expect(saveSpy).toHaveBeenCalled();
    });

    it('should cancel on Escape key in edit mode', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      fixture.detectChanges();

      const cancelSpy = jest.spyOn(mockEditStore, 'cancel');
      const input = fixture.nativeElement.querySelector('[data-testid="objective-input"]');

      // Act
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      input.dispatchEvent(event);
      fixture.detectChanges();

      // Assert
      expect(cancelSpy).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Integration with Store
  // ==========================================================================

  describe('Integration with EditModeStore', () => {
    it('should sync form data with store on input changes', () => {
      // Arrange
      const viewModel = createOkrViewModel({ objective: 'Original' });
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      fixture.detectChanges();

      const objectiveInput = fixture.nativeElement.querySelector('[data-testid="objective-input"]');

      // Act
      objectiveInput.value = 'New Value';
      objectiveInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      // Assert
      expect(mockEditStore.formData()?.objective).toBe('New Value');
    });

    it('should reflect store state changes in the UI', () => {
      // Arrange
      const viewModel = createOkrViewModel();
      component.okr = viewModel;
      mockEditStore.enterEditMode(createEditFormData(viewModel));
      fixture.detectChanges();

      // Act - simulate external store update
      mockEditStore.updateObjective('Externally Updated');
      fixture.detectChanges();

      // Assert
      const objectiveInput = fixture.nativeElement.querySelector('[data-testid="objective-input"]');
      expect(objectiveInput.value || objectiveInput.textContent).toContain('Externally Updated');
    });
  });
});
