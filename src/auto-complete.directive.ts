import {
    AfterViewInit,
    ComponentFactoryResolver,
    ComponentRef,
    Directive,
    EventEmitter,
    Host,
    Input,
    OnChanges, OnDestroy,
    OnInit,
    Optional,
    Output,
    SimpleChanges,
    SkipSelf,
    ViewContainerRef
} from '@angular/core';
import { NguiAutoCompleteComponent } from './auto-complete.component';
import {
    AbstractControl,
    ControlContainer,
    FormControl,
    FormGroup,
    FormGroupName
} from '@angular/forms';

/**
 * display auto-complete section with input and dropdown list when it is clicked
 */
@Directive({
    selector: '[auto-complete], [ngui-auto-complete]'
})
export class NguiAutoCompleteDirective implements OnInit, OnChanges, AfterViewInit, OnDestroy {

    private static setAdditionalAttributes(el: HTMLElement) {
        el.setAttribute('role', 'combobox');
        el.setAttribute('aria-autocomplete', 'list');
        el.setAttribute('aria-haspopup', 'true');
    }

    @Input('autocomplete') public autocomplete = false;
    @Input('auto-complete-placeholder') public autoCompletePlaceholder: string;
    @Input('source') public source: any;
    @Input('path-to-data') public pathToData: string;
    @Input('min-chars') public minChars: number;
    @Input('display-property-name') public displayPropertyName: string;
    @Input('accept-user-input') public acceptUserInput: boolean = true;
    @Input('max-num-list') public maxNumList: string;
    @Input('select-value-of') public selectValueOf: string;
    @Input('loading-template') public loadingTemplate = null;
    @Input('list-formatter') public listFormatter;
    @Input('loading-text') public loadingText: string = 'Loading';
    @Input('blank-option-text') public blankOptionText: string;
    @Input('no-match-found-text') public noMatchFoundText: string;
    @Input('value-formatter') public valueFormatter: any;
    @Input('tab-to-select') public tabToSelect: boolean = true;
    @Input('select-on-blur') public selectOnBlur: boolean = false;
    @Input('match-formatted') public matchFormatted: boolean = false;
    @Input('auto-select-first-item') public autoSelectFirstItem: boolean = false;
    @Input('open-on-focus') public openOnFocus: boolean = true;
    @Input('close-on-focusout') public closeOnFocusOut: boolean = true;
    @Input('re-focus-after-select') public reFocusAfterSelect: boolean = true;
    @Input('header-item-template') public headerItemTemplate = null;
    @Input('ignore-accents') public ignoreAccents: boolean = true;
    @Input('component-id') componentId: string = 'autocompleter';

    @Input() public ngModel: string;
    @Input('formControlName') public formControlName: string;
    // if [formControl] is used on the anchor where our directive is sitting
    // a form is not necessary to use a formControl we should also support this
    @Input('formControl') public extFormControl: FormControl;
    @Input('z-index') public zIndex: string = '1';
    @Input('is-rtl') public isRtl: boolean = false;

    @Output() public ngModelChange = new EventEmitter();
    @Output() public valueChanged = new EventEmitter();
    @Output() public customSelected = new EventEmitter();

    private componentRef: ComponentRef<NguiAutoCompleteComponent>;
    private wrapperEl: HTMLElement;
    private el: HTMLElement;   // this element element, can be any
    private acDropdownEl: HTMLElement; // auto complete element
    private inputEl: HTMLInputElement;  // input element of this element
    private formControl: AbstractControl;
    private revertValue: any;
    private dropdownJustHidden: boolean;
    private scheduledBlurHandler: any;
    private documentClickListener: (e: MouseEvent) => any;

    constructor(private resolver: ComponentFactoryResolver,
                public  viewContainerRef: ViewContainerRef,
                @Optional() @Host() @SkipSelf() private parentForm: ControlContainer) {
        this.el = this.viewContainerRef.element.nativeElement;
        NguiAutoCompleteDirective.setAdditionalAttributes(this.el);
    }

    ngOnInit(): void {
        // Blur event is handled only after a click event. This is to prevent handling of blur events resulting from interacting with a scrollbar
        // introduced by content overflow (Internet explorer issue).
        // See issue description here: http://stackoverflow.com/questions/2023779/clicking-on-a-divs-scroll-bar-fires-the-blur-event-in-ie
        this.documentClickListener = (e) => {
            if (this.scheduledBlurHandler) {
                this.scheduledBlurHandler();
                this.scheduledBlurHandler = null;
            }
        };

        document.addEventListener('click', this.documentClickListener);
        // wrap this element with <div class="ngui-auto-complete">
        this.wrapperEl = document.createElement('div');
        this.wrapperEl.className = 'ngui-auto-complete-wrapper';
        this.wrapperEl.style.position = 'relative';
        this.el.parentElement.insertBefore(this.wrapperEl, this.el.nextSibling);
        this.wrapperEl.appendChild(this.el);

        // Check if we were supplied with a [formControlName] and it is inside a [form]
        // else check if we are supplied with a [FormControl] regardless if it is inside a [form] tag
        if (this.parentForm && this.formControlName) {
            if (this.parentForm['form']) {
                this.formControl = (this.parentForm['form'] as FormGroup).get(this.formControlName);
            } else if (this.parentForm instanceof FormGroupName) {
                this.formControl = (this.parentForm as FormGroupName).control.controls[this.formControlName];
            }
        } else if (this.extFormControl) {
            this.formControl = this.extFormControl;
        }

        // apply toString() method for the object
        if (!!this.ngModel) {
            this.selectNewValue(this.ngModel);
        } else if (!!this.formControl && this.formControl.value) {
            this.selectNewValue(this.formControl.value);
        }

    }

