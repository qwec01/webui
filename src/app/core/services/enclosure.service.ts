import { Injectable } from '@angular/core';
import { BaseService } from './base.service';
import { CoreEvent } from './core.service';
import { SysInfo } from './system-profile.service';
import { SystemProfiler } from 'app/core/classes/system-profiler';
import { UUID } from 'angular2-uuid';
import { DriveTray } from 'app/core/classes/hardware/drivetray';
import { Chassis } from 'app/core/classes/hardware/chassis';
import { ChassisView } from 'app/core/classes/hardware/chassis-view';
import { R10 } from 'app/core/classes/hardware/r10';
import { R20 } from 'app/core/classes/hardware/r20';
import { R40 } from 'app/core/classes/hardware/r40';
import { R50 } from 'app/core/classes/hardware/r50';
import { M50 } from 'app/core/classes/hardware/m50';
import { ES12 } from 'app/core/classes/hardware/es12';
import { E16 } from 'app/core/classes/hardware/e16';
import { E24 } from 'app/core/classes/hardware/e24';
import { ES24 } from 'app/core/classes/hardware/es24';
import { ES24F } from 'app/core/classes/hardware/es24f';
import { E60 } from 'app/core/classes/hardware/e60';
import { ES60 } from 'app/core/classes/hardware/es60';
import { ES102 } from 'app/core/classes/hardware/es102';

import {
  Application, Container, extras, Text, DisplayObject, Graphics, Sprite, Texture, utils,
} from 'pixi.js';
import 'pixi-projection';

interface EnclosureApp {
  id: string;
  app: Application;
  config: EnclosureAppConfig;
  chassis?: Chassis;
}

export interface EnclosureAppConfig {
  enclosureIndex: number;
  diskName?: string;
  showVdevs?: boolean;
  show: string; // pools | status
  view?: string; // front | back
  interactive?: boolean;
}

export interface EnclosureCanvas {
  id: string;
  canvas: HTMLElement;
  config: EnclosureAppConfig;
}

@Injectable({
  providedIn: 'root',
})
export class EnclosureService extends BaseService {
  // Storage and system state
  sysInfo: SysInfo;
  system: SystemProfiler;
  failedDisks: string[] = [];
  apps: any = {};

  defaultView = 'front';

  private factory: Application; // top level stage container holding main renderer context.
  private pixiWidth = 600;
  private pixiHeight = 400;
  private ratio: number = this.pixiWidth / this.pixiHeight;

  private theme;

  constructor() {
    super();
  }

  protected onAuthenticated(evt: CoreEvent) {
    this.authenticated = true;

    this.core.register({
      observerClass: this,
      eventName: 'SysInfo',
    }).subscribe((evt: CoreEvent) => {
      this.sysInfo = evt.data;

      this.buildProfile();

      if (!this.system) {
        this.core.emit({ name: 'EnclosureDataRequest', sender: this });
      }
    });

    this.core.register({
      observerClass: this,
      eventName: 'EnclosureCreate',
    }).subscribe((evt: CoreEvent) => {
      // Apply defaults for missing optional properties
      if (!evt.data.background) evt.data.background = true;
      if (!evt.data.view) evt.data.view = 'front';
      if (!evt.data.interactive) evt.data.interactive = false;

      this.enclosureInit(evt.data);
    });

    this.core.register({
      observerClass: this,
      eventName: 'EnclosureDestroy',
    }).subscribe((evt: CoreEvent) => {
      console.log(evt);
      this.enclosureDestroy(evt.data); // Expects evt.data to be the id of the canvas
    });

    this.core.register({
      observerClass: this,
      eventName: 'DisksChanged',
    }).subscribe((evt: CoreEvent) => {
      // React to event
    });

    this.core.emit({ name: 'SysInfoRequest', sender: this });

    this.core.register({ observerClass: this, eventName: 'ThemeData' }).subscribe((evt: CoreEvent) => {
      this.theme = evt.data;
    });

    this.core.register({ observerClass: this, eventName: 'ThemeChanged' }).subscribe((evt: CoreEvent) => {
      if (this.theme == evt.data) { return; }
      this.theme = evt.data;
      // this.setCurrentView(this.currentView);
      /* if (this.labels && this.labels.events) {
        this.labels.events.next(evt);
      } */
      this.optimizeChassisOpacity();
    });

    this.core.emit({ name: 'ThemeDataRequest', sender: this });
  }

