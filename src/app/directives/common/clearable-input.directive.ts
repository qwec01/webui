import { Directive, ElementRef, OnInit, Renderer2, OnDestroy, HostListener } from '@angular/core';
import { MatRipple } from '@angular/material/core';

@Directive({ selector: '[clearableInput]', providers: [ MatRipple ] })
export class ClearableInputDirective implements OnInit, OnDestroy {
  buttonEventListener: Function;
  button: any;
  
  constructor(private renderer: Renderer2, private el: ElementRef, private ripple: MatRipple) {
    this.button = this.renderer.createElement('button');
  }
  
  @HostListener('input', [ '$event' ]) onInput($event): void {
    console.log('HostListener', $event.target.value, $event.data);
    if ($event.target.value) {
      this.renderer.removeAttribute(this.button, 'hidden');  
    } else {
      this.renderer.setAttribute(this.button, 'hidden', 'true');
    }
  }
  
  ngOnInit() {
    this.appendClearButton();
    this.attachEventListener();
  }
  
  attachEventListener() {
    this.buttonEventListener = this.renderer.listen(this.button, 'click', (event) => {
      this.ripple.launch(event.x, event.y);
      this.el.nativeElement.value = '';
      this.renderer.setAttribute(this.button, 'hidden', 'true');
      this.el.nativeElement.focus();
      console.log('click on button', event, this.el.nativeElement.value);
    })
  }
  
  appendClearButton() {
    const clearIcon = this.renderer.createElement('i');
    this.renderer.addClass(clearIcon, 'mdi');
    this.renderer.addClass(clearIcon, 'mdi-close-circle');
    this.renderer.appendChild(this.button, clearIcon);
    
    this.renderer.addClass(this.button, 'clear_input');
    this.renderer.setAttribute(this.button, 'type', 'button');
    
    const parent = this.renderer.parentNode(this.el.nativeElement);
    this.renderer.appendChild(parent, this.button);
  }
  
  ngOnDestroy() {
    this.buttonEventListener();
  }
}
