import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('guarda la sesión después del login tradicional', () => {
    service.login('usuario@example.com', 'secreto').subscribe();

    const request = http.expectOne('https://app-facial.vercel.app/login');
    expect(request.request.method).toBe('POST');
    request.flush({ mensaje: 'ok', usuario: 'usuario@example.com' });

    expect(service.usuario()?.email).toBe('usuario@example.com');
    expect(service.usuario()?.metodo).toBe('credenciales');
  });

  it('registra una sesión facial sin llamar al backend', () => {
    service.iniciarSesionFacial('Sergio');

    expect(service.usuario()).toEqual({
      nombre: 'Sergio',
      email: '',
      metodo: 'facial'
    });
    http.expectNone('https://app-facial.vercel.app/login');
  });

  it('elimina la sesión al cerrar sesión', () => {
    service.iniciarSesionFacial('Usuario');
    service.cerrarSesion();

    expect(service.estaAutenticado()).toBeFalse();
    expect(localStorage.getItem('appFacial.usuarioSesion')).toBeNull();
  });
});