  enclosureInit(config: EnclosureAppConfig) {
    PIXI.settings.PRECISION_FRAGMENT = 'highp'; // this makes text looks better? Answer = NO
    PIXI.settings.SPRITE_MAX_TEXTURES = Math.min(PIXI.settings.SPRITE_MAX_TEXTURES, 16);// Fixes FireFox gl errors
    PIXI.utils.skipHello();

    if (!this.factory) {
      this.factory = new PIXI.Application({
        width: this.pixiWidth,
        height: this.pixiHeight,
        forceCanvas: false,
        transparent: true,
        antialias: true,
        autoStart: true,
      });
    }

    const enclosureApp: EnclosureApp = {
      app: this.factory,
      id: UUID.UUID(),
      config,
    };

    // if(config.background) app.renderer.view.style.background = 'var(--contrast-darkest)';
    this.factory.renderer.view.id = enclosureApp.id;
    this.factory.stage.name = 'stage_container';

    const container = new PIXI.Container(); // Best to have one of these globally and send extracted images.
    container.name = 'top_level_container_' + enclosureApp.id;
    container.width = this.factory.stage.width;
    container.height = this.factory.stage.height;
    container.interactiveChildren = config.interactive;
    this.factory.stage.addChild(container);

    const profile = this.system.profile[enclosureApp.config.enclosureIndex];
    const enclosureData = this.system.enclosures[profile.enclosureKey];

    enclosureApp.chassis = this.createChassis(enclosureData);

    const view = config.view ? config.view : this.defaultView;
    const chassisView: ChassisView = enclosureApp.chassis[view];

    this.setupEnclosureEvents(enclosureApp, enclosureData, chassisView);
  }

  enclosureDestroy(id: string) {
    const enclosureApp = this.apps[id];
    console.log(this.apps);
    const chassisView = enclosureApp.chassis[enclosureApp.config.view];

    const container = this.factory.stage.getChildByName(chassisView.container.parent.name);
    this.factory.stage.removeChild(container);
    container.destroy(true);

    delete this.apps[id];
    const canvas = document.getElementById(id);
    canvas.remove();
  }

  extractEnclosure(chassisView, profile, enclosureApp): HTMLElement {
    const container = this.factory.stage.getChildByName(chassisView.container.parent.name);
    container.name += '_extracted';
    const canvas = this.factory.renderer.plugins.extract.canvas(container);

    return canvas;
  }

  createChassis(enclosureData: any): Chassis {
    let chassis: Chassis;

    switch (enclosureData.model) {
      case 'R10':
        chassis = new R10();
        break;
      case 'R20':
        chassis = new R20(true);
        break;
      case 'R40':
        chassis = new R40();
        break;
      case 'R50':
        chassis = new R50(true);
        break;
      case 'M Series':
        const rearChassis = !!this.system.rearIndex;
        chassis = new M50(rearChassis);
        break;
      case 'X Series':
      case 'ES12':
        chassis = new ES12();
        break;
      case 'Z Series':
      case 'TRUENAS-Z20-HA-D':
      case 'E16':
        chassis = new E16();
        break;
      case 'ES24':
        chassis = new ES24();
        break;
      case 'ES24F':
        chassis = new ES24F();
        break;
      case 'E24':
        chassis = new E24();
        break;
      case 'ES60':
        chassis = new ES60();
        break;
      case 'E60':
        chassis = new E60();
        break;
      case 'ES102':
        chassis = new ES102();
        break;
    }

    return chassis;
  }

