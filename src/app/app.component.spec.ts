import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { Link } from './links.service';

describe('AppComponent', () => {
  const link: Link = {
    code: 'abc123', url: 'https://example.com/', shortUrl: 'http://localhost:3000/abc123',
    hits: 0, createdAt: '2026-01-01T00:00:00.000Z'
  };
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('rejects empty and non-http URLs without sending a request', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('/api/links').flush([]);
    for (const value of ['', 'not a url', 'ftp://example.com']) {
      fixture.componentInstance.url.setValue(value);
      fixture.componentInstance.submit();
      expect(fixture.componentInstance.url.invalid).toBeTrue();
      http.expectNone({ method: 'POST', url: '/api/links' });
    }
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Enter a valid URL');
  });

  it('creates a link once and refreshes the table', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('/api/links').flush([]);
    const app = fixture.componentInstance;
    app.url.setValue(link.url);
    app.submit();
    app.submit();
    const request = http.expectOne({ method: 'POST', url: '/api/links' });
    expect(request.request.body).toEqual({ url: link.url });
    expect(app.submitting()).toBeTrue();
    request.flush(link, { status: 201, statusText: 'Created' });
    expect(app.submitting()).toBeFalse();
    http.expectOne({ method: 'GET', url: '/api/links' }).flush([link]);
    fixture.detectChanges();
    const rendered = fixture.nativeElement as HTMLElement;
    expect(rendered.textContent).toContain(link.url);
    expect(rendered.querySelector('tbody a')?.getAttribute('href')).toBe(link.shortUrl);
    expect(rendered.querySelector('tbody')?.textContent).toContain('0');
    expect(rendered.textContent).toContain('Your short link');
  });

  it('shows server and network errors and permits retry', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('/api/links').flush('offline', { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Unable to load links');
    const app = fixture.componentInstance;
    app.loadLinks();
    http.expectOne('/api/links').flush([]);
    app.url.setValue('https://example.com');
    app.submit();
    http.expectOne({ method: 'POST', url: '/api/links' })
      .flush({ error: 'Invalid URL' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Invalid URL');
    expect(app.submitting()).toBeFalse();
    app.submit();
    http.expectOne({ method: 'POST', url: '/api/links' }).error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Unable to shorten the URL');
  });
});
