import {
  Component, ComponentRef, AfterViewInit, ViewChild, OnDestroy,
} from '@angular/core';
import { CoreServiceInjector } from 'app/core/services/coreserviceinjector';
import { Display } from 'app/core/components/display/display.component';
import { CoreService, CoreEvent } from 'app/core/services/core.service';
import { ViewController } from 'app/core/classes/viewcontroller';
import { LayoutContainer, LayoutChild } from 'app/core/classes/layouts';
import { Subject } from 'rxjs';

export const ViewControllerMetadata = {
  template: `
  <div 
  [fxLayout]="layoutContainer.layout" 
  [fxLayoutAlign]="layoutContainer.align" 
  [fxLayoutGap]="layoutContainer.gap"
  >
    <display style="display:none;" #display></display>
  </div>
  `,
  styles: [':host {display:block;}'],
};

export interface ViewConfig {
  componentName: any;
  componentData: any;
  controller?: Subject<any>;
}

@Component({
  selector: 'viewcontroller',
  template: ViewControllerMetadata.template,
  styles: ViewControllerMetadata.styles,
})
export class ViewControllerComponent extends ViewController implements AfterViewInit, OnDestroy {
  readonly componentName = ViewControllerComponent;
  @ViewChild('display', { static: true }) display;
  protected core: CoreService;
  controlEvents: Subject<CoreEvent> = new Subject();

  layoutContainer: LayoutContainer = { layout: 'row', align: 'space-between center', gap: '2%' };
  layoutChild?: LayoutChild;

  constructor() {
    super();
    this.core = CoreServiceInjector.get(CoreService);
  }

  ngAfterViewInit() {
  }

  ngOnDestroy() {
    this.core.unregister({ observerClass: this });
  }

  create(component: any, container?: string) {
    if (!container) { container = 'display'; }
    const instance = this[container].create(component);
    return instance;
  }

  addChild(instance, container?: string) {
    if (!container) { container = 'display'; }
    this[container].addChild(instance);
  }

  removeChild(instance, container?: string) {
    if (!container) { container = 'display'; }
    this[container].removeChild(instance);
  }
}