  buildProfile(): void {
    this.core.register({ observerClass: this, eventName: 'EnclosureData' }).subscribe((evt: CoreEvent) => {
      this.system = new SystemProfiler(this.sysInfo.system_product, evt.data);

      this.core.emit({ name: 'DisksRequest', sender: this });
      this.core.emit({ name: 'SensorDataRequest', sender: this });
    });

    this.core.register({ observerClass: this, eventName: 'EnclosureLabelChanged' }).subscribe((evt: CoreEvent) => {
      this.system.enclosures[evt.data.index].label = evt.data.label;
    });

    this.core.register({ observerClass: this, eventName: 'PoolData' }).subscribe((evt: CoreEvent) => {
      if (!this.system) return;
      this.system.pools = evt.data;
    });

    this.core.register({ observerClass: this, eventName: 'SensorData' }).subscribe((evt: CoreEvent) => {
      this.system.sensorData = evt.data;
    });

    this.core.register({ observerClass: this, eventName: 'DisksChanged' }).subscribe((evt: CoreEvent) => {
      if (evt.data.cleared) {
        // Extra actions if disk is removed
        const removedDiskFields = this.system.getDiskByID(evt.data.id);
      }

      this.fetchDiskData();
    });

    this.core.register({ observerClass: this, eventName: 'DisksData' }).subscribe((evt: CoreEvent) => {
      this.system.diskData = evt.data;
      this.core.emit({ name: 'PoolDataRequest', sender: this });
    });
  }

  fetchDiskData() {
    this.core.emit({ name: 'DisksRequest', sender: this });
  }

  setupEnclosureEvents(enclosureApp: EnclosureApp, enclosureData: any, chassisView: ChassisView) {
    const container: Container = enclosureApp.app.stage.getChildByName('top_level_container_' + enclosureApp.id);
    const profile = this.system.profile[enclosureApp.config.enclosureIndex];

    chassisView.events.subscribe((evt) => {
      switch (evt.name) {
        case 'Ready':
          container.addChild(chassisView.container);
          chassisView.container.name = chassisView.model;
          chassisView.container.width = chassisView.container.width / 2;
          chassisView.container.height = chassisView.container.height / 2;

          // this.setDisksEnabledState();
          this.setCurrentView(chassisView, enclosureApp);

          // this.optimizeChassisOpacity();

          // Setup and deliver canvas when ready
          const profile = this.system.profile[enclosureApp.config.enclosureIndex];

          const canvas: HTMLElement = !enclosureApp.config.interactive ? this.extractEnclosure(chassisView, profile, enclosureApp) : enclosureApp.app.view;
          canvas.id = enclosureApp.id;

          this.apps[enclosureApp.id] = enclosureApp;

          this.core.emit({
            name: 'EnclosureCanvas',
            data: { canvas, id: enclosureApp.id, config: enclosureApp.config },
            sender: this,
          });

          this.factory.stage.removeChild(chassisView.container);

          break;
      }
    });

    if (true || !chassisView.loader.resources || !chassisView.loader.resources[chassisView.model]) {
      chassisView.load();
    } else {
      this.onImport(enclosureApp, chassisView);
    }
  }

  onImport(enclosureApp: EnclosureApp, chassisView: ChassisView) {
    const container: Container = enclosureApp.app.stage.getChildByName('top_level_container_' + enclosureApp.id);
    const sprite: Sprite = PIXI.Sprite.from(chassisView.loader.resources.m50.texture.baseTexture);
    sprite.x = 0;
    sprite.y = 0;
    sprite.name = chassisView.model + '_sprite';
    sprite.alpha = 0.1;
    container.addChild(sprite);

    const dt = chassisView.makeDriveTray();
    container.addChild(dt.container);

    const view = enclosureApp.config.view ? enclosureApp.config.view : this.defaultView;
    this.setCurrentView(chassisView, enclosureApp);
  }

