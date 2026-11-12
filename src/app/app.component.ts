import { Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Link, LinksService } from './links.service';

function httpUrl(control: AbstractControl): ValidationErrors | null {
  try {
    const url = new URL(control.value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
}

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  private readonly linksService = inject(LinksService);
  readonly url = new FormControl('', { nonNullable: true, validators: [Validators.required, httpUrl] });
  readonly links = signal<Link[]>([]);
  readonly loading = signal(true);
  readonly listError = signal('');
  readonly submitError = signal('');
  readonly submitting = signal(false);
  readonly created = signal<Link | null>(null);

  ngOnInit(): void {
    this.loadLinks();
    this.url.valueChanges.subscribe(() => this.submitError.set(''));
  }

  submit(): void {
    if (this.submitting()) return;
    if (this.url.invalid) {
      this.url.markAsTouched();
      return;
    }

    this.submitting.set(true);
    this.submitError.set('');
    this.created.set(null);
    this.linksService.create(this.url.value).subscribe({
      next: (link) => {
        this.created.set(link);
        this.url.reset();
        this.submitting.set(false);
        this.loadLinks();
      },
      error: (error: unknown) => {
        const message = error instanceof HttpErrorResponse && typeof error.error?.error === 'string'
          ? error.error.error
          : 'Unable to shorten the URL. Please try again.';
        this.submitError.set(message);
        this.submitting.set(false);
      }
    });
  }

  loadLinks(): void {
    this.loading.set(true);
    this.listError.set('');
    this.linksService.list().subscribe({
      next: (links) => {
        this.links.set(links);
        this.loading.set(false);
      },
      error: () => {
        this.listError.set('Unable to load links. Please try again.');
        this.loading.set(false);
      }
    });
  }
}
