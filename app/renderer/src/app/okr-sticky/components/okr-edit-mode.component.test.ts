import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OkrEditModeComponent } from './okr-edit-mode.component';
import { ButtonComponent } from '../../shared/components/button.component';
import { InputComponent } from '../../shared/components/input.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { I18nService } from '../../shared/services/i18n.service';
import type { ValidationError } from '../state/edit-mode.store';

describe('OkrEditModeComponent', () => {
  let fixture: ComponentFixture<OkrEditModeComponent>;
  let component: OkrEditModeComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OkrEditModeComponent, ButtonComponent, InputComponent, TranslatePipe],
      providers: [
        {
          provide: I18nService,
          useValue: {
            currentLocale: () => 'zh-CN',
            translate: (key: string) => key,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OkrEditModeComponent);
    component = fixture.componentInstance;
    component.draftObjective = '提升团队交付节奏';
    component.draftKeyResults = [
      { id: 'kr-1', statement: '缩短迭代周期到 3 周', successMetric: '周期 <= 21 天', owner: '运营团队' },
      { id: 'kr-2', statement: '缺陷率控制在 0.5%', successMetric: '', owner: '' },
    ];
    component.errors = [];
    component.canSave = true;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render objective input and key result inputs', () => {
    fixture.detectChanges();
    const objectiveInput = fixture.nativeElement.querySelector('#objective-input');
    expect(objectiveInput).not.toBeNull();

    const krInputs = fixture.nativeElement.querySelectorAll('clarityokr-input');
    expect(krInputs.length).toBe(3); // 1 objective + 2 KR
  });

  it('should display character counters', () => {
    fixture.detectChanges();
    const counters = fixture.nativeElement.querySelectorAll('.char-counter');
    expect(counters.length).toBe(3);
    expect(counters[0].textContent).toContain('8/200'); // objective length
  });

  it('should show validation errors for objective', () => {
    const errors: ValidationError[] = [{ field: 'objective', message: 'Objective is required' }];
    component.errors = errors;
    fixture.detectChanges();

    expect(component.hasObjectiveError()).toBe(true);
    expect(component.getObjectiveError()).toBe('Objective is required');

    const errorAlerts = fixture.nativeElement.querySelectorAll('[role="alert"]');
    expect(errorAlerts.length).toBeGreaterThanOrEqual(1);
  });

  it('should show validation errors for key results', () => {
    const errors: ValidationError[] = [
      { field: 'keyResults.kr-1.statement', message: 'Statement too long' },
    ];
    component.errors = errors;
    fixture.detectChanges();

    expect(component.hasKrError('kr-1')).toBe(true);
    expect(component.getKrError('kr-1')).toBe('Statement too long');
    expect(component.hasKrError('kr-2')).toBe(false);
    expect(component.getKrError('kr-2')).toBe('');
  });

  it('should disable save button when canSave is false', () => {
    component.canSave = false;
    fixture.detectChanges();

    const saveButton = fixture.debugElement.query(By.css('button[data-testid="save-button"]'));
    expect(saveButton.nativeElement.disabled).toBe(true);
  });

  it('should emit objectiveChange when objective input changes', () => {
    const spy = jest.fn();
    component.objectiveChange.subscribe(spy);

    component.draftObjectiveProxy = 'New Objective';
    expect(spy).toHaveBeenCalledWith('New Objective');
  });

  it('should emit keyResultChange when KR input changes', () => {
    const spy = jest.fn();
    component.keyResultChange.subscribe(spy);

    component.draftKeyResults = [
      { id: 'kr-1', statement: 'Updated KR', successMetric: '', owner: '' },
    ];
    fixture.detectChanges();

    const inputs = fixture.debugElement.queryAll(By.css('input'));
    // inputs[0] is objective, inputs[1] is first KR
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    inputs[1].triggerEventHandler('input', { target: { value: 'Updated KR text' } });

    expect(spy).toHaveBeenCalledWith({ id: 'kr-1', statement: 'Updated KR text' });
  });

  it('should emit save event when save button clicked', () => {
    const spy = jest.fn();
    component.save.subscribe(spy);
    fixture.detectChanges();

    const saveButton = fixture.debugElement.query(By.css('button[data-testid="save-button"]'));
    saveButton.nativeElement.click();

    expect(spy).toHaveBeenCalled();
  });

  it('should emit cancel event when cancel button clicked', () => {
    const spy = jest.fn();
    component.cancel.subscribe(spy);
    fixture.detectChanges();

    const cancelButton = fixture.debugElement.query(By.css('button[data-testid="cancel-button"]'));
    cancelButton.nativeElement.click();

    expect(spy).toHaveBeenCalled();
  });
});
