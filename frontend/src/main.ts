import 'zone.js';

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component'; // Змінено з App на AppComponent

bootstrapApplication(AppComponent, appConfig) // Змінено тут
  .catch((err) => console.error(err));
