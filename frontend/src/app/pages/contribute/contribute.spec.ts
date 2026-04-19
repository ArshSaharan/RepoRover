import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Contribute } from './contribute';

describe('Contribute', () => {
  let component: Contribute;
  let fixture: ComponentFixture<Contribute>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Contribute],
    }).compileComponents();

    fixture = TestBed.createComponent(Contribute);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