  setCurrentView(chassisView: ChassisView, enclosureApp: EnclosureApp) {
    const show = enclosureApp.config.show ? enclosureApp.config.show : this.defaultView;

    const profile = this.system.profile[enclosureApp.config.enclosureIndex];
    const enclosureData = this.system.enclosures[profile.enclosureKey];
    const appContainer: Container = enclosureApp.app.stage.getChildByName('top_level_container_' + enclosureApp.id);

    switch (show) {
      case 'pools':
        appContainer.alpha = 1;
        this.setDisksPoolState(chassisView, profile);
        break;
      case 'status':
        appContainer.alpha = 1;
        this.setDisksDisabled(chassisView, profile);
        this.setDisksHealthState(chassisView, profile);
        break;
      /* case 'details':
        appContainer.alpha = 1;
        this.setDisksDisabled();
        // this.setDisksHealthState();
        this.setDisksPoolState();
        const vdev = this.system.getVdevInfo(this.selectedDisk.devname);
        this.selectedVdev = vdev;

        this.labels = new VDevLabelsSVG(this.enclosure, this.app, this.theme, this.selectedDisk);

        this.labels.events.next({ name: 'LabelDrives', data: vdev, sender: this });
        let dl;

        break; */
    }
  }

  setDisksPoolState(chassisView: ChassisView, profile: any) {
    // const selectedEnclosure = this.getSelectedEnclosure();
    this.setDisksDisabled(chassisView, profile);
    const keys = Object.keys(profile.poolKeys);
    profile.disks.forEach((disk, index) => {
      if (disk.enclosure.slot < chassisView.slotRange.start || disk.enclosure.slot > chassisView.slotRange.end) { return; }
      if (!disk.vdev) {
        chassisView.events.next({ name: 'ChangeDriveTrayColor', data: { id: disk.enclosure.slot, color: '#999999' } });
        return;
      }
      const pIndex = disk.vdev.poolIndex;
      chassisView.events.next({ name: 'ChangeDriveTrayColor', data: { id: disk.enclosure.slot, color: this.theme[this.theme.accentColors[pIndex]] } });
    });
  }

  optimizeChassisOpacity(extractedEnclosure?) {
    /* const css = (<any>document).documentElement.style.getPropertyValue('--contrast-darkest');
    const hsl = this.themeUtils.hslToArray(css);

    let opacity;
    if (extractedEnclosure) {
      opacity = hsl[2] < 60 ? 0.35 : 0.75;
      extractedEnclosure.chassis.alpha = opacity;
    } else {
      opacity = hsl[2] < 60 ? 0.25 : 0.75;
      this.chassis.front.setChassisOpacity(opacity);

      if (this.chassis.rear) {
        this.chassis.rear.setChassisOpacity(opacity);
      }
    } */
  }

  setDisksEnabledState(profile: any, chassisView?: ChassisView) {
    // if (!enclosure) { enclosure = this.enclosure; }
    chassisView.driveTrayObjects.forEach((dt, index) => {
      // let disk = this.findDiskBySlotNumber(index + 1);
      const disk = this.findDiskBySlotNumber(Number(dt.id), profile);
      dt.enabled = !!disk;
    });
  }

  setDisksDisabled(chassisView: ChassisView, profile: any) {
    chassisView.driveTrayObjects.forEach((dt, index) => {
      // const selectedEnclosure = this.getSelectedEnclosure();
      const disk = profile.disks[index];
      chassisView.events.next({ name: 'ChangeDriveTrayColor', data: { id: dt.id, color: 'none' } });
    });
  }

  setDisksHealthState(chassisView: ChassisView, profile: any, disk?: any) { // Give it a disk and it will only change that slot
    // const selectedEnclosure = this.getSelectedEnclosure();
    if (disk || typeof disk !== 'undefined') {
      this.setDiskHealthState(disk, chassisView);
      return;
    }

    profile.disks.forEach((disk, index) => {
      this.setDiskHealthState(disk, chassisView);
    });
  }

