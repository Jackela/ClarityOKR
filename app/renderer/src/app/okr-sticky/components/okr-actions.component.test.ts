import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OkrActionsComponent } from './okr-actions.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { I18nService } from '../../shared/services/i18n.service';

describe('OkrActionsComponent', () => {
  let fixture: ComponentFixture<OkrActionsComponent>;
  let component: OkrActionsComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OkrActionsComponent, TranslatePipe],
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

    fixture = TestBed.createComponent(OkrActionsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render edit and add KR buttons', () => {
    fixture.detectChanges();
    const editButton = fixture.nativeElement.querySelector('[data-testid="edit-button"]');
    const addButton = fixture.nativeElement.querySelector('[data-testid="sticky-add-kr"]');

    expect(editButton).not.toBeNull();
    expect(addButton).not.toBeNull();
  });

  it('should emit edit event when edit button clicked', () => {
    const editSpy = jest.fn();
    component.edit.subscribe(editSpy);
    fixture.detectChanges();

    const editButton = fixture.debugElement.query(By.css('[data-testid="edit-button"]'));
    editButton.triggerEventHandler('click', {});

    expect(editSpy).toHaveBeenCalled();
  });

  it('should emit addKr event when add KR button clicked', () => {
    const addKrSpy = jest.fn();
    component.addKr.subscribe(addKrSpy);
    fixture.detectChanges();

    const addButton = fixture.debugElement.query(By.css('[data-testid="sticky-add-kr"]'));
    addButton.triggerEventHandler('click', {});

    expect(addKrSpy).toHaveBeenCalled();
  });
});
