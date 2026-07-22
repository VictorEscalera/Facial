import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface UsuarioSesion {
  nombre: string;
  email: string;
  metodo: 'credenciales' | 'facial';
}

interface RespuestaLogin {
  mensaje?: string;
  usuario?: string | {
    nombre?: string;
    email?: string;
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = 'https://app-facial.vercel.app';
  private readonly claveSesion = 'appFacial.usuarioSesion';
  private readonly http = inject(HttpClient);
  private readonly usuarioActual = signal<UsuarioSesion | null>(this.leerSesion());

  readonly usuario = this.usuarioActual.asReadonly();

  login(email: string, password: string): Observable<RespuestaLogin> {
    return this.http
      .post<RespuestaLogin>(`${this.apiUrl}/login`, { email, password })
      .pipe(tap(respuesta => this.guardarRespuestaLogin(respuesta, email)));
  }

  registrar(datos: {
    nombre: string;
    email: string;
    password: string;
  }): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/register`, datos);
  }

  iniciarSesionFacial(nombre: string): void {
    this.guardarSesion({
      nombre,
      email: '',
      metodo: 'facial'
    });
  }

  estaAutenticado(): boolean {
    return this.usuarioActual() !== null;
  }

  cerrarSesion(): void {
    this.usuarioActual.set(null);
    this.obtenerAlmacenamiento()?.removeItem(this.claveSesion);
  }

  private guardarRespuestaLogin(respuesta: RespuestaLogin, emailIngresado: string): void {
    const usuario = respuesta.usuario;
    const nombre = typeof usuario === 'object'
      ? usuario.nombre || usuario.email || emailIngresado
      : usuario || emailIngresado;
    const email = typeof usuario === 'object'
      ? usuario.email || emailIngresado
      : emailIngresado;

    this.guardarSesion({
      nombre,
      email,
      metodo: 'credenciales'
    });
  }

  private guardarSesion(usuario: UsuarioSesion): void {
    this.usuarioActual.set(usuario);
    this.obtenerAlmacenamiento()?.setItem(this.claveSesion, JSON.stringify(usuario));
  }

  private leerSesion(): UsuarioSesion | null {
    const sesion = this.obtenerAlmacenamiento()?.getItem(this.claveSesion);
    if (!sesion) return null;

    try {
      return JSON.parse(sesion) as UsuarioSesion;
    } catch {
      this.obtenerAlmacenamiento()?.removeItem(this.claveSesion);
      return null;
    }
  }

  private obtenerAlmacenamiento(): Storage | null {
    return typeof localStorage === 'undefined' ? null : localStorage;
  }
}