    ngAfterViewInit() {
        // if this element is not an input tag, move dropdown after input tag
        // so that it displays correctly
        this.inputEl = this.el.tagName === 'INPUT' ? this.el as HTMLInputElement : this.el.querySelector('input');

        if (this.openOnFocus) {
            this.inputEl.addEventListener('focus', (e) => this.showAutoCompleteDropdown(e));
        }

        if (this.closeOnFocusOut) {
            this.inputEl.addEventListener('focusout', (e) => this.hideAutoCompleteDropdown(e));
        }

        if (!this.autocomplete) {
            this.inputEl.setAttribute('autocomplete', 'off');
        }
        this.inputEl.addEventListener('blur', (e) => {
            this.scheduledBlurHandler = () => {
                return this.blurHandler(e);
            };
        });
        this.inputEl.addEventListener('keydown', (e) => this.keydownEventHandler(e));
        this.inputEl.addEventListener('input', (e) => this.inputEventHandler(e));
    }

    ngOnDestroy(): void {
        if (this.componentRef) {
            this.componentRef.instance.valueSelected.unsubscribe();
            this.componentRef.instance.textEntered.unsubscribe();
        }
        if (this.documentClickListener) {
            document.removeEventListener('click', this.documentClickListener);
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['ngModel']) {
            this.ngModel = this.setToStringFunction(changes['ngModel'].currentValue);
            this.renderValue(this.ngModel);
        }
    }

    // show auto-complete list below the current element
    public showAutoCompleteDropdown = (event?: any): void => {
        if (this.dropdownJustHidden) {
            return;
        }
        this.hideAutoCompleteDropdown();
        this.scheduledBlurHandler = null;

        const factory = this.resolver.resolveComponentFactory(NguiAutoCompleteComponent);

        this.componentRef = this.viewContainerRef.createComponent(factory);

        const component = this.componentRef.instance;
        component.keyword = this.inputEl.value;
        component.showInputTag = false; // Do NOT display autocomplete input tag separately

        component.pathToData = this.pathToData;
        component.minChars = this.minChars;
        component.source = this.source;
        component.placeholder = this.autoCompletePlaceholder;
        component.acceptUserInput = this.acceptUserInput;
        component.maxNumList = parseInt(this.maxNumList, 10);

        component.loadingText = this.loadingText;
        component.loadingTemplate = this.loadingTemplate;
        component.listFormatter = this.listFormatter;
        component.blankOptionText = this.blankOptionText;
        component.noMatchFoundText = this.noMatchFoundText;
        component.tabToSelect = this.tabToSelect;
        component.selectOnBlur = this.selectOnBlur;
        component.matchFormatted = this.matchFormatted;
        component.autoSelectFirstItem = this.autoSelectFirstItem;
        component.headerItemTemplate = this.headerItemTemplate;
        component.ignoreAccents = this.ignoreAccents;
        component.componentId = this.componentId;

        component.valueSelected.subscribe(this.selectNewValue);
        component.textEntered.subscribe(this.enterNewText);
        component.customSelected.subscribe(this.selectCustomValue);
        component.currentItemIndex.subscribe(this.setCurrentItemIndex);

        this.acDropdownEl = this.componentRef.location.nativeElement;
        this.acDropdownEl.style.display = 'none';

        // if this element is not an input tag, move dropdown after input tag
        // so that it displays correctly
        if (this.el.tagName !== 'INPUT' && this.acDropdownEl) {
            this.inputEl.parentElement.insertBefore(this.acDropdownEl, this.inputEl.nextSibling);
        }
        this.revertValue = typeof this.ngModel !== 'undefined' ? this.ngModel : this.inputEl.value;

        setTimeout(() => {
            component.reloadList(this.inputEl.value);
            this.styleAutoCompleteDropdown();
            component.dropdownVisible = true;
        });
    }

    public blurHandler(event: any) {
        if (this.componentRef) {
            const component = this.componentRef.instance;

            if (this.selectOnBlur) {
                component.selectOne(component.filteredList[component.itemIndex]);
            }

            if (this.closeOnFocusOut) {
                this.hideAutoCompleteDropdown(event);
            }
        }
    }