  setDiskHealthState(disk: any, chassisView: ChassisView, updateGL = false) {
    let index;
    const dt = chassisView.driveTrayObjects.filter((dto, i) => {
      const result = (dto.id == disk.enclosure.slot.toString());
      if (result) {
        index = i;
      }
      return result;
    })[0];
    if (!dt) {
      return;
    }
    chassisView.driveTrayObjects[index].enabled = !!disk.enclosure.slot;

    let failed = false;

    // Health based on disk.status
    if (disk && disk.status) {
      switch (disk.status) {
        case 'ONLINE':
          chassisView.events.next({ name: 'ChangeDriveTrayColor', data: { id: disk.enclosure.slot, color: this.theme.green } });
          break;
        case 'FAULT':
          failed = true;
          chassisView.events.next({ name: 'ChangeDriveTrayColor', data: { id: disk.enclosure.slot, color: this.theme.red } });
          break;
        case 'AVAILABLE':
          chassisView.events.next({ name: 'ChangeDriveTrayColor', data: { id: disk.enclosure.slot, color: '#999999' } });
          break;
        default:
          chassisView.events.next({ name: 'ChangeDriveTrayColor', data: { id: disk.enclosure.slot, color: this.theme.yellow } });
          break;
      }
    }

    // Also check slot status
    const elements = this.system.rearIndex && disk.enclosure.number == this.system.rearIndex ? this.system.enclosures[disk.enclosure.number].elements : this.system.enclosures[disk.enclosure.number].elements[0].elements;
    const slot = elements.filter((s) => s.slot == disk.enclosure.slot);

    if (!failed && slot.fault) {
      failed = true;
    }

    if (failed) {
      chassisView.events.next({ name: 'ChangeDriveTrayColor', data: { id: disk.enclosure.slot, color: this.theme.red } });
    }
  }

  getUnhealthyPools(profile: any) {
    const sickPools = [];
    const pools = this.system.pools.forEach((pool, index) => {
      const healthy = pool.healthy;
      const inCurrentEnclosure = index == profile.poolKeys[pool.name];
      if (!healthy && inCurrentEnclosure) {
        sickPools.push(pool);
      }
    });
    return sickPools;
  }

  getDiskFailures(chassisView: ChassisView, profile: any) {
    /* const failedDisks = [];
    //const selectedEnclosure = this.getSelectedEnclosure();

    const analyze = (disk, index) => {
      let failed = false;
      const reasons = [];

      // Health based on disk.status
      if (disk && disk.status && disk.status == 'FAULT') {
        failed = true;
        reasons.push("Disk Status is 'FAULT'");
      }

      // Also check slot status
      const elements = this.system.rearIndex && disk.enclosure.number == this.system.rearIndex ? this.system.enclosures[disk.enclosure.number].elements : this.system.enclosures[disk.enclosure.number].elements[0].elements;
      const slot = elements.filter((s) => s.slot == disk.enclosure.slot);

      if (!failed && slot.fault) {
        failed = true;
      }

      if (failed) {
        const location = this.view;
        const failure: DiskFailure = {
          disk: disk.name, enclosure: disk.enclosure.number, slot: disk.enclosure.slot, location,
        };
        failedDisks.push(failure);
      }
    };

    if (this.system.rearIndex !== undefined) {
      // If this is a head unit with rear bays, treat both enclosures as single unit
      this.system.profile[this.system.headIndex].disks.forEach((disk, index) => {
        analyze(disk, index);
      });

      this.system.profile[this.system.rearIndex].disks.forEach((disk, index) => {
        analyze(disk, index);
      });
    } else {
      profile.disks.forEach((disk, index) => {
        analyze(disk, index);
      });
    }

    this.failedDisks = failedDisks; */
  }

  findDiskBySlotNumber(slot: number, profile: any) {
    // const selectedEnclosure = this.getSelectedEnclosure();
    const disk = profile.disks.filter((d) => d.enclosure.slot == slot);

    if (disk.length > 0) {
      return disk[0];
    }
  }
}
