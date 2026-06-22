import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { logOutOutline, timeOutline, hardwareChipOutline } from 'ionicons/icons';

@Component({
  selector: 'app-inicio',
  templateUrl: './inicio.page.html',
  styleUrls: ['./inicio.page.scss'],
  standalone: true,
  imports: [IonicModule, RouterLink] // RouterLink es vital aquí
})
export class InicioPage implements OnInit {
  usuarioLogeado: string = 'Usuario';
  private route = inject(ActivatedRoute);

  constructor() {
    console.log('INICIO PAGE CARGADA');

    addIcons({
      logOutOutline,
      timeOutline,
      hardwareChipOutline
    });
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['usuario']) {
        this.usuarioLogeado = params['usuario'].split('@')[0]; 
      }
    });
  }
}