    public hideAutoCompleteDropdown = (event?: any): void => {
        if (this.componentRef) {
            let currentItem: any;
            const hasRevertValue = (typeof this.revertValue !== 'undefined');
            if (this.inputEl && hasRevertValue && this.acceptUserInput === false) {
                currentItem = this.componentRef.instance.findItemFromSelectValue(this.inputEl.value);
            }
            this.componentRef.destroy();
            this.componentRef = undefined;

            if (this.inputEl && hasRevertValue && this.acceptUserInput === false && currentItem === null) {
                this.selectNewValue(this.revertValue);
            } else if (this.inputEl && this.acceptUserInput === true && typeof currentItem === 'undefined' && event && event.target.value) {
                this.enterNewText(event.target.value);
            }
        }
        this.dropdownJustHidden = true;
        setTimeout(() => this.dropdownJustHidden = false, 100);
    }

    public styleAutoCompleteDropdown = () => {
        if (this.componentRef) {
            const component = this.componentRef.instance;

            /* setting width/height auto complete */
            const thisElBCR = this.el.getBoundingClientRect();
            const thisInputElBCR = this.inputEl.getBoundingClientRect();
            const closeToBottom = thisInputElBCR.bottom + 100 > window.innerHeight;
            const directionOfStyle = this.isRtl ? 'right' : 'left';

            this.acDropdownEl.style.width = thisInputElBCR.width + 'px';
            this.acDropdownEl.style.position = 'absolute';
            this.acDropdownEl.style.zIndex = this.zIndex;
            this.acDropdownEl.style[directionOfStyle] = '0';
            this.acDropdownEl.style.display = 'inline-block';

            if (closeToBottom) {
                this.acDropdownEl.style.bottom = `${thisInputElBCR.height}px`;
            } else {
                this.acDropdownEl.style.top = `${thisInputElBCR.height}px`;
            }
        }
    }

    public setToStringFunction(item: any): any {
        if (item && typeof item === 'object') {
            let displayVal;

            if (typeof this.valueFormatter === 'string') {
                const matches = this.valueFormatter.match(/[a-zA-Z0-9_\$]+/g);
                let formatted = this.valueFormatter;
                if (matches && typeof item !== 'string') {
                    matches.forEach((key) => {
                        formatted = formatted.replace(key, item[key]);
                    });
                }
                displayVal = formatted;
            } else if (typeof this.valueFormatter === 'function') {
                displayVal = this.valueFormatter(item);
            } else if (this.displayPropertyName) {
                displayVal = item[this.displayPropertyName];
            } else if (typeof this.listFormatter === 'string' && this.listFormatter.match(/^\w+$/)) {
                displayVal = item[this.listFormatter];
            } else {
                displayVal = item.value;
            }
            item.toString = () => displayVal;
        }
        return item;
    }

    public selectNewValue = (item: any) => {
        // make displayable value
        if (item && typeof item === 'object') {
            item = this.setToStringFunction(item);
        }

        this.renderValue(item);

        // make return value
        let val = item;
        if (this.selectValueOf && item[this.selectValueOf]) {
            val = item[this.selectValueOf];
        }
        if ((this.parentForm && this.formControlName) || this.extFormControl) {
            if (!!val) {
                this.formControl.patchValue(val);
            }
        }
        if (val !== this.ngModel) {
            this.ngModelChange.emit(val);
        }
        this.valueChanged.emit(val);
        this.hideAutoCompleteDropdown();
        setTimeout(() => {
            if (this.reFocusAfterSelect) {
                this.inputEl.focus();
            }

            return this.inputEl;
        });
    }

    public selectCustomValue = (text: string) => {
        this.customSelected.emit(text);
        this.hideAutoCompleteDropdown();
        setTimeout(() => {
            if (this.reFocusAfterSelect) {
                this.inputEl.focus();
            }

            return this.inputEl;
        });
    }

    public enterNewText = (value: any) => {
        this.renderValue(value);
        this.ngModelChange.emit(value);
        this.valueChanged.emit(value);
        this.hideAutoCompleteDropdown();
    }

    setCurrentItemIndex = (itemIndex: number) => {
        this.el.setAttribute('aria-activedescendant', this.componentId + '-selectedId-' + itemIndex);
    }

    private keydownEventHandler = (evt: any) => {
        if (this.componentRef) {
            const component = this.componentRef.instance;
            component.inputElKeyHandler(evt);
        }
    }

    private inputEventHandler = (evt: any) => {
        if (this.componentRef) {
            const component = this.componentRef.instance;
            component.dropdownVisible = true;
            component.keyword = evt.target.value;
            component.reloadListInDelay(evt);
        } else {
            this.showAutoCompleteDropdown();
        }
    }

    private renderValue(item: any) {
        if (!!this.inputEl) {
            this.inputEl.value = '' + item;
        }
    }
}